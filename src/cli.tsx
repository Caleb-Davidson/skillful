#!/usr/bin/env node
/**
 * skillful CLI entry point.
 * Launches the TUI storefront for managing OpenCode agents, commands, and skills.
 *
 * Supports startup modes via subcommands:
 *   skillful              — auto-detect (default view from settings)
 *   skillful manage       — jump to the store management view
 *   skillful projects     — jump to the projects view
 *   skillful sync         — mirror custom items across configured targets
 *
 * Options:
 *   --target <id>    Target adapter (opencode, claude-code, codex). Forces
 *                    single-target mode for the session. Incompatible with `sync`.
 *   --update         Update installed project items from store and exit.
 *   --yes            Auto-confirm batched prompts (sync).
 *   --dry-run        Plan only, do not write (sync).
 *
 * Multi-target mode: a project that opts in by committing
 *   skillful.targets.json   { "targets": ["claude-code", "opencode"] }
 * will install/uninstall across every listed target in one action.
 */
import React from "react";
import { render } from "ink";
import { detectExactProjectContext, detectProjectContext } from "./lib/project-context.js";
import {
  buildStoreViewForTargets,
  initAdapters,
  resolveOptionalTargetFlag,
  installItemForTargets,
} from "./lib/target-manager.js";
import { loadSettings } from "./lib/settings.js";
import { loadRegistry } from "./lib/projects.js";
import { loadProjectTargets } from "./lib/project-targets.js";
import { loadMergedIndexFromConfiguredSources } from "./lib/source-sync.js";
import type { TargetId, AppView, StoreSource, StoreItemMeta } from "./lib/types.js";
import StoreApp from "./components/StoreApp.js";
import { runSync } from "./lib/sync-cli.js";
import type { TargetAdapter } from "./lib/targets/shared.js";

function hasUpdateFlag(argv: string[] = process.argv.slice(2)): boolean {
  return argv.includes("--update");
}

function hasSyncSubcommand(argv: string[] = process.argv.slice(2)): boolean {
  for (const arg of argv) {
    if (arg.startsWith("--")) continue;
    return arg === "sync";
  }
  return false;
}

function hasFlag(name: string, argv: string[] = process.argv.slice(2)): boolean {
  return argv.includes(name);
}

function hasTargetFlag(argv: string[] = process.argv.slice(2)): boolean {
  return argv.some((arg) => arg === "--target" || arg.startsWith("--target="));
}

async function runSyncSubcommand(): Promise<number> {
  if (hasTargetFlag()) {
    console.error("`skillful sync` is incompatible with --target. Sync uses the targets declared in skillful.targets.json.");
    return 1;
  }
  const ctx = detectExactProjectContext();
  if (ctx.mode !== "project") {
    console.error("`skillful sync` must be run from a project root (contains .git or .opencode).");
    return 1;
  }
  const projectTargets = ctx.projectDir ? loadProjectTargets(ctx.projectDir) : null;
  if (!projectTargets || projectTargets.length < 2) {
    console.error("`skillful sync` requires skillful.targets.json at the project root listing at least 2 targets.");
    return 1;
  }
  const adapters = await initAdapters(projectTargets);
  const adapterMap = {
    get(id: TargetId): TargetAdapter {
      const idx = projectTargets.indexOf(id);
      if (idx === -1) throw new Error(`No adapter loaded for target '${id}'.`);
      return adapters[idx];
    },
  };
  const loaded = await loadEffectiveIndex();
  return runSync(projectTargets, ctx, loaded.items, adapterMap, {
    yes: hasFlag("--yes"),
    dryRun: hasFlag("--dry-run"),
  });
}

async function loadEffectiveIndex(): Promise<{ items: StoreItemMeta[]; sources: StoreSource[] }> {
  const merged = await loadMergedIndexFromConfiguredSources();
  return {
    items: merged.index.items,
    sources: merged.sources,
  };
}

async function runProjectUpdate(targetIds: TargetId[]): Promise<number> {
  const ctx = detectExactProjectContext();
  if (ctx.mode !== "project") {
    console.error("--update only works when run from an exact project root directory (contains .git or .opencode).");
    return 1;
  }

  const loaded = await loadEffectiveIndex();
  if (loaded.items.length === 0) {
    console.error("No items found in configured sources.");
    return 1;
  }

  const view = buildStoreViewForTargets(loaded.items, targetIds, ctx);
  const items = [...view.agents, ...view.commands, ...view.skills, ...view.providers, ...view.mcps, ...view.configs];

  // Anything installed in *any* eligible target gets re-installed across all
  // eligible targets to bring everything to current store contents.
  const updatable = items.filter((item) => {
    const installedTargets = item.state.installedTargets ?? [];
    return installedTargets.length > 0;
  });

  let updated = 0;
  for (const item of updatable) {
    try {
      // Re-installing overwrites with the latest store content in every eligible target.
      installItemForTargets(item, targetIds, ctx);
      updated += 1;
    } catch (err) {
      console.error(`Failed to update ${item.type}:${item.id} - ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `Updated ${updated}/${updatable.length} items for project '${ctx.projectName ?? ctx.projectDir}' across targets [${targetIds.join(", ")}].`
  );
  return 0;
}

function parseSubcommand(argv: string[]): AppView | null {
  // Find the first non-flag argument
  for (const arg of argv) {
    if (arg.startsWith("--")) continue;
    if (arg === "manage") return "manage";
    if (arg === "projects") return "projects";
    if (arg === "settings") return "settings";
    // `sync` is handled separately before main()'s TUI path.
    break;
  }
  return null;
}

/**
 * Determine the targets for this session.
 *
 * Precedence:
 *   1. --target flag (explicit, single-target, locked for the session)
 *   2. skillful.targets.json at the current project root (multi-target)
 *   3. project registry entry's defaultTarget (single-target)
 *   4. user settings defaultTarget (single-target)
 *   5. "opencode" fallback
 */
function resolveStartupTargets(
  forcedFlag: TargetId | null,
  ctx: { projectDir?: string },
  settingsDefault: TargetId | undefined,
  registryDefault: TargetId | undefined
): { targetIds: TargetId[]; forced: boolean } {
  if (forcedFlag) return { targetIds: [forcedFlag], forced: true };

  if (ctx.projectDir) {
    const fileTargets = loadProjectTargets(ctx.projectDir);
    if (fileTargets && fileTargets.length > 0) {
      return { targetIds: fileTargets, forced: false };
    }
  }

  if (registryDefault) return { targetIds: [registryDefault], forced: false };
  if (settingsDefault) return { targetIds: [settingsDefault], forced: false };
  return { targetIds: ["opencode"], forced: false };
}

async function main() {
  if (hasSyncSubcommand()) {
    const code = await runSyncSubcommand();
    process.exit(code);
  }

  const settings = loadSettings();

  let forcedFlag: TargetId | null = null;
  try {
    forcedFlag = resolveOptionalTargetFlag();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Detect whether we're inside a project directory.
  const ctx = detectProjectContext();

  // Look up registry default for this project (if any).
  let registryDefault: TargetId | undefined;
  if (ctx.projectDir) {
    const registry = loadRegistry();
    const entry = registry.projects.find((p) => p.path === ctx.projectDir);
    registryDefault = entry?.defaultTarget;
  }

  const { targetIds, forced } = resolveStartupTargets(forcedFlag, ctx, settings.defaultTarget, registryDefault);

  // Determine which view to start in
  const rawArgv = process.argv.slice(2);
  // Strip --target and its value from argv before looking for subcommands
  const argv: string[] = [];
  for (let i = 0; i < rawArgv.length; i++) {
    if (rawArgv[i] === "--target") {
      i++; // skip the value too
      continue;
    }
    if (rawArgv[i].startsWith("--target=")) continue;
    argv.push(rawArgv[i]);
  }
  const explicitView = parseSubcommand(argv);

  // Lazy-load required adapter(s).
  await initAdapters(targetIds);

  if (hasUpdateFlag()) {
    const code = await runProjectUpdate(targetIds);
    process.exit(code);
  }

  // Load merged index from configured source caches.
  const loaded = await loadEffectiveIndex();
  const enabledSourceCount = loaded.sources.filter((source) => source.enabled).length;

  let startView: AppView;
  if (explicitView) {
    startView = explicitView;
  } else if (enabledSourceCount === 0) {
    startView = "settings";
  } else {
    const defaultView = settings.defaultView ?? "auto";
    if (defaultView === "auto") {
      startView = ctx.mode === "project" ? "manage" : "projects";
    } else {
      startView = defaultView;
    }
  }

  // Build the view with installed states, scoped to the detected context.
  const view = buildStoreViewForTargets(loaded.items, targetIds, ctx);

  // Render the TUI. When --target was passed, lock the session to that single target.
  render(
    React.createElement(StoreApp, {
      initialView: view,
      initialAppView: startView,
      forcedTargetId: forced ? targetIds[0] : undefined,
    })
  );
}

main();
