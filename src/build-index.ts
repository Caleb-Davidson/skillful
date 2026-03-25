#!/usr/bin/env node
/**
 * Builds the store index.json from the store/ directory.
 * Run: npm run index
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndex } from "./lib/store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getProjectRoot(): string {
  let dir = __dirname;
  while (dir !== "/" && !fs.existsSync(path.join(dir, "store"))) {
    dir = path.dirname(dir);
  }
  return dir;
}

const index = buildIndex();
const outPath = path.join(getProjectRoot(), "index.json");
fs.writeFileSync(outPath, JSON.stringify(index, null, 2) + "\n", "utf-8");
console.log(`Wrote index.json with ${index.items.length} items`);
