#!/usr/bin/env node
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distCli = join(__dirname, "../dist/cli.js");
const srcCli = join(__dirname, "../src/cli.tsx");

// Prefer the pre-compiled dist/ version for fast startup.
// Fall back to tsx (dev mode) only when dist/ doesn't exist.
if (existsSync(distCli)) {
  // Convert to a file:// URL so Windows absolute paths (e.g. C:\...) aren't
  // misread as a URL scheme by the ESM loader.
  await import(pathToFileURL(resolve(distCli)).href);
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
