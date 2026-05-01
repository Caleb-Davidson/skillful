import type { InstalledState, ProjectContext, StoreItemMeta } from "../types.js";
import {
  getInstalledState as getCodexInstalledState,
  installItem as installCodexItem,
  uninstallItem as uninstallCodexItem,
} from "./codex-store.js";
import type { CapabilityMap, TargetAdapter } from "./shared.js";

const CODEX_CLI_CAPABILITIES: CapabilityMap = {
  agent: "yes",
  command: "no",
  skill: "yes",
  provider: "no",
  mcp: "yes",
};

export const codexAdapter: TargetAdapter = {
  id: "codex",
  label: "Codex",
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
      return "Codex does not support custom commands; use Skills instead.";
    }

    if (ctx?.mode === "project" && (category === "skill" || category === "mcp")) {
      return "Codex installs for this category are global-only; project-specific installs are not supported.";
    }

    return undefined;
  },
  getInstalledState(item: StoreItemMeta, ctx?: ProjectContext): InstalledState {
    return getCodexInstalledState(item, ctx);
  },
  installItem(item: StoreItemMeta, ctx?: ProjectContext): void {
    installCodexItem(item, ctx);
  },
  uninstallItem(item: StoreItemMeta, ctx?: ProjectContext): void {
    uninstallCodexItem(item, ctx);
  },
};
