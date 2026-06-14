import type {
  InstalledState,
  MultiInstalledStatus,
  PerTargetState,
  ProjectContext,
  StoreItemMeta,
  StoreItemType,
  StoreItemWithState,
  StoreView,
  SupportMode,
  TargetId,
} from "./types.js";
import type { TargetAdapter } from "./targets/shared.js";

const VALID_TARGETS: TargetId[] = ["opencode", "claude-code", "codex"];

// Lazy-loaded adapter cache. Multi-target sessions keep several adapters
// resident at once; single-target sessions still only load one.
const _adapterCache = new Map<TargetId, TargetAdapter>();

async function loadAdapter(id: TargetId): Promise<TargetAdapter> {
  switch (id) {
    case "opencode": {
      const { opencodeAdapter } = await import("./targets/opencode.js");
      return opencodeAdapter;
    }
    case "claude-code": {
      const { claudeCodeAdapter } = await import("./targets/claude-code.js");
      return claudeCodeAdapter;
    }
    case "codex": {
      const { codexAdapter } = await import("./targets/codex.js");
      return codexAdapter;
    }
  }
}

/** Get the adapter for the given target, throwing if not preloaded. */
function getAdapter(id: TargetId): TargetAdapter {
  const adapter = _adapterCache.get(id);
  if (!adapter) {
    throw new Error(`Adapter '${id}' not loaded. Call initAdapter()/initAdapters() first.`);
  }
  return adapter;
}

/** Pre-load a single adapter. Idempotent. */
export async function initAdapter(id: TargetId): Promise<TargetAdapter> {
  const existing = _adapterCache.get(id);
  if (existing) return existing;
  const adapter = await loadAdapter(id);
  _adapterCache.set(id, adapter);
  return adapter;
}

/** Pre-load all adapters for a multi-target session. Idempotent. */
export async function initAdapters(ids: TargetId[]): Promise<TargetAdapter[]> {
  const adapters = await Promise.all(ids.map((id) => initAdapter(id)));
  return adapters;
}

export function listTargetIds(): TargetId[] {
  return [...VALID_TARGETS];
}

export function resolveTargetId(argv: string[] = process.argv.slice(2)): TargetId {
  let rawTarget: string | undefined;
  let sawTargetFlag = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target") {
      sawTargetFlag = true;
      rawTarget = argv[i + 1];
      break;
    }
    if (arg.startsWith("--target=")) {
      sawTargetFlag = true;
      rawTarget = arg.slice("--target=".length);
      break;
    }
  }

  if (!sawTargetFlag) {
    return "opencode";
  }

  if (!rawTarget) {
    const valid = VALID_TARGETS.join(", ");
    throw new Error(`Missing value for --target. Valid targets: ${valid}`);
  }

  if (VALID_TARGETS.includes(rawTarget as TargetId)) {
    return rawTarget as TargetId;
  }

  const valid = VALID_TARGETS.join(", ");
  throw new Error(`Invalid --target value '${rawTarget}'. Valid targets: ${valid}`);
}

/**
 * Resolve the --target flag if present, otherwise return null.
 * Used by cli.tsx to distinguish "explicit user override" from "auto-resolve".
 */
export function resolveOptionalTargetFlag(argv: string[] = process.argv.slice(2)): TargetId | null {
  let sawFlag = false;
  let rawTarget: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target") {
      sawFlag = true;
      rawTarget = argv[i + 1];
      break;
    }
    if (arg.startsWith("--target=")) {
      sawFlag = true;
      rawTarget = arg.slice("--target=".length);
      break;
    }
  }
  if (!sawFlag) return null;
  if (!rawTarget || !VALID_TARGETS.includes(rawTarget as TargetId)) {
    const valid = VALID_TARGETS.join(", ");
    throw new Error(`Invalid --target value '${rawTarget ?? ""}'. Valid targets: ${valid}`);
  }
  return rawTarget as TargetId;
}

export function getTargetLabel(targetId: TargetId): string {
  return getAdapter(targetId).label;
}

/** Combined label for a target selection (e.g. "Claude Code + OpenCode"). */
export function getTargetSelectionLabel(targetIds: TargetId[]): string {
  return targetIds.map((id) => getAdapter(id).label).join(" + ");
}

export function getCategoryNoticeForTarget(category: StoreItemType, targetId: TargetId, ctx?: ProjectContext): string | undefined {
  return getAdapter(targetId).getCategoryNotice?.(category, ctx);
}

/**
 * In multi-target mode we concatenate per-target notices so users see all
 * relevant warnings (e.g. "Claude Code does not support providers...").
 */
export function getCategoryNoticeForTargets(category: StoreItemType, targetIds: TargetId[], ctx?: ProjectContext): string | undefined {
  const notices: string[] = [];
  const seen = new Set<string>();
  for (const id of targetIds) {
    const notice = getAdapter(id).getCategoryNotice?.(category, ctx);
    if (notice && !seen.has(notice)) {
      seen.add(notice);
      notices.push(notice);
    }
  }
  return notices.length === 0 ? undefined : notices.join("\n");
}

export function isCategoryVisibleForTarget(category: StoreItemType, targetId: TargetId): boolean {
  return getAdapter(targetId).isCategoryVisible?.(category) ?? true;
}

/** A category is visible in multi-target mode if any configured target shows it. */
export function isCategoryVisibleForTargets(category: StoreItemType, targetIds: TargetId[]): boolean {
  return targetIds.some((id) => isCategoryVisibleForTarget(category, id));
}

export function getInstalledStateForTarget(item: StoreItemMeta, targetId: TargetId, ctx?: ProjectContext): InstalledState {
  return getAdapter(targetId).getInstalledState(item, ctx);
}

// ── Eligibility ──

function itemAllowedForTarget(item: StoreItemMeta, targetId: TargetId): boolean {
  // Adapter-level visibility (e.g. Claude hides providers).
  const adapter = getAdapter(targetId);
  if (adapter.isItemVisible && !adapter.isItemVisible(item)) return false;
  // Per-item target allow-list.
  if (item.targetIds && item.targetIds.length > 0 && !item.targetIds.includes(targetId)) return false;
  return true;
}

function isItemEligibleForTarget(item: StoreItemMeta, targetId: TargetId): boolean {
  if (!itemAllowedForTarget(item, targetId)) return false;
  const adapter = getAdapter(targetId);
  const capability = adapter.capabilities[item.type];
  // "no" means the target cannot install this category at all.
  return capability !== "no";
}

/** Targets in `targetIds` that could install `item` (visibility + capability). */
export function eligibleTargetsForItem(item: StoreItemMeta, targetIds: TargetId[]): TargetId[] {
  return targetIds.filter((id) => isItemEligibleForTarget(item, id));
}

// ── Visibility (superset across configured targets) ──

/**
 * An item is shown in the multi-target store view if it's allowed by at least
 * one configured target — even if installation is unsupported there. This is
 * the "superset" behavior: row shows up, with a badge clarifying scope.
 */
function isItemVisibleForTargets(item: StoreItemMeta, targetIds: TargetId[]): boolean {
  return targetIds.some((id) => itemAllowedForTarget(item, id));
}

// ── Multi-target rollup ──

function computeRollup(perTarget: PerTargetState[]): {
  status: MultiInstalledStatus;
  eligibleTargets: TargetId[];
  installedTargets: TargetId[];
  anyMismatch: boolean;
  allMismatchChecked: boolean;
} {
  const eligibleTargets = perTarget.filter((p) => p.eligible).map((p) => p.targetId);
  const installedTargets = perTarget
    .filter((p) => p.eligible && p.state.installed)
    .map((p) => p.targetId);
  const anyMismatch = perTarget.some((p) => p.eligible && p.state.installed && p.state.mismatch === true);
  const allMismatchChecked = perTarget.every(
    (p) => !p.eligible || !p.state.installed || p.state.mismatchChecked === true
  );

  let status: MultiInstalledStatus;
  if (eligibleTargets.length === 0) {
    status = "unsupported";
  } else if (installedTargets.length === 0) {
    status = "not-installed";
  } else if (installedTargets.length < eligibleTargets.length) {
    status = "missing-in-some";
  } else if (anyMismatch) {
    status = "older-version";
  } else {
    status = "installed";
  }

  return { status, eligibleTargets, installedTargets, anyMismatch, allMismatchChecked };
}

/**
 * Build aggregated state across multiple targets. The top-level fields keep
 * meaningful single-target semantics where possible, while `status`,
 * `perTarget`, and `eligibleTargets` carry the multi-target detail.
 */
export function getInstalledStateForTargets(
  item: StoreItemMeta,
  targetIds: TargetId[],
  ctx?: ProjectContext
): InstalledState {
  const perTarget: PerTargetState[] = targetIds.map((targetId) => {
    const eligible = isItemEligibleForTarget(item, targetId);
    if (!eligible) {
      const adapter = getAdapter(targetId);
      const capability = adapter.capabilities[item.type];
      return {
        targetId,
        eligible: false,
        state: {
          installed: false,
          supported: capability !== "no",
          supportMode: capability,
          supportReason:
            capability === "no"
              ? `${adapter.label} does not support '${item.type}' items.`
              : `${adapter.label} hides this item.`,
        },
      };
    }
    const state = getAdapter(targetId).getInstalledState(item, ctx);
    return { targetId, eligible: true, state };
  });

  const rollup = computeRollup(perTarget);

  // Pick the first eligible target as the "primary" for display fallbacks.
  const primary = perTarget.find((p) => p.eligible) ?? perTarget[0];

  // Aggregate top-level fields used by single-target call-sites and the UI:
  // `installed` reflects healthy completion; mismatch/missing-in-some flow
  // through `status` and existing flags.
  const fullyInstalled =
    rollup.eligibleTargets.length > 0 &&
    rollup.installedTargets.length === rollup.eligibleTargets.length;

  let supportMode: SupportMode;
  if (rollup.status === "unsupported") {
    supportMode = "no";
  } else if (rollup.eligibleTargets.length < targetIds.length) {
    // Some configured targets can install this, others can't → partial.
    supportMode = "partial";
  } else {
    supportMode = "yes";
  }

  const supportReason =
    rollup.status === "unsupported"
      ? "No configured target supports this item."
      : rollup.eligibleTargets.length < targetIds.length
        ? `Installs only for: ${rollup.eligibleTargets.join(", ")}`
        : primary.state.supportReason;

  return {
    installed: fullyInstalled,
    installedVia: primary.state.installedVia,
    globalInstalled: perTarget.some((p) => p.state.globalInstalled === true),
    supported: rollup.status !== "unsupported",
    supportMode,
    supportReason,
    mismatch: rollup.anyMismatch,
    mismatchChecked: rollup.allMismatchChecked,
    status: rollup.status,
    perTarget,
    eligibleTargets: rollup.eligibleTargets,
    installedTargets: rollup.installedTargets,
  };
}

// ── Install / toggle ──

export function installItemForTarget(item: StoreItemMeta, targetId: TargetId, ctx?: ProjectContext): void {
  getAdapter(targetId).installItem(item, ctx);
}

/**
 * Install across all configured targets that support the item.
 * Returns the list of targets installed into.
 */
export function installItemForTargets(
  item: StoreItemMeta,
  targetIds: TargetId[],
  ctx?: ProjectContext
): TargetId[] {
  const eligible = eligibleTargetsForItem(item, targetIds);
  if (eligible.length === 0) {
    throw new Error(`No configured target supports '${item.type}' items.`);
  }
  const errors: string[] = [];
  const installed: TargetId[] = [];
  for (const id of eligible) {
    try {
      getAdapter(id).installItem(item, ctx);
      installed.push(id);
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (errors.length > 0 && installed.length === 0) {
    throw new Error(`Install failed for all targets:\n${errors.join("\n")}`);
  }
  if (errors.length > 0) {
    // Partial failure surfaced via a thrown error after recording the wins.
    throw new Error(`Installed in ${installed.join(", ")}; failures:\n${errors.join("\n")}`);
  }
  return installed;
}

/**
 * Uninstall across all configured targets that are eligible for the item.
 * Mirrors `installItemForTargets`: collects successes, aggregates errors with
 * the same partial/total semantics, and returns the targets actually
 * uninstalled from. Does NOT route through `toggleItemForTargets` (toggle would
 * install an item that is not currently installed).
 */
export function uninstallItemForTargets(
  item: StoreItemMeta,
  targetIds: TargetId[],
  ctx?: ProjectContext
): TargetId[] {
  const eligible = eligibleTargetsForItem(item, targetIds);
  if (eligible.length === 0) {
    throw new Error(`No configured target supports '${item.type}' items.`);
  }
  const errors: string[] = [];
  const uninstalled: TargetId[] = [];
  for (const id of eligible) {
    try {
      getAdapter(id).uninstallItem(item, ctx);
      uninstalled.push(id);
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (errors.length > 0 && uninstalled.length === 0) {
    throw new Error(`Uninstall failed for all targets:\n${errors.join("\n")}`);
  }
  if (errors.length > 0) {
    // Partial failure surfaced via a thrown error after recording the wins.
    throw new Error(`Uninstalled from ${uninstalled.join(", ")}; failures:\n${errors.join("\n")}`);
  }
  return uninstalled;
}

export function toggleItemForTarget(item: StoreItemMeta, targetId: TargetId, ctx?: ProjectContext): boolean {
  const adapter = getAdapter(targetId);
  const hintedMismatch =
    "state" in item &&
    typeof (item as { state?: unknown }).state === "object" &&
    (item as { state?: unknown }).state !== null &&
    "mismatch" in ((item as { state: object }).state as object) &&
    ((item as { state: { mismatch?: boolean } }).state.mismatch === true);
  const state = adapter.getInstalledState(item, ctx);
  const isMismatch = hintedMismatch || state.mismatch === true;

  if (state.installed && !isMismatch) {
    adapter.uninstallItem(item, ctx);
    return false;
  }

  adapter.installItem(item, ctx);
  return true;
}

/**
 * Multi-target toggle.
 *   "installed" → uninstall everywhere it's installed
 *   anything else (missing-in-some / older-version / not-installed) → install in all eligible.
 * Returns true when the resulting action was install, false when uninstall.
 */
export function toggleItemForTargets(
  item: StoreItemMeta,
  targetIds: TargetId[],
  ctx?: ProjectContext
): boolean {
  const aggregate = getInstalledStateForTargets(item, targetIds, ctx);
  const eligible = aggregate.eligibleTargets ?? [];
  if (eligible.length === 0) {
    throw new Error("No configured target supports this item.");
  }

  // Healthy → uninstall everywhere it's actually installed.
  if (aggregate.status === "installed") {
    const errors: string[] = [];
    for (const id of aggregate.installedTargets ?? []) {
      try {
        getAdapter(id).uninstallItem(item, ctx);
      } catch (err) {
        errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (errors.length > 0) {
      throw new Error(`Uninstall failures:\n${errors.join("\n")}`);
    }
    return false;
  }

  // Otherwise → install everywhere eligible (re-install handles mismatches).
  installItemForTargets(item, targetIds, ctx);
  return true;
}

// ── Mismatch enrichment ──

async function enrichSingleTargetItem(
  item: StoreItemWithState,
  adapter: TargetAdapter,
  ctx: ProjectContext
): Promise<{ item: StoreItemWithState; changed: boolean }> {
  if (!item.state.installed || item.state.mismatchChecked === true) {
    return { item, changed: false };
  }
  try {
    const mismatch = adapter.getMismatchState
      ? await adapter.getMismatchState(item, ctx)
      : { mismatch: false, mismatchChecked: true };
    const nextState: InstalledState = {
      ...item.state,
      mismatch: mismatch.mismatch ?? false,
      mismatchChecked: mismatch.mismatchChecked ?? true,
    };
    if (nextState.mismatch === item.state.mismatch && nextState.mismatchChecked === item.state.mismatchChecked) {
      return { item, changed: false };
    }
    return { item: { ...item, state: nextState }, changed: true };
  } catch {
    const nextState: InstalledState = {
      ...item.state,
      mismatch: false,
      mismatchChecked: true,
    };
    if (nextState.mismatchChecked === item.state.mismatchChecked && nextState.mismatch === item.state.mismatch) {
      return { item, changed: false };
    }
    return { item: { ...item, state: nextState }, changed: true };
  }
}

async function enrichCategoryMismatch(
  items: StoreItemWithState[],
  adapter: TargetAdapter,
  ctx: ProjectContext
): Promise<{ items: StoreItemWithState[]; changed: boolean }> {
  const results = await Promise.all(items.map((item) => enrichSingleTargetItem(item, adapter, ctx)));
  return {
    items: results.map((r) => r.item),
    changed: results.some((r) => r.changed),
  };
}

export async function enrichStoreViewMismatchForTarget(view: StoreView, targetId: TargetId): Promise<StoreView> {
  const adapter = getAdapter(targetId);
  const context: ProjectContext = view.context ?? { mode: "global" };

  const [agents, commands, skills, providers, mcps, configs] = await Promise.all([
    enrichCategoryMismatch(view.agents, adapter, context),
    enrichCategoryMismatch(view.commands, adapter, context),
    enrichCategoryMismatch(view.skills, adapter, context),
    enrichCategoryMismatch(view.providers, adapter, context),
    enrichCategoryMismatch(view.mcps, adapter, context),
    enrichCategoryMismatch(view.configs, adapter, context),
  ]);

  if (!agents.changed && !commands.changed && !skills.changed && !providers.changed && !mcps.changed && !configs.changed) {
    return view;
  }

  return {
    ...view,
    agents: agents.items,
    commands: commands.items,
    skills: skills.items,
    providers: providers.items,
    mcps: mcps.items,
    configs: configs.items,
  };
}

/**
 * Multi-target mismatch enrichment: fan out per target, then re-aggregate so
 * the rollup `status` reflects the freshly-checked per-target mismatches.
 */
async function enrichItemAcrossTargets(
  item: StoreItemWithState,
  targetIds: TargetId[],
  ctx: ProjectContext
): Promise<{ item: StoreItemWithState; changed: boolean }> {
  const perTarget = item.state.perTarget;
  if (!perTarget || perTarget.length === 0) {
    return { item, changed: false };
  }

  // Decide whether enrichment is even needed.
  const needs = perTarget.some((p) => p.eligible && p.state.installed && p.state.mismatchChecked !== true);
  if (!needs) return { item, changed: false };

  const enriched = await Promise.all(
    perTarget.map(async (p) => {
      if (!p.eligible || !p.state.installed || p.state.mismatchChecked === true) return p;
      try {
        const adapter = getAdapter(p.targetId);
        const mm = adapter.getMismatchState
          ? await adapter.getMismatchState(item, ctx)
          : { mismatch: false, mismatchChecked: true };
        return {
          ...p,
          state: {
            ...p.state,
            mismatch: mm.mismatch ?? false,
            mismatchChecked: mm.mismatchChecked ?? true,
          },
        };
      } catch {
        return {
          ...p,
          state: { ...p.state, mismatch: false, mismatchChecked: true },
        };
      }
    })
  );

  const rollup = computeRollup(enriched);
  const fullyInstalled =
    rollup.eligibleTargets.length > 0 && rollup.installedTargets.length === rollup.eligibleTargets.length;

  const nextState: InstalledState = {
    ...item.state,
    perTarget: enriched,
    eligibleTargets: rollup.eligibleTargets,
    installedTargets: rollup.installedTargets,
    status: rollup.status,
    mismatch: rollup.anyMismatch,
    mismatchChecked: rollup.allMismatchChecked,
    installed: fullyInstalled,
  };

  return { item: { ...item, state: nextState }, changed: true };
}

async function enrichCategoryAcrossTargets(
  items: StoreItemWithState[],
  targetIds: TargetId[],
  ctx: ProjectContext
): Promise<{ items: StoreItemWithState[]; changed: boolean }> {
  const results = await Promise.all(items.map((item) => enrichItemAcrossTargets(item, targetIds, ctx)));
  return { items: results.map((r) => r.item), changed: results.some((r) => r.changed) };
}

export async function enrichStoreViewMismatchForTargets(view: StoreView, targetIds: TargetId[]): Promise<StoreView> {
  // Fall back to the single-target path when there's nothing to aggregate.
  if (targetIds.length === 1) {
    return enrichStoreViewMismatchForTarget(view, targetIds[0]);
  }

  const context: ProjectContext = view.context ?? { mode: "global" };
  const [agents, commands, skills, providers, mcps, configs] = await Promise.all([
    enrichCategoryAcrossTargets(view.agents, targetIds, context),
    enrichCategoryAcrossTargets(view.commands, targetIds, context),
    enrichCategoryAcrossTargets(view.skills, targetIds, context),
    enrichCategoryAcrossTargets(view.providers, targetIds, context),
    enrichCategoryAcrossTargets(view.mcps, targetIds, context),
    enrichCategoryAcrossTargets(view.configs, targetIds, context),
  ]);

  if (!agents.changed && !commands.changed && !skills.changed && !providers.changed && !mcps.changed && !configs.changed) {
    return view;
  }

  return {
    ...view,
    agents: agents.items,
    commands: commands.items,
    skills: skills.items,
    providers: providers.items,
    mcps: mcps.items,
    configs: configs.items,
  };
}

// ── View builders ──

function isItemVisibleForTarget(item: StoreItemMeta, targetId: TargetId): boolean {
  return itemAllowedForTarget(item, targetId);
}

export function buildStoreViewForTarget(items: StoreItemMeta[], targetId: TargetId, ctx?: ProjectContext): StoreView {
  const context: ProjectContext = ctx ?? { mode: "global" };
  const visibleItems = items.filter((item) => isItemVisibleForTarget(item, targetId));

  const withState: StoreItemWithState[] = visibleItems.map((item) => {
    // Use the multi-target builder with a single-element list so consumers get
    // the new `status`/`perTarget` shape uniformly.
    const state = getInstalledStateForTargets(item, [targetId], context);
    return { ...item, state };
  });

  return {
    agents: withState.filter((i) => i.type === "agent"),
    commands: withState.filter((i) => i.type === "command"),
    skills: withState.filter((i) => i.type === "skill"),
    providers: withState.filter((i) => i.type === "provider"),
    mcps: withState.filter((i) => i.type === "mcp"),
    configs: withState.filter((i) => i.type === "config"),
    context,
    targetId,
    targetIds: [targetId],
  };
}

/**
 * Build a multi-target store view. Items are the superset visible to *any*
 * configured target; per-row state carries the aggregated rollup.
 */
export function buildStoreViewForTargets(items: StoreItemMeta[], targetIds: TargetId[], ctx?: ProjectContext): StoreView {
  if (targetIds.length === 1) {
    return buildStoreViewForTarget(items, targetIds[0], ctx);
  }
  const context: ProjectContext = ctx ?? { mode: "global" };
  const visibleItems = items.filter((item) => isItemVisibleForTargets(item, targetIds));

  const withState: StoreItemWithState[] = visibleItems.map((item) => ({
    ...item,
    state: getInstalledStateForTargets(item, targetIds, context),
  }));

  return {
    agents: withState.filter((i) => i.type === "agent"),
    commands: withState.filter((i) => i.type === "command"),
    skills: withState.filter((i) => i.type === "skill"),
    providers: withState.filter((i) => i.type === "provider"),
    mcps: withState.filter((i) => i.type === "mcp"),
    configs: withState.filter((i) => i.type === "config"),
    context,
    targetId: targetIds[0],
    targetIds: [...targetIds],
  };
}
