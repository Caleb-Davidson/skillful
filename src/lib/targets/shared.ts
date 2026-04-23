import type { InstalledState, ProjectContext, StoreItemMeta, StoreItemType, SupportMode, TargetId } from "../types.js";

export type CapabilityMap = Record<StoreItemType, SupportMode>;

export interface TargetAdapter {
  id: TargetId;
  label: string;
  capabilities: CapabilityMap;
  getInstalledState(item: StoreItemMeta, ctx?: ProjectContext): InstalledState;
  getMismatchState?(item: StoreItemMeta, ctx?: ProjectContext): Promise<Pick<InstalledState, "mismatch" | "mismatchChecked">>;
  installItem(item: StoreItemMeta, ctx?: ProjectContext): void;
  uninstallItem(item: StoreItemMeta, ctx?: ProjectContext): void;
}

export function makeNotImplementedAdapter(id: TargetId, label: string, capabilities: CapabilityMap): TargetAdapter {
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
