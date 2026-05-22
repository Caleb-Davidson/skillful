#!/usr/bin/env node
/**
 * skillful CLI entry point.
 * Launches the TUI storefront for managing OpenCode agents, commands, and skills.
 *
 * Supports two startup modes via subcommands:
 *   skillful              — auto-detect (default view from settings)
 *   skillful manage       — jump to the store management view
 *   skillful projects     — jump to the projects view
 *
 * Options:
 *   --target <id>    Target adapter (opencode, claude-code, codex)
 *   --update         Update installed project items from store and exit
 */
import React from "react";
import { render } from "ink";
import { detectExactProjectContext, detectProjectContext } from "./lib/project-context.js";
import { buildStoreViewForTarget, initAdapter, resolveTargetId, installItemForTarget } from "./lib/target-manager.js";
import { loadSettings } from "./lib/settings.js";
import { loadMergedIndexFromConfiguredSources } from "./lib/source-sync.js";
import type { TargetId, AppView, StoreSource, StoreItemMeta } from "./lib/types.js";
import StoreApp from "./components/StoreApp.js";

function hasUpdateFlag(argv: string[] = process.argv.slice(2)): boolean {
  return argv.includes("--update");
}

async function loadEffectiveIndex(): Promise<{ items: StoreItemMeta[]; sources: StoreSource[] }> {
  const merged = await loadMergedIndexFromConfiguredSources();
  return {
    items: merged.index.items,
    sources: merged.sources,
  };
}

async function runProjectUpdate(targetId: TargetId): Promise<number> {
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

  const view = buildStoreViewForTarget(loaded.items, targetId, ctx);
  const items = [...view.agents, ...view.commands, ...view.skills, ...view.providers, ...view.mcps, ...view.configs];

  const updatable = items.filter((item) => {
    const supportMode = item.state.supportMode ?? "yes";
    return item.state.installed && supportMode === "yes";
  });

  let updated = 0;
  for (const item of updatable) {
    try {
      // Re-installing overwrites with the latest store content.
      installItemForTarget(item, targetId, ctx);
      updated += 1;
    } catch (err) {
      console.error(`Failed to update ${item.type}:${item.id} - ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `Updated ${updated}/${updatable.length} installed items for project '${ctx.projectName ?? ctx.projectDir}' using target '${targetId}'.`
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
    break;
  }
  return null;
}

async function main() {
  const settings = loadSettings();

  let targetId: TargetId = settings.defaultTarget ?? "opencode";
  try {
    targetId = resolveTargetId();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Detect whether we're inside a project directory
  const ctx = detectProjectContext();

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
  // Lazy-load only the required target adapter
  await initAdapter(targetId);

  if (hasUpdateFlag()) {
    const code = await runProjectUpdate(targetId);
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

  // Build the view with installed states, scoped to the detected context
  const view = buildStoreViewForTarget(loaded.items, targetId, ctx);

  // Render the TUI
  render(React.createElement(StoreApp, { initialView: view, initialAppView: startView }));
}

main();
