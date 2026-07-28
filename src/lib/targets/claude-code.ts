import type { InstalledState, ProjectContext, StoreItemMeta, StoreItemType } from "../types.js";
import {
  getInstalledState as getClaudeInstalledState,
  getMismatchState as getClaudeMismatchState,
  installItem as installClaudeItem,
  uninstallItem as uninstallClaudeItem,
  listInstalledArtifactsByCategory as listClaudeArtifacts,
  installArtifactFromContent as installClaudeArtifact,
} from "./claude-code-store.js";
import type { CapabilityMap, InstalledArtifact, SyncCategory, SyncInstallInput, SyncSupport, TargetAdapter } from "./shared.js";

const CLAUDE_CAPABILITIES: CapabilityMap = {
  agent: "yes",
  command: "yes",
  skill: "yes",
  provider: "no",
  mcp: "yes",
  config: "yes",
  include: "yes",
};

function supportFor(item: StoreItemMeta, ctx?: ProjectContext): Pick<InstalledState, "supported" | "supportMode" | "supportReason"> {
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

  if (item.type === "config" && (!ctx || ctx.mode !== "project")) {
    return {
      supported: true,
      supportMode: "partial",
      supportReason: "This config utility requires a project context; switch to a project to install.",
    };
  }

  if (item.type === "include" && (!ctx || ctx.mode !== "project")) {
    return {
      supported: true,
      supportMode: "partial",
      supportReason: "Include files install into the project root; switch to a project to install.",
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
      ...supportFor(item, ctx),
    };
  },
  async getMismatchState(item: StoreItemMeta, ctx?: ProjectContext): Promise<Pick<InstalledState, "mismatch" | "mismatchChecked">> {
    return getClaudeMismatchState(item, ctx);
  },
  installItem(item: StoreItemMeta, ctx?: ProjectContext): string {
    return installClaudeItem(item, ctx);
  },
  uninstallItem(item: StoreItemMeta, ctx?: ProjectContext): void {
    uninstallClaudeItem(item, ctx);
  },
  agentFormat: "md",
  syncSupport(category: SyncCategory): SyncSupport {
    if (category === "agent" || category === "command" || category === "skill") {
      return { ok: true };
    }
    return { ok: false };
  },
  listInstalledArtifacts(category: SyncCategory, ctx: ProjectContext): InstalledArtifact[] {
    return listClaudeArtifacts(category, ctx);
  },
  installArtifact(input: SyncInstallInput, ctx: ProjectContext): void {
    installClaudeArtifact(input, ctx);
  },
};
