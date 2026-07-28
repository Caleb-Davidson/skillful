import type { InstalledState, ProjectContext, StoreItemMeta } from "../types.js";
import {
  getInstalledState as getCodexInstalledState,
  installItem as installCodexItem,
  uninstallItem as uninstallCodexItem,
  listInstalledArtifactsByCategory as listCodexArtifacts,
  installArtifactFromContent as installCodexArtifact,
} from "./codex-store.js";
import type { CapabilityMap, InstalledArtifact, SyncCategory, SyncInstallInput, SyncSupport, TargetAdapter } from "./shared.js";

const CODEX_CLI_CAPABILITIES: CapabilityMap = {
  agent: "yes",
  command: "no",
  skill: "yes",
  provider: "no",
  mcp: "yes",
  config: "no",
  include: "no",
};

export const codexAdapter: TargetAdapter = {
  id: "codex",
  label: "Codex",
  capabilities: CODEX_CLI_CAPABILITIES,
  isCategoryVisible(category): boolean {
    return category !== "provider" && category !== "config" && category !== "include";
  },
  isItemVisible(item: StoreItemMeta): boolean {
    if (item.type === "command") return false;
    if (item.type === "provider") return false;
    if (item.type === "config") return false;
    if (item.type === "include") return false;
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
  installItem(item: StoreItemMeta, ctx?: ProjectContext): string {
    return installCodexItem(item, ctx);
  },
  uninstallItem(item: StoreItemMeta, ctx?: ProjectContext): void {
    uninstallCodexItem(item, ctx);
  },
  agentFormat: "toml",
  syncSupport(category: SyncCategory, ctx: ProjectContext): SyncSupport {
    if (category === "agent") return { ok: true };
    if (category === "command") {
      return { ok: false, notice: "Codex does not support commands; skipped for codex." };
    }
    // skill
    if (ctx.mode === "project") {
      return {
        ok: false,
        notice: "Codex installs skills globally only; skipped in project sync. Run sync without a project to mirror skills globally.",
      };
    }
    return { ok: true };
  },
  listInstalledArtifacts(category: SyncCategory, ctx: ProjectContext): InstalledArtifact[] {
    return listCodexArtifacts(category, ctx);
  },
  installArtifact(input: SyncInstallInput, ctx: ProjectContext): void {
    installCodexArtifact(input, ctx);
  },
};
