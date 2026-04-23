import type {
  InstalledState,
  ProjectContext,
  StoreItemMeta,
  StoreItemWithState,
  StoreView,
  TargetId,
} from "./types.js";
import type { TargetAdapter } from "./targets/shared.js";

const VALID_TARGETS: TargetId[] = ["opencode", "claude-code", "codex-cli", "codex-app"];

// Lazy-loaded adapter cache — only the selected adapter is imported.
let _cachedAdapter: { id: TargetId; adapter: TargetAdapter } | null = null;

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

export function getInstalledStateForTarget(item: StoreItemMeta, targetId: TargetId, ctx?: ProjectContext): InstalledState {
  return getAdapter(targetId).getInstalledState(item, ctx);
}

export function toggleItemForTarget(item: StoreItemMeta, targetId: TargetId, ctx?: ProjectContext): boolean {
  const adapter = getAdapter(targetId);
  const state = adapter.getInstalledState(item, ctx);
  if (state.installed) {
    adapter.uninstallItem(item, ctx);
    return false;
  }

  adapter.installItem(item, ctx);
  return true;
}

export function buildStoreViewForTarget(items: StoreItemMeta[], targetId: TargetId, ctx?: ProjectContext): StoreView {
  const context: ProjectContext = ctx ?? { mode: "global" };

  const withState: StoreItemWithState[] = items.map((item) => ({
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
