import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// SAFETY: never touch the real user config. The lib reads os.homedir(); pin it
// to a throwaway temp dir before importing anything that resolves paths.
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-resolve-"));
process.env.USERPROFILE = tmpHome;
process.env.HOME = tmpHome;

const { requireScope, requireTargets, resolveProjectContext } = await import("../resolve.js");
const { parseArgv } = await import("../parser.js");
const { CliError } = await import("../types.js");

function flagsOf(argv: string[]) {
  return parseArgv(argv).flags;
}

test("requireScope returns global|project", () => {
  assert.equal(requireScope(flagsOf(["--scope", "global"])), "global");
  assert.equal(requireScope(flagsOf(["--scope=project"])), "project");
});

test("requireScope throws MISSING_SCOPE when absent", () => {
  try {
    requireScope(flagsOf([]));
    assert.fail("expected throw");
  } catch (err) {
    assert.ok(err instanceof CliError);
    assert.equal((err as InstanceType<typeof CliError>).code, "MISSING_SCOPE");
  }
});

test("requireScope throws INVALID_SCOPE on bad value", () => {
  try {
    requireScope(flagsOf(["--scope", "user"]));
    assert.fail("expected throw");
  } catch (err) {
    assert.equal((err as InstanceType<typeof CliError>).code, "INVALID_SCOPE");
  }
});

test("requireTargets returns deduped, order-preserving list", () => {
  const targets = requireTargets(flagsOf(["--target", "claude-code", "--target", "opencode", "--target", "claude-code"]));
  assert.deepEqual(targets, ["claude-code", "opencode"]);
});

test("requireTargets throws MISSING_TARGET when none given", () => {
  try {
    requireTargets(flagsOf([]));
    assert.fail("expected throw");
  } catch (err) {
    assert.equal((err as InstanceType<typeof CliError>).code, "MISSING_TARGET");
  }
});

test("requireTargets throws MISSING_TARGET for a value-less boolean --target", () => {
  // `--target` with no following value parses as a boolean (empty string) and
  // must not be accepted as a real target.
  try {
    requireTargets(flagsOf(["--target"]));
    assert.fail("expected throw");
  } catch (err) {
    assert.equal((err as InstanceType<typeof CliError>).code, "MISSING_TARGET");
  }
});

test("requireTargets throws INVALID_TARGET on unknown value", () => {
  try {
    requireTargets(flagsOf(["--target", "vscode"]));
    assert.fail("expected throw");
  } catch (err) {
    assert.equal((err as InstanceType<typeof CliError>).code, "INVALID_TARGET");
    assert.deepEqual((err as InstanceType<typeof CliError>).details, { invalid: ["vscode"] });
  }
});

test("resolveProjectContext global ignores project flags", () => {
  const ctx = resolveProjectContext("global", flagsOf([]));
  assert.deepEqual(ctx, { mode: "global" });
});

test("resolveProjectContext project trusts explicit --project and derives basename", () => {
  const explicit = path.join(tmpHome, "my-repo");
  fs.mkdirSync(explicit, { recursive: true });
  const ctx = resolveProjectContext("project", flagsOf(["--project", explicit]));
  assert.equal(ctx.mode, "project");
  assert.equal(ctx.projectDir, path.resolve(explicit));
  assert.equal(ctx.projectName, "my-repo");
});

test("resolveProjectContext project with non-project cwd throws NOT_A_PROJECT", () => {
  const nonProject = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-noproj-"));
  const prevCwd = process.cwd();
  try {
    process.chdir(nonProject);
    resolveProjectContext("project", flagsOf([]));
    assert.fail("expected throw");
  } catch (err) {
    assert.ok(err instanceof CliError);
    assert.equal((err as InstanceType<typeof CliError>).code, "NOT_A_PROJECT");
  } finally {
    process.chdir(prevCwd);
  }
});
