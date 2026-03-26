#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliTsx = join(__dirname, "../src/cli.tsx");

// Use npx on all platforms, but let spawnSync use shell on Windows
// to correctly resolve npx.cmd
const result = spawnSync("npx", ["--no-install", "tsx", cliTsx, ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
