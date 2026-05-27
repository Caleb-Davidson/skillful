import type { InstalledState, ProjectContext, StoreItemMeta } from "../types.js";
import {
  getInstalledState as getOpenCodeInstalledState,
  getMismatchState as getOpenCodeMismatchState,
  installItem as installOpenCodeItem,
  uninstallItem as uninstallOpenCodeItem,
  listInstalledArtifactsByCategory as listOpenCodeArtifacts,
  installArtifactFromContent as installOpenCodeArtifact,
} from "./opencode-store.js";
import type { CapabilityMap, InstalledArtifact, SyncCategory, SyncInstallInput, SyncSupport, TargetAdapter } from "./shared.js";

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
  agentFormat: "md",
  syncSupport(category: SyncCategory): SyncSupport {
    if (category === "agent" || category === "command" || category === "skill") {
      return { ok: true };
    }
    return { ok: false };
  },
  listInstalledArtifacts(category: SyncCategory, ctx: ProjectContext): InstalledArtifact[] {
    return listOpenCodeArtifacts(category, ctx);
  },
  installArtifact(input: SyncInstallInput, ctx: ProjectContext): void {
    installOpenCodeArtifact(input, ctx);
  },
};
