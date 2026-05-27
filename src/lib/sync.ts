/**
 * Sync engine: discover user-authored custom items in a multi-target project,
 * detect content conflicts, and plan additive mirrors across configured targets.
 *
 * Out of scope for v1: MCP and provider categories, JSON-installed customs,
 * deletion/rename propagation. See docs/Sync.md.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ProjectContext, StoreItemMeta, TargetId } from "./types.js";
import type { TargetAdapter, SyncCategory } from "./targets/shared.js";
import { convertAgent, parseAgent, type AgentFormat } from "./agent-format.js";

const SYNC_CATEGORIES: SyncCategory[] = ["agent", "command", "skill"];

export interface SyncPlanItem {
  category: SyncCategory;
  id: string;
  fromTarget: TargetId;
  toTarget: TargetId;
  /** Source file/dir path (so the engine can re-read at execute time). */
  sourcePath: string;
  /** Source format for agents. */
  sourceFormat?: AgentFormat;
  /** When set, agent conversion is needed and the destination format. */
  conversion?: { from: AgentFormat; to: AgentFormat };
  /** Per-item warnings raised during planning (e.g. tools/model carry-over). */
  warnings: string[];
}

export interface SyncConflict {
  category: SyncCategory;
  id: string;
  /** Targets that have this item with diverging content. */
  divergentTargets: { targetId: TargetId; path: string }[];
}

export interface SyncSkip {
  category: SyncCategory;
  targetId: TargetId;
  reason: string;
}

export interface SyncPlan {
  mirrors: SyncPlanItem[];
  conflicts: SyncConflict[];
  /** Target/category combinations excluded from sync (with reason). */
  skips: SyncSkip[];
}

interface AdapterMap {
  get(id: TargetId): TargetAdapter;
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fingerprintCommand(filePath: string): string {
  const raw = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n").trimEnd();
  return hash(raw);
}

function fingerprintAgent(filePath: string, format: AgentFormat): string {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = parseAgent(raw, format);
  // Cross-format compare on normalized parsed shape (fields sorted, body trimmed).
  const normalized = {
    fields: sortKeys(parsed.fields),
    body: parsed.body.replace(/\r\n/g, "\n").trim(),
  };
  return hash(JSON.stringify(normalized));
}

function fingerprintSkillDir(dirPath: string): string {
  const entries: { rel: string; content: string }[] = [];
  function walk(currentDir: string, prefix: string): void {
    for (const item of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const full = path.join(currentDir, item.name);
      const rel = prefix === "" ? item.name : `${prefix}/${item.name}`;
      if (item.isDirectory()) {
        walk(full, rel);
      } else if (item.isFile()) {
        entries.push({ rel, content: fs.readFileSync(full, "utf-8").replace(/\r\n/g, "\n") });
      }
    }
  }
  walk(dirPath, "");
  entries.sort((a, b) => a.rel.localeCompare(b.rel));
  return hash(JSON.stringify(entries));
}

function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map((x) => sortKeys(x));
  if (obj && typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

/**
 * Build a complete sync plan: which mirrors to apply, which conflicts to
 * report, which (target × category) combinations to skip with a notice.
 */
export function buildSyncPlan(
  targetIds: TargetId[],
  ctx: ProjectContext,
  storeIndex: StoreItemMeta[],
  adapters: AdapterMap
): SyncPlan {
  const storeIds: Record<SyncCategory, Set<string>> = {
    agent: new Set(),
    command: new Set(),
    skill: new Set(),
  };
  for (const item of storeIndex) {
    if (item.type === "agent" || item.type === "command" || item.type === "skill") {
      storeIds[item.type].add(item.id);
    }
  }

  const mirrors: SyncPlanItem[] = [];
  const conflicts: SyncConflict[] = [];
  const skips: SyncSkip[] = [];

  for (const category of SYNC_CATEGORIES) {
    // Determine which configured targets participate in this category.
    const participating: TargetId[] = [];
    for (const id of targetIds) {
      const adapter = adapters.get(id);
      const support = adapter.syncSupport?.(category, ctx) ?? { ok: false, notice: `${adapter.label} sync not implemented.` };
      if (support.ok) {
        participating.push(id);
      } else {
        skips.push({ category, targetId: id, reason: support.notice ?? `${adapter.label} does not participate.` });
      }
    }

    if (participating.length < 2) {
      // Nothing to mirror in this category — only zero or one participating target.
      continue;
    }

    // Gather installed artifacts per participating target, excluding store ids.
    type Slot = { path: string; format?: AgentFormat; fingerprint: string };
    const byId = new Map<string, Map<TargetId, Slot>>();

    for (const targetId of participating) {
      const adapter = adapters.get(targetId);
      const artifacts = adapter.listInstalledArtifacts?.(category, ctx) ?? [];
      for (const art of artifacts) {
        if (storeIds[category].has(art.id)) continue; // store items are not "custom"
        const fp = computeFingerprint(category, art.path, art.format);
        let slot = byId.get(art.id);
        if (!slot) {
          slot = new Map();
          byId.set(art.id, slot);
        }
        slot.set(targetId, { path: art.path, format: art.format, fingerprint: fp });
      }
    }

    // Classify each id group.
    for (const [id, slots] of byId.entries()) {
      const fingerprints = new Set(Array.from(slots.values()).map((s) => s.fingerprint));

      if (fingerprints.size > 1) {
        // Content divergence — refuse + report regardless of coverage.
        conflicts.push({
          category,
          id,
          divergentTargets: Array.from(slots.entries()).map(([targetId, slot]) => ({ targetId, path: slot.path })),
        });
        continue;
      }

      // All known copies agree. Determine which participating targets are missing it.
      const missing = participating.filter((t) => !slots.has(t));
      if (missing.length === 0) continue;

      // Pick a source: first participating target that has the item (stable order).
      const sourceTarget = participating.find((t) => slots.has(t))!;
      const sourceSlot = slots.get(sourceTarget)!;

      for (const toTarget of missing) {
        const destAdapter = adapters.get(toTarget);
        const item: SyncPlanItem = {
          category,
          id,
          fromTarget: sourceTarget,
          toTarget,
          sourcePath: sourceSlot.path,
          sourceFormat: sourceSlot.format,
          warnings: [],
        };

        if (category === "agent" && sourceSlot.format && destAdapter.agentFormat && sourceSlot.format !== destAdapter.agentFormat) {
          item.conversion = { from: sourceSlot.format, to: destAdapter.agentFormat };
          // Pre-compute conversion warnings now so the user sees them before confirming.
          const raw = fs.readFileSync(sourceSlot.path, "utf-8");
          const result = convertAgent(raw, sourceSlot.format, destAdapter.agentFormat, {
            fromTarget: sourceTarget,
            toTarget,
            id,
          });
          item.warnings.push(...result.warnings);
        }

        mirrors.push(item);
      }
    }
  }

  return { mirrors, conflicts, skips };
}

function computeFingerprint(category: SyncCategory, artifactPath: string, format?: AgentFormat): string {
  if (category === "skill") return fingerprintSkillDir(artifactPath);
  if (category === "agent") return fingerprintAgent(artifactPath, format ?? "md");
  return fingerprintCommand(artifactPath);
}

export interface ExecuteResult {
  applied: number;
  failed: { mirror: SyncPlanItem; error: string }[];
}

/**
 * Apply the planned mirrors. The caller is responsible for prompting the user
 * and only passing in mirrors they've approved.
 */
export function executeMirrors(
  mirrors: SyncPlanItem[],
  ctx: ProjectContext,
  adapters: AdapterMap
): ExecuteResult {
  const failed: ExecuteResult["failed"] = [];
  let applied = 0;

  for (const mirror of mirrors) {
    try {
      const destAdapter = adapters.get(mirror.toTarget);
      if (mirror.category === "skill") {
        destAdapter.installArtifact?.({ id: mirror.id, type: "skill", srcDir: mirror.sourcePath }, ctx);
      } else if (mirror.category === "command") {
        const raw = fs.readFileSync(mirror.sourcePath, "utf-8");
        destAdapter.installArtifact?.({ id: mirror.id, type: "command", content: raw }, ctx);
      } else {
        // agent — may need conversion
        let content = fs.readFileSync(mirror.sourcePath, "utf-8");
        if (mirror.conversion) {
          const result = convertAgent(content, mirror.conversion.from, mirror.conversion.to, {
            fromTarget: mirror.fromTarget,
            toTarget: mirror.toTarget,
            id: mirror.id,
          });
          content = result.output;
        }
        destAdapter.installArtifact?.(
          { id: mirror.id, type: "agent", content, agentFormat: mirror.conversion?.to ?? mirror.sourceFormat },
          ctx
        );
      }
      applied += 1;
    } catch (err) {
      failed.push({ mirror, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { applied, failed };
}
