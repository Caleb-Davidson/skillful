import type {
  InstalledState,
  ProjectContext,
  StoreItemMeta,
  StoreItemWithState,
  StoreView,
  TargetId,
} from "./types.js";
import type { TargetAdapter } from "./targets/shared.js";
import { opencodeAdapter } from "./targets/opencode.js";
import { claudeCodeAdapter } from "./targets/claude-code.js";
import { codexCliAdapter } from "./targets/codex-cli.js";
import { codexAppAdapter } from "./targets/codex-app.js";

const adapters: Record<TargetId, TargetAdapter> = {
  opencode: opencodeAdapter,
  "claude-code": claudeCodeAdapter,
  "codex-cli": codexCliAdapter,
  "codex-app": codexAppAdapter,
};

export function listTargetIds(): TargetId[] {
  return Object.keys(adapters) as TargetId[];
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
    const valid = listTargetIds().join(", ");
    throw new Error(`Missing value for --target. Valid targets: ${valid}`);
  }

  if (rawTarget in adapters) {
    return rawTarget as TargetId;
  }

  const valid = listTargetIds().join(", ");
  throw new Error(`Invalid --target value '${rawTarget}'. Valid targets: ${valid}`);
}

export function getTargetLabel(targetId: TargetId): string {
  return adapters[targetId].label;
}

export function getInstalledStateForTarget(item: StoreItemMeta, targetId: TargetId, ctx?: ProjectContext): InstalledState {
  return adapters[targetId].getInstalledState(item, ctx);
}

export function toggleItemForTarget(item: StoreItemMeta, targetId: TargetId, ctx?: ProjectContext): boolean {
  const adapter = adapters[targetId];
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
