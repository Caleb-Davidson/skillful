import type { InstalledState, ProjectContext, StoreItemMeta, StoreItemType } from "../types.js";
import {
  getInstalledState as getClaudeInstalledState,
  getMismatchState as getClaudeMismatchState,
  installItem as installClaudeItem,
  uninstallItem as uninstallClaudeItem,
} from "./claude-code-store.js";
import type { CapabilityMap, TargetAdapter } from "./shared.js";

const CLAUDE_CAPABILITIES: CapabilityMap = {
  agent: "yes",
  command: "yes",
  skill: "yes",
  provider: "no",
  mcp: "yes",
};

function supportFor(item: StoreItemMeta): Pick<InstalledState, "supported" | "supportMode" | "supportReason"> {
  if (item.type === "provider") {
    return {
      supported: false,
      supportMode: "no",
      supportReason: "Claude Code does not install provider artifacts; configure backends via environment variables.",
    };
  }

  if (item.type === "agent" && !item.path.endsWith(".md")) {
    return {
      supported: true,
      supportMode: "partial",
      supportReason: "Claude Code agent installs support only store/agents/*.md artifacts.",
    };
  }

  return { supported: true, supportMode: "yes", supportReason: undefined };
}

export const claudeCodeAdapter: TargetAdapter = {
  id: "claude-code",
  label: "Claude Code",
  capabilities: CLAUDE_CAPABILITIES,
  isCategoryVisible(category: StoreItemType): boolean {
    return category !== "provider";
  },
  isItemVisible(item: StoreItemMeta): boolean {
    if (item.type === "provider") return false;
    // Mirror of OpenCode/Codex agent-format filters: Codex agents are .toml-only.
    if (item.type === "agent" && item.path.endsWith(".toml")) return false;
    return true;
  },
  getCategoryNotice(category: StoreItemType): string | undefined {
    if (category === "provider") {
      return "Claude Code does not support provider installs; set backend env vars (ANTHROPIC_API_KEY, ANTHROPIC_BEDROCK_BASE_URL, etc.) instead.";
    }
    return undefined;
  },
  getInstalledState(item: StoreItemMeta, ctx?: ProjectContext): InstalledState {
    return {
      ...getClaudeInstalledState(item, ctx),
      ...supportFor(item),
    };
  },
  async getMismatchState(item: StoreItemMeta, ctx?: ProjectContext): Promise<Pick<InstalledState, "mismatch" | "mismatchChecked">> {
    return getClaudeMismatchState(item, ctx);
  },
  installItem(item: StoreItemMeta, ctx?: ProjectContext): void {
    installClaudeItem(item, ctx);
  },
  uninstallItem(item: StoreItemMeta, ctx?: ProjectContext): void {
    uninstallClaudeItem(item, ctx);
  },
};
