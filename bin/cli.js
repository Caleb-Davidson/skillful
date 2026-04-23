#!/usr/bin/env node
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distCli = join(__dirname, "../dist/cli.js");
const srcCli = join(__dirname, "../src/cli.tsx");

// Prefer the pre-compiled dist/ version for fast startup.
// Fall back to tsx (dev mode) only when dist/ doesn't exist.
if (existsSync(distCli)) {
  await import(resolve(distCli));
} else {
  // Dev fallback — transpile on the fly via tsx
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync("npx", ["--no-install", "tsx", srcCli, ...process.argv.slice(2)], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(result.error);
  }

  process.exit(result.status ?? 1);
}
