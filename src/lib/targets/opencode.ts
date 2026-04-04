import type { InstalledState, ProjectContext, StoreItemMeta } from "../types.js";
import {
  getInstalledState as getOpenCodeInstalledState,
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
};

export const opencodeAdapter: TargetAdapter = {
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
