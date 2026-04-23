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
run("npm", ["run", "build"], "Compiling TypeScript to dist/");
run("npm", ["link"], "Creating global symlink for skillful");

console.log("\n✓ Setup complete! You can now run 'skillful' from anywhere.\n");
