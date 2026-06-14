// Item command family for the Agent CLI.
//
// Four verbs (list / info / install / remove) over the six item types
// (agent, command, skill, provider, mcp, config) — 24 thin handlers generated
// from a single type table. Each handler resolves the explicit-flag contract
// (--scope + --target, project context), loads the merged index once, calls an
// existing target-manager function, and projects the result to the stable
// envelope `data` shape. No new domain logic lives here.

import { loadMergedIndexFromConfiguredSources } from "../../source-sync.js";
import {
  buildStoreViewForTargets,
  eligibleTargetsForItem,
  getInstalledStateForTargets,
  initAdapters,
  installItemForTarget,
  uninstallItemForTarget,
} from "../../target-manager.js";
import type { ProjectContext, StoreItemMeta, StoreItemType, StoreView, TargetId } from "../../types.js";
import { projectItem } from "../output.js";
import { requireScope, requireTargets, resolveProjectContext } from "../resolve.js";
import { CliError } from "../types.js";
import type { CommandContext, CommandDef, CommandResult } from "../types.js";

/** A target that could not receive the item, with a human-readable reason. */
interface SkippedTarget {
  targetId: TargetId;
  reason: string;
}

/** A target whose install/uninstall threw, with the error message. */
interface FailedTarget {
  targetId: TargetId;
  error: string;
}

/**
 * The type table that drives command generation.
 *   type    — singular noun used by info/install/remove and echoed in results
 *   plural  — noun matched by `list <plural>`
 *   viewKey — the StoreView field holding that category
 */
interface TypeRow {
  type: StoreItemType;
  plural: string;
  viewKey: keyof Pick<StoreView, "agents" | "commands" | "skills" | "providers" | "mcps" | "configs">;
}

const TYPE_TABLE: TypeRow[] = [
  { type: "agent", plural: "agents", viewKey: "agents" },
  { type: "command", plural: "commands", viewKey: "commands" },
  { type: "skill", plural: "skills", viewKey: "skills" },
  { type: "provider", plural: "providers", viewKey: "providers" },
  { type: "mcp", plural: "mcps", viewKey: "mcps" },
  { type: "config", plural: "configs", viewKey: "configs" },
];

/** Resolved, validated invocation shared by every item command. */
interface ResolvedContext {
  scope: ReturnType<typeof requireScope>;
  targets: TargetId[];
  projectCtx: ProjectContext;
  items: StoreItemMeta[];
}

/**
 * The shared resolution sequence: validate flags BEFORE any index load or write
 * (a usage error never touches disk), preload the requested adapters (required
 * before any buildStoreView/install/getInstalledState call), then load the
 * merged index once.
 */
async function resolve(ctx: CommandContext): Promise<ResolvedContext> {
  const scope = requireScope(ctx.flags);
  const targets = requireTargets(ctx.flags);
  const projectCtx = resolveProjectContext(scope, ctx.flags);
  await initAdapters(targets);
  const { index } = await loadMergedIndexFromConfiguredSources();
  return { scope, targets, projectCtx, items: index.items };
}

/** The echoed context every result carries, so the caller can verify intent. */
function echo(resolved: ResolvedContext): {
  scope: ReturnType<typeof requireScope>;
  projectDir: string | null;
  projectName: string | null;
} {
  return {
    scope: resolved.scope,
    projectDir: resolved.projectCtx.projectDir ?? null,
    projectName: resolved.projectCtx.projectName ?? null,
  };
}

/** Read the first positional as a required item id, else a USAGE error. */
function requireItemId(ctx: CommandContext, type: StoreItemType, verb: string): string {
  const id = ctx.positionals[0];
  if (!id || id.trim().length === 0) {
    throw new CliError("USAGE", `${verb} ${type} requires an <id>: \`${verb} ${type} <id> --scope <s> --target <t>\`.`);
  }
  return id;
}

/** Find the raw StoreItemMeta for `(type, id)` (carries sourceRoot/path for install). */
function findItem(items: StoreItemMeta[], type: StoreItemType, id: string): StoreItemMeta | undefined {
  return items.find((i) => i.type === type && i.id === id);
}

/**
 * Build the `skipped` list: requested targets that are NOT eligible for the
 * item. The reason is pulled from the per-target rollup (the not-eligible
 * entries carry a `supportReason` from the adapter — e.g. "Codex does not
 * support 'command' items."), falling back to a generic message.
 */
function buildSkipped(
  item: StoreItemMeta,
  requested: TargetId[],
  eligible: TargetId[],
  projectCtx: ProjectContext,
  type: StoreItemType
): SkippedTarget[] {
  const notEligible = requested.filter((t) => !eligible.includes(t));
  if (notEligible.length === 0) return [];

  const perTarget = getInstalledStateForTargets(item, requested, projectCtx).perTarget ?? [];
  return notEligible.map((targetId) => {
    const entry = perTarget.find((p) => p.targetId === targetId);
    const reason = entry?.state.supportReason ?? `${targetId} does not support '${type}' items.`;
    return { targetId, reason };
  });
}

// ── list <plural> ──

function makeListCommand(row: TypeRow): CommandDef {
  return {
    verb: "list",
    noun: row.plural,
    summary: `List ${row.plural} available across the requested targets.`,
    async run(ctx): Promise<CommandResult> {
      const resolved = await resolve(ctx);
      const view = buildStoreViewForTargets(resolved.items, resolved.targets, resolved.projectCtx);
      const rows = view[row.viewKey];
      return {
        data: {
          ...echo(resolved),
          targets: resolved.targets,
          type: row.type,
          count: rows.length,
          items: rows.map(projectItem),
        },
      };
    },
  };
}

// ── info <singular> <id> ──

function makeInfoCommand(row: TypeRow): CommandDef {
  return {
    verb: "info",
    noun: row.type,
    summary: `Show one ${row.type} with its per-target install state.`,
    async run(ctx): Promise<CommandResult> {
      const resolved = await resolve(ctx);
      const id = requireItemId(ctx, row.type, "info");
      const view = buildStoreViewForTargets(resolved.items, resolved.targets, resolved.projectCtx);
      const found = view[row.viewKey].find((i) => i.id === id);
      if (!found) {
        throw new CliError("ITEM_NOT_FOUND", `No ${row.type} with id '${id}' in configured sources.`, {
          type: row.type,
          id,
        });
      }
      return {
        data: {
          ...echo(resolved),
          targets: resolved.targets,
          item: projectItem(found),
        },
      };
    },
  };
}

// ── install <singular> <id> ──

function makeInstallCommand(row: TypeRow): CommandDef {
  return {
    verb: "install",
    noun: row.type,
    summary: `Install one ${row.type} into the requested targets.`,
    async run(ctx): Promise<CommandResult> {
      const resolved = await resolve(ctx);
      const id = requireItemId(ctx, row.type, "install");

      // Use the raw meta: it carries sourceRoot/path needed to read & install.
      const item = findItem(resolved.items, row.type, id);
      if (!item) {
        throw new CliError("ITEM_NOT_FOUND", `No ${row.type} with id '${id}' in configured sources.`, {
          type: row.type,
          id,
        });
      }

      const eligible = eligibleTargetsForItem(item, resolved.targets);
      const skipped = buildSkipped(item, resolved.targets, eligible, resolved.projectCtx, row.type);

      if (eligible.length === 0) {
        throw new CliError("NOT_ELIGIBLE", `No requested target supports '${row.type}' items.`, {
          type: row.type,
          requestedTargets: resolved.targets,
          skipped,
        });
      }

      const itemRef = { type: row.type, id: item.id, name: item.name };

      // --dry-run: report what would change; write nothing.
      if (ctx.flags.has("dry-run")) {
        return {
          data: {
            item: itemRef,
            ...echo(resolved),
            requestedTargets: resolved.targets,
            eligibleTargets: eligible,
            changedTargets: [],
            installedPaths: {},
            skipped,
            changed: false,
            dryRun: true,
          },
        };
      }

      // Fan out per eligible target so we can report exactly which ones changed,
      // even when one throws.
      const changed: TargetId[] = [];
      const installedPaths: Partial<Record<TargetId, string>> = {};
      const failures: FailedTarget[] = [];
      for (const t of eligible) {
        try {
          const installedPath = installItemForTarget(item, t, resolved.projectCtx);
          changed.push(t);
          installedPaths[t] = installedPath;
        } catch (err) {
          failures.push({ targetId: t, error: err instanceof Error ? err.message : String(err) });
        }
      }

      if (changed.length === 0 && failures.length > 0) {
        throw new CliError(
          "OPERATION_FAILED",
          `Install failed for all targets: ${failures.map((f) => `${f.targetId}: ${f.error}`).join("; ")}`,
          { installedPaths, failures, skipped }
        );
      }
      if (failures.length > 0) {
        throw new CliError(
          "PARTIAL_FAILURE",
          `Installed in ${changed.join(", ")}; failed for ${failures.map((f) => `${f.targetId}: ${f.error}`).join("; ")}.`,
          { changedTargets: changed, installedPaths, failures, skipped }
        );
      }

      return {
        data: {
          item: itemRef,
          ...echo(resolved),
          requestedTargets: resolved.targets,
          eligibleTargets: eligible,
          changedTargets: changed,
          installedPaths,
          skipped,
          changed: true,
          dryRun: false,
        },
      };
    },
  };
}

// ── remove <singular> <id> (idempotent) ──

function makeRemoveCommand(row: TypeRow): CommandDef {
  return {
    verb: "remove",
    noun: row.type,
    summary: `Remove one ${row.type} from the requested targets (idempotent).`,
    async run(ctx): Promise<CommandResult> {
      const resolved = await resolve(ctx);
      const id = requireItemId(ctx, row.type, "remove");

      const item = findItem(resolved.items, row.type, id);
      if (!item) {
        throw new CliError("ITEM_NOT_FOUND", `No ${row.type} with id '${id}' in configured sources.`, {
          type: row.type,
          id,
        });
      }

      const eligible = eligibleTargetsForItem(item, resolved.targets);
      const skipped = buildSkipped(item, resolved.targets, eligible, resolved.projectCtx, row.type);
      const itemRef = { type: row.type, id: item.id, name: item.name };

      // Where it is actually installed (among eligible targets).
      const state = getInstalledStateForTargets(item, eligible, resolved.projectCtx);
      const installedTargets = state.installedTargets ?? [];

      // Idempotent no-op: not installed anywhere → success, changed: false, no writes.
      if (installedTargets.length === 0) {
        return {
          data: {
            item: itemRef,
            ...echo(resolved),
            requestedTargets: resolved.targets,
            eligibleTargets: eligible,
            changedTargets: [],
            skipped,
            changed: false,
            dryRun: false,
          },
        };
      }

      // --dry-run: report the installs that would be removed; write nothing.
      if (ctx.flags.has("dry-run")) {
        return {
          data: {
            item: itemRef,
            ...echo(resolved),
            requestedTargets: resolved.targets,
            eligibleTargets: eligible,
            changedTargets: installedTargets,
            skipped,
            changed: false,
            dryRun: true,
          },
        };
      }

      // Fan out over the targets it is actually installed in.
      const changed: TargetId[] = [];
      const failures: FailedTarget[] = [];
      for (const t of installedTargets) {
        try {
          uninstallItemForTarget(item, t, resolved.projectCtx);
          changed.push(t);
        } catch (err) {
          failures.push({ targetId: t, error: err instanceof Error ? err.message : String(err) });
        }
      }

      if (changed.length === 0 && failures.length > 0) {
        throw new CliError(
          "OPERATION_FAILED",
          `Remove failed for all targets: ${failures.map((f) => `${f.targetId}: ${f.error}`).join("; ")}`,
          { failures }
        );
      }
      if (failures.length > 0) {
        throw new CliError(
          "PARTIAL_FAILURE",
          `Removed from ${changed.join(", ")}; failed for ${failures.map((f) => `${f.targetId}: ${f.error}`).join("; ")}.`,
          { changedTargets: changed, failures, skipped }
        );
      }

      return {
        data: {
          item: itemRef,
          ...echo(resolved),
          requestedTargets: resolved.targets,
          eligibleTargets: eligible,
          changedTargets: changed,
          skipped,
          changed: true,
          dryRun: false,
        },
      };
    },
  };
}

/** All 24 item commands, generated from the type table (4 verbs x 6 types). */
export const itemCommands: CommandDef[] = TYPE_TABLE.flatMap((row) => [
  makeListCommand(row),
  makeInfoCommand(row),
  makeInstallCommand(row),
  makeRemoveCommand(row),
]);
