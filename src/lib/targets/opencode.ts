import type { InstalledState, ProjectContext, StoreItemMeta } from "../types.js";
import {
  getInstalledState as getOpenCodeInstalledState,
  getMismatchState as getOpenCodeMismatchState,
  installItem as installOpenCodeItem,
  uninstallItem as uninstallOpenCodeItem,
} from "./opencode-store.js";
import type { CapabilityMap, TargetAdapter } from "./shared.js";

const OPENCODE_CAPABILITIES: CapabilityMap = {
  agent: "yes",
  command: "yes",
  skill: "yes",
  provider: "yes",
  mcp: "yes",
  config: "no",
};

export const opencodeAdapter: TargetAdapter = {
  id: "opencode",
  label: "OpenCode",
  capabilities: OPENCODE_CAPABILITIES,
  isCategoryVisible(category): boolean {
    return category !== "config";
  },
  isItemVisible(item: StoreItemMeta): boolean {
    if (item.type === "agent" && item.path.endsWith(".toml")) return false;
    if (item.type === "config") return false;
    return true;
  },
  getInstalledState(item: StoreItemMeta, ctx?: ProjectContext): InstalledState {
    return {
      ...getOpenCodeInstalledState(item, ctx),
      supported: true,
      supportMode: "yes",
    };
  },
  async getMismatchState(item: StoreItemMeta, ctx?: ProjectContext): Promise<Pick<InstalledState, "mismatch" | "mismatchChecked">> {
    return getOpenCodeMismatchState(item, ctx);
  },
  installItem(item: StoreItemMeta, ctx?: ProjectContext): void {
    installOpenCodeItem(item, ctx);
  },
  uninstallItem(item: StoreItemMeta, ctx?: ProjectContext): void {
    uninstallOpenCodeItem(item, ctx);
  },
};
