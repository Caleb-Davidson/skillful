import type { InstalledState, StoreItemMeta } from "../types.js";
import type { CapabilityMap, TargetAdapter } from "./shared.js";

const CODEX_APP_CAPABILITIES: CapabilityMap = {
  agent: "yes",
  command: "partial",
  skill: "yes",
  provider: "partial",
  mcp: "yes",
};

export const codexAppAdapter: TargetAdapter = {
  id: "codex-app",
  label: "Codex App",
  capabilities: CODEX_APP_CAPABILITIES,
  isItemVisible(item: StoreItemMeta): boolean {
    if (item.type === "agent" && item.path.endsWith(".md")) return false;
    return true;
  },
  getInstalledState(item: StoreItemMeta): InstalledState {
    const supportMode = CODEX_APP_CAPABILITIES[item.type];
    return {
      installed: false,
      supported: supportMode !== "no",
      supportMode,
      supportReason:
        supportMode === "no"
          ? `Codex App does not support '${item.type}' items.`
          : `Codex App adapter install detection is not implemented yet for '${item.type}'.`,
    };
  },
  installItem(item: StoreItemMeta): void {
    const supportMode = CODEX_APP_CAPABILITIES[item.type];
    if (supportMode === "no") {
      throw new Error(`Codex App does not support '${item.type}' items.`);
    }
    throw new Error(`Codex App adapter install is not implemented yet for '${item.type}'.`);
  },
  uninstallItem(item: StoreItemMeta): void {
    const supportMode = CODEX_APP_CAPABILITIES[item.type];
    if (supportMode === "no") {
      throw new Error(`Codex App does not support '${item.type}' items.`);
    }
    throw new Error(`Codex App adapter uninstall is not implemented yet for '${item.type}'.`);
  },
};
