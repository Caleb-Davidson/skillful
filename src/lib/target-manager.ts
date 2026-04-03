import type {
  InstalledState,
  ProjectContext,
  StoreItemMeta,
  StoreItemType,
  StoreItemWithState,
  StoreView,
  SupportMode,
  TargetId,
} from "./types.js";
import {
  getInstalledState as getOpenCodeInstalledState,
  installItem as installOpenCodeItem,
  uninstallItem as uninstallOpenCodeItem,
} from "./config.js";

type CapabilityMap = Record<StoreItemType, SupportMode>;

interface TargetAdapter {
  id: TargetId;
  label: string;
  capabilities: CapabilityMap;
  getInstalledState(item: StoreItemMeta, ctx?: ProjectContext): InstalledState;
  installItem(item: StoreItemMeta, ctx?: ProjectContext): void;
  uninstallItem(item: StoreItemMeta, ctx?: ProjectContext): void;
}

const OPENCODE_CAPABILITIES: CapabilityMap = {
  agent: "yes",
  command: "yes",
  skill: "yes",
  provider: "yes",
  mcp: "yes",
};

const CLAUDE_CAPABILITIES: CapabilityMap = {
  agent: "partial",
  command: "yes",
  skill: "yes",
  provider: "partial",
  mcp: "yes",
};

const CODEX_CLI_CAPABILITIES: CapabilityMap = {
  agent: "partial",
  command: "partial",
  skill: "yes",
  provider: "yes",
  mcp: "yes",
};

const CODEX_APP_CAPABILITIES: CapabilityMap = {
  agent: "yes",
  command: "partial",
  skill: "yes",
  provider: "partial",
  mcp: "yes",
};

function makeNotImplementedAdapter(id: TargetId, label: string, capabilities: CapabilityMap): TargetAdapter {
  return {
    id,
    label,
    capabilities,
    getInstalledState(item: StoreItemMeta): InstalledState {
      const supportMode = capabilities[item.type];
      return {
        installed: false,
        supported: supportMode !== "no",
        supportMode,
        supportReason:
          supportMode === "no"
            ? `${label} does not support '${item.type}' items.`
            : `${label} adapter install detection is not implemented yet for '${item.type}'.`,
      };
    },
    installItem(item: StoreItemMeta): void {
      const supportMode = capabilities[item.type];
      if (supportMode === "no") {
        throw new Error(`${label} does not support '${item.type}' items.`);
      }
      throw new Error(`${label} adapter install is not implemented yet for '${item.type}'.`);
    },
    uninstallItem(item: StoreItemMeta): void {
      const supportMode = capabilities[item.type];
      if (supportMode === "no") {
        throw new Error(`${label} does not support '${item.type}' items.`);
      }
      throw new Error(`${label} adapter uninstall is not implemented yet for '${item.type}'.`);
    },
  };
}

const opencodeAdapter: TargetAdapter = {
  id: "opencode",
  label: "OpenCode",
  capabilities: OPENCODE_CAPABILITIES,
  getInstalledState(item: StoreItemMeta, ctx?: ProjectContext): InstalledState {
    return {
      ...getOpenCodeInstalledState(item, ctx),
      supported: true,
      supportMode: "yes",
    };
  },
  installItem(item: StoreItemMeta, ctx?: ProjectContext): void {
    installOpenCodeItem(item, ctx);
  },
  uninstallItem(item: StoreItemMeta, ctx?: ProjectContext): void {
    uninstallOpenCodeItem(item, ctx);
  },
};

const adapters: Record<TargetId, TargetAdapter> = {
  opencode: opencodeAdapter,
  "claude-code": makeNotImplementedAdapter("claude-code", "Claude Code", CLAUDE_CAPABILITIES),
  "codex-cli": makeNotImplementedAdapter("codex-cli", "Codex CLI", CODEX_CLI_CAPABILITIES),
  "codex-app": makeNotImplementedAdapter("codex-app", "Codex App", CODEX_APP_CAPABILITIES),
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
