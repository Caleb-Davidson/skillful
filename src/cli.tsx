#!/usr/bin/env node
/**
 * opencode-manager CLI entry point.
 * Launches the TUI storefront for managing OpenCode agents, commands, and skills.
 */
import React from "react";
import { render } from "ink";
import { loadIndex } from "./lib/store.js";
import { buildStoreView } from "./lib/config.js";
import StoreApp from "./components/StoreApp.js";

function main() {
  // Load the store index (scans store/ directory)
  const index = loadIndex();

  if (index.items.length === 0) {
    console.error("No items found in the store. Add agents, commands, or skills to the store/ directory.");
    process.exit(1);
  }

  // Build the view with installed states
  const view = buildStoreView(index.items);

  // Render the TUI
  render(React.createElement(StoreApp, { initialView: view }));
}

main();
