import type {
  InstalledState,
  ProjectContext,
  StoreItemMeta,
  StoreItemType,
  StoreItemWithState,
  StoreView,
  TargetId,
} from "./types.js";
import type { TargetAdapter } from "./targets/shared.js";

const VALID_TARGETS: TargetId[] = ["opencode", "claude-code", "codex-cli", "codex-app"];

// Lazy-loaded adapter cache — only the selected adapter is imported.
let _cachedAdapter: { id: TargetId; adapter: TargetAdapter } | null = null;

function isItemVisibleForTarget(item: StoreItemMeta, targetId: TargetId): boolean {
  const adapter = getAdapter(targetId);
  if (adapter.isItemVisible && !adapter.isItemVisible(item)) return false;

  if (!item.targetIds || item.targetIds.length === 0) return true;
  return item.targetIds.includes(targetId);
}

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
    case "codex-cli": {
      const { codexCliAdapter } = await import("./targets/codex-cli.js");
      return codexCliAdapter;
    }
    case "codex-app": {
      const { codexAppAdapter } = await import("./targets/codex-app.js");
      return codexAppAdapter;
    }
  }
}

/** Get the adapter for the given target, loading it lazily if needed. */
function getAdapter(id: TargetId): TargetAdapter {
  if (_cachedAdapter && _cachedAdapter.id === id) return _cachedAdapter.adapter;
  // Synchronous path: for the initial startup, we preload via initAdapter().
  // This fallback should not normally be hit.
  throw new Error(`Adapter '${id}' not loaded. Call initAdapter() first.`);
}

/** Pre-load the adapter for the given target. Call once at startup. */
export async function initAdapter(id: TargetId): Promise<TargetAdapter> {
  if (_cachedAdapter && _cachedAdapter.id === id) return _cachedAdapter.adapter;
  const adapter = await loadAdapter(id);
  _cachedAdapter = { id, adapter };
  return adapter;
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

export function getTargetLabel(targetId: TargetId): string {
  return getAdapter(targetId).label;
}

export function getCategoryNoticeForTarget(category: StoreItemType, targetId: TargetId, ctx?: ProjectContext): string | undefined {
  return getAdapter(targetId).getCategoryNotice?.(category, ctx);
}

export function isCategoryVisibleForTarget(category: StoreItemType, targetId: TargetId): boolean {
  return getAdapter(targetId).isCategoryVisible?.(category) ?? true;
}

export function getInstalledStateForTarget(item: StoreItemMeta, targetId: TargetId, ctx?: ProjectContext): InstalledState {
  return getAdapter(targetId).getInstalledState(item, ctx);
}

export function installItemForTarget(item: StoreItemMeta, targetId: TargetId, ctx?: ProjectContext): void {
  getAdapter(targetId).installItem(item, ctx);
}

export function toggleItemForTarget(item: StoreItemMeta, targetId: TargetId, ctx?: ProjectContext): boolean {
  const adapter = getAdapter(targetId);
  const hintedMismatch =
    "state" in item &&
    typeof item.state === "object" &&
    item.state !== null &&
    "mismatch" in item.state &&
    (item.state as { mismatch?: boolean }).mismatch === true;
  const state = adapter.getInstalledState(item, ctx);
  const isMismatch = hintedMismatch || state.mismatch === true;

  if (state.installed && !isMismatch) {
    adapter.uninstallItem(item, ctx);
    return false;
  }

  adapter.installItem(item, ctx);
  return true;
}

async function enrichCategoryMismatch(
  items: StoreItemWithState[],
  adapter: TargetAdapter,
  ctx: ProjectContext
): Promise<{ items: StoreItemWithState[]; changed: boolean }> {
  let changed = false;

  const enriched = await Promise.all(
    items.map(async (item) => {
      if (!item.state.installed || item.state.mismatchChecked === true) {
        return item;
      }

      const fallback = { mismatch: false, mismatchChecked: true } as const;

      try {
        const mismatch = adapter.getMismatchState ? await adapter.getMismatchState(item, ctx) : fallback;
        const nextState: InstalledState = {
          ...item.state,
          mismatch: mismatch.mismatch ?? false,
          mismatchChecked: mismatch.mismatchChecked ?? true,
        };

        if (nextState.mismatch !== item.state.mismatch || nextState.mismatchChecked !== item.state.mismatchChecked) {
          changed = true;
          return { ...item, state: nextState };
        }

        return item;
      } catch {
        const nextState: InstalledState = {
          ...item.state,
          mismatch: false,
          mismatchChecked: true,
        };
        if (nextState.mismatchChecked !== item.state.mismatchChecked || nextState.mismatch !== item.state.mismatch) {
          changed = true;
          return { ...item, state: nextState };
        }
        return item;
      }
    })
  );

  return { items: enriched, changed };
}

export async function enrichStoreViewMismatchForTarget(view: StoreView, targetId: TargetId): Promise<StoreView> {
  const adapter = getAdapter(targetId);
  const context: ProjectContext = view.context ?? { mode: "global" };

  const [agents, commands, skills, providers, mcps] = await Promise.all([
    enrichCategoryMismatch(view.agents, adapter, context),
    enrichCategoryMismatch(view.commands, adapter, context),
    enrichCategoryMismatch(view.skills, adapter, context),
    enrichCategoryMismatch(view.providers, adapter, context),
    enrichCategoryMismatch(view.mcps, adapter, context),
  ]);

  if (!agents.changed && !commands.changed && !skills.changed && !providers.changed && !mcps.changed) {
    return view;
  }

  return {
    ...view,
    agents: agents.items,
    commands: commands.items,
    skills: skills.items,
    providers: providers.items,
    mcps: mcps.items,
  };
}

export function buildStoreViewForTarget(items: StoreItemMeta[], targetId: TargetId, ctx?: ProjectContext): StoreView {
  const context: ProjectContext = ctx ?? { mode: "global" };
  const visibleItems = items.filter((item) => isItemVisibleForTarget(item, targetId));

  const withState: StoreItemWithState[] = visibleItems.map((item) => ({
    ...item,
    state: getInstalledStateForTarget(item, targetId, context),
  }));

  return {
    agents: withState.filter((i) => i.type === "agent"),
    commands: withState.filter((i) => i.type === "command"),
    skills: withState.filter((i) => i.type === "skill"),
    providers: withState.filter((i) => i.type === "provider"),
    mcps: withState.filter((i) => i.type === "mcp"),
    context,
    targetId,
  };
}
