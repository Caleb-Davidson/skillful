/**
 * Interactive (stdin/stdout) driver for `skillful sync`.
 * Kept out of cli.tsx so the TUI path stays focused.
 */
import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ProjectContext, StoreItemMeta, TargetId } from "./types.js";
import type { TargetAdapter, SyncCategory } from "./targets/shared.js";
import { buildSyncPlan, executeMirrors, type SyncPlan, type SyncPlanItem } from "./sync.js";
import { convertAgent } from "./agent-format.js";

export interface SyncCliOptions {
  yes: boolean;
  dryRun: boolean;
}

interface AdapterMap {
  get(id: TargetId): TargetAdapter;
}

export async function runSync(
  targetIds: TargetId[],
  ctx: ProjectContext,
  storeIndex: StoreItemMeta[],
  adapters: AdapterMap,
  options: SyncCliOptions
): Promise<number> {
  const plan = buildSyncPlan(targetIds, ctx, storeIndex, adapters);

  printHeader(targetIds, adapters, ctx);
  printSkips(plan, adapters);
  printConflicts(plan);

  if (plan.mirrors.length === 0) {
    console.log("\nNo additive mirrors needed.");
    return plan.conflicts.length > 0 ? 2 : 0;
  }

  const groups = groupMirrors(plan.mirrors);

  const approved: SyncPlanItem[] = [];

  // The flow is batched per (category × direction). For each batch the user
  // sees the affected items, any conversion warnings, and confirms once.
  for (const group of groups) {
    printGroup(group, adapters);
    let decision: "yes" | "no";
    if (options.yes) {
      decision = "yes";
    } else {
      decision = await promptBatch(group);
    }
    if (decision === "yes") {
      approved.push(...group.mirrors);
    } else {
      console.log(`  skipped (${group.mirrors.length} item${group.mirrors.length === 1 ? "" : "s"})`);
    }
  }

  if (approved.length === 0) {
    console.log("\nNothing applied.");
    return plan.conflicts.length > 0 ? 2 : 0;
  }

  if (options.dryRun) {
    console.log(`\nDry run: ${approved.length} mirror${approved.length === 1 ? "" : "s"} would be applied. No files written.`);
    return plan.conflicts.length > 0 ? 2 : 0;
  }

  console.log(`\nApplying ${approved.length} mirror${approved.length === 1 ? "" : "s"}...`);
  const result = executeMirrors(approved, ctx, adapters);
  for (const failure of result.failed) {
    console.error(`  FAILED ${failure.mirror.category}:${failure.mirror.id} → ${failure.mirror.toTarget}: ${failure.error}`);
  }
  console.log(`Applied ${result.applied}/${approved.length}.`);

  if (plan.conflicts.length > 0) {
    console.log(`\nNote: ${plan.conflicts.length} conflict${plan.conflicts.length === 1 ? "" : "s"} reported above were NOT written. Resolve by hand and re-run.`);
    return 2;
  }
  return result.failed.length > 0 ? 1 : 0;
}

// ── Display ─────────────────────────────────────────────────────────────────

function printHeader(targetIds: TargetId[], adapters: AdapterMap, ctx: ProjectContext): void {
  const labels = targetIds.map((id) => adapters.get(id).label).join(" + ");
  const where = ctx.projectName ?? ctx.projectDir ?? "(project)";
  console.log(`skillful sync — ${where} [${labels}]`);
}

function printSkips(plan: SyncPlan, adapters: AdapterMap): void {
  if (plan.skips.length === 0) return;
  console.log("\nSkipped:");
  for (const skip of plan.skips) {
    const label = adapters.get(skip.targetId).label;
    console.log(`  - [${skip.category}/${label}] ${skip.reason}`);
  }
}

function printConflicts(plan: SyncPlan): void {
  if (plan.conflicts.length === 0) return;
  console.log("\nConflicts (refused — content disagrees across targets):");
  for (const conflict of plan.conflicts) {
    console.log(`  - ${conflict.category}:${conflict.id}`);
    for (const dt of conflict.divergentTargets) {
      console.log(`      ${dt.targetId}: ${dt.path}`);
    }
  }
}

interface MirrorGroup {
  category: SyncCategory;
  fromTarget: TargetId;
  toTarget: TargetId;
  hasConversion: boolean;
  mirrors: SyncPlanItem[];
}

function groupMirrors(mirrors: SyncPlanItem[]): MirrorGroup[] {
  const map = new Map<string, MirrorGroup>();
  for (const mirror of mirrors) {
    const key = `${mirror.category}|${mirror.fromTarget}|${mirror.toTarget}`;
    let group = map.get(key);
    if (!group) {
      group = {
        category: mirror.category,
        fromTarget: mirror.fromTarget,
        toTarget: mirror.toTarget,
        hasConversion: false,
        mirrors: [],
      };
      map.set(key, group);
    }
    group.mirrors.push(mirror);
    if (mirror.conversion) group.hasConversion = true;
  }
  return Array.from(map.values());
}

function printGroup(group: MirrorGroup, adapters: AdapterMap): void {
  const from = adapters.get(group.fromTarget).label;
  const to = adapters.get(group.toTarget).label;
  const count = group.mirrors.length;
  const word = count === 1 ? group.category : `${group.category}s`;
  console.log(`\n${count} ${word} to mirror: ${from} → ${to}${group.hasConversion ? " (with format conversion)" : ""}`);
  for (const mirror of group.mirrors) {
    const arrow = mirror.conversion ? ` [${mirror.conversion.from} → ${mirror.conversion.to}]` : "";
    console.log(`  - ${mirror.id}${arrow}`);
  }
  const warnings = group.mirrors.flatMap((m) => m.warnings);
  if (warnings.length > 0) {
    console.log("  warnings:");
    for (const w of warnings) console.log(`    ! ${w}`);
  }
}

// ── Prompting ───────────────────────────────────────────────────────────────

async function promptBatch(group: MirrorGroup): Promise<"yes" | "no"> {
  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      const answer = (await rl.question("  Apply this batch? [y/N/d=diff] ")).trim().toLowerCase();
      if (answer === "y" || answer === "yes") return "yes";
      if (answer === "" || answer === "n" || answer === "no") return "no";
      if (answer === "d" || answer === "diff") {
        printDiff(group);
        continue;
      }
      console.log("  enter 'y', 'n', or 'd'");
    }
  } finally {
    rl.close();
  }
}

function printDiff(group: MirrorGroup): void {
  for (const mirror of group.mirrors) {
    console.log(`\n  --- ${mirror.id} ---`);
    const raw = fs.readFileSync(mirror.sourcePath, "utf-8");
    let preview = raw;
    if (mirror.conversion) {
      const result = convertAgent(raw, mirror.conversion.from, mirror.conversion.to, {
        fromTarget: mirror.fromTarget,
        toTarget: mirror.toTarget,
        id: mirror.id,
      });
      preview = result.output;
      console.log(`  (after ${mirror.conversion.from} → ${mirror.conversion.to} conversion)`);
    }
    const lines = preview.split("\n").slice(0, 40);
    for (const line of lines) console.log(`    ${line}`);
    if (preview.split("\n").length > 40) {
      console.log("    … (truncated; open the file to see the rest)");
    }
  }
}
