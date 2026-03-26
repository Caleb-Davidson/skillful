#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const isWindows = process.platform === "win32";

function run(command, args, label) {
  console.log(`\n▶ ${label}...`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: isWindows,
  });
  if (result.error) {
    console.error(`Failed to run ${command}:`, result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

run("npm", ["install"], "Installing dependencies");
run("npm", ["install", "-g", "tsx"], "Installing tsx globally");
run("npm", ["link"], "Creating global symlink for opencode-manager");

console.log("\n✓ Setup complete! You can now run 'opencode-manager' from anywhere.\n");
