import type { InstalledState, ProjectContext, StoreItemMeta } from "../types.js";
import {
  getInstalledState as getCodexCliInstalledState,
  installItem as installCodexCliItem,
  uninstallItem as uninstallCodexCliItem,
} from "./codex-cli-store.js";
import type { CapabilityMap, TargetAdapter } from "./shared.js";

const CODEX_CLI_CAPABILITIES: CapabilityMap = {
  agent: "yes",
  command: "no",
  skill: "yes",
  provider: "no",
  mcp: "yes",
};

export const codexCliAdapter: TargetAdapter = {
  id: "codex-cli",
  label: "Codex CLI",
  capabilities: CODEX_CLI_CAPABILITIES,
  isCategoryVisible(category): boolean {
    return category !== "provider";
  },
  isItemVisible(item: StoreItemMeta): boolean {
    if (item.type === "command") return false;
    if (item.type === "provider") return false;
    if (item.type === "agent" && item.path.endsWith(".md")) return false;
    return true;
  },
  getCategoryNotice(category: StoreItemMeta["type"], ctx?: ProjectContext): string | undefined {
    if (category === "command") {
      return "Codex CLI does not support custom commands; use Skills instead.";
    }

    if (ctx?.mode === "project" && (category === "skill" || category === "mcp")) {
      return "Codex CLI installs for this category are global-only; project-specific installs are not supported.";
    }

    return undefined;
  },
  getInstalledState(item: StoreItemMeta, ctx?: ProjectContext): InstalledState {
    return getCodexCliInstalledState(item, ctx);
  },
  installItem(item: StoreItemMeta, ctx?: ProjectContext): void {
    installCodexCliItem(item, ctx);
  },
  uninstallItem(item: StoreItemMeta, ctx?: ProjectContext): void {
    uninstallCodexCliItem(item, ctx);
  },
};
