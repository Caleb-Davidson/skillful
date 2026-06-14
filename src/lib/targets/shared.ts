import type { InstalledState, ProjectContext, StoreItemMeta, StoreItemType, SupportMode, TargetId } from "../types.js";
import type { AgentFormat } from "../agent-format.js";

export type CapabilityMap = Record<StoreItemType, SupportMode>;

/** Categories sync operates on (subset of StoreItemType). */
export type SyncCategory = "agent" | "command" | "skill";

/** A file- or dir-installed artifact already present in a target's scope. */
export interface InstalledArtifact {
  id: string;
  /** Absolute path on disk. File for agent/command, directory for skill. */
  path: string;
  /** Only for agents — on-disk format. */
  format?: AgentFormat;
}

/** Input to write an artifact from explicit content (distinct from a store install). */
export interface SyncInstallInput {
  id: string;
  type: SyncCategory;
  /** For agent/command: exact bytes to write. */
  content?: string;
  /** For skill: absolute source directory to copy. */
  srcDir?: string;
  /** For agent: format being written (adapter writes to its expected extension). */
  agentFormat?: AgentFormat;
}

/** Whether this adapter participates in sync for a given (category, scope). */
export interface SyncSupport {
  ok: boolean;
  /** Human-readable explanation when `ok` is false (printed in the sync report). */
  notice?: string;
}

export interface TargetAdapter {
  id: TargetId;
  label: string;
  capabilities: CapabilityMap;
  isCategoryVisible?(category: StoreItemType): boolean;
  getInstalledState(item: StoreItemMeta, ctx?: ProjectContext): InstalledState;
  getMismatchState?(item: StoreItemMeta, ctx?: ProjectContext): Promise<Pick<InstalledState, "mismatch" | "mismatchChecked">>;
  isItemVisible?(item: StoreItemMeta): boolean;
  getCategoryNotice?(category: StoreItemType, ctx?: ProjectContext): string | undefined;
  installItem(item: StoreItemMeta, ctx?: ProjectContext): string;
  uninstallItem(item: StoreItemMeta, ctx?: ProjectContext): void;

  // ── Sync extensions ─────────────────────────────────────────────────────
  /** Format this adapter expects for agent files on disk. */
  agentFormat?: AgentFormat;
  /** Does this adapter participate in sync for the given category in the active scope? */
  syncSupport?(category: SyncCategory, ctx: ProjectContext): SyncSupport;
  /**
   * List file-installed artifacts in the given category for the active scope.
   * JSON-installed items (e.g. opencode.json `agent`/`command` keys) are not
   * surfaced here — sync v1 only operates on file-installed customs.
   */
  listInstalledArtifacts?(category: SyncCategory, ctx: ProjectContext): InstalledArtifact[];
  /** Write an artifact from explicit content / source directory. */
  installArtifact?(input: SyncInstallInput, ctx: ProjectContext): void;
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
    installItem(item: StoreItemMeta): string {
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
    syncSupport(): SyncSupport {
      return { ok: false, notice: `${label} sync is not implemented yet.` };
    },
  };
}
