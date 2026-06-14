import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// SAFETY: never touch the real ~/.config/skillful, ~/.cache/skillful, or the
// user's project dirs. Every path-resolving lib reads os.homedir() at module
// load, so pin HOME/USERPROFILE to a throwaway temp dir BEFORE importing any
// project module. All project imports below are therefore dynamic.
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-items-cli-"));
process.env.USERPROFILE = tmpHome;
process.env.HOME = tmpHome;

import { execFileSync } from "node:child_process";

const { dispatch, buildRegistry } = await import("../../dispatch.js");
const { itemCommands } = await import("../items.js");
const { saveSourceRegistry } = await import("../../../sources.js");
const { getSourceIndexPath, getSourceRepoDir } = await import("../../../sources.js");
const { initAdapters } = await import("../../../target-manager.js");
const { loadMergedIndexFromConfiguredSources } = await import("../../../source-sync.js");
import type { Envelope } from "../../types.js";
import type { StoreIndex, StoreItemMeta } from "../../../types.js";

const registry = buildRegistry(itemCommands);

const FIXTURE_URL = "https://example.com/fixture.git";
const FIXTURE_CMD_ID = "demo-cmd";

/**
 * Seed a fully-offline source. `loadMergedIndexFromConfiguredSources` runs
 * `ensureRepository`, which only clones when the cache repo dir is missing or
 * its `origin` remote URL differs from the source URL — so we pre-create the
 * cache repo as a real *local* git repo whose `origin` points at the source URL
 * and whose `store/` holds a real command markdown. No network is ever touched.
 * `sourceRoot` is the repo dir, so `resolveStoreItemPath` reads `<repo>/store/...`.
 *
 * This runs ONCE at module load (below), deliberately BEFORE any test swaps
 * `process.stdout.write`: the `git` subprocess spawns block the event loop, and
 * doing that next to a swapped stdout lets tsx/esbuild IPC bytes leak into the
 * captured envelope. Seeding up front keeps every capture window clean.
 */
function seedCommandSource(sourceId = "fixture"): void {
  const repoDir = getSourceRepoDir(sourceId);
  fs.rmSync(repoDir, { recursive: true, force: true });
  const commandsDir = path.join(repoDir, "store", "commands");
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.writeFileSync(
    path.join(commandsDir, `${FIXTURE_CMD_ID}.md`),
    "---\ndescription: Demo command\n---\n\nRun the demo.\n",
    "utf-8"
  );

  // Local git repo with a matching origin so ensureRepository is a no-op.
  const git = (args: string[]): void => {
    execFileSync("git", args, { cwd: repoDir, stdio: "ignore" });
  };
  git(["init", "-q"]);
  git(["remote", "add", "origin", FIXTURE_URL]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "fixture"]);

  const item: StoreItemMeta = {
    id: FIXTURE_CMD_ID,
    type: "command",
    name: FIXTURE_CMD_ID,
    description: "Demo command",
    tags: [],
    path: `commands/${FIXTURE_CMD_ID}.md`,
    sourceId,
    sourceLabel: "Fixture",
    sourceRoot: repoDir,
    storeHash: "deadbeef",
  };
  const index: StoreIndex = { version: 3, items: [item] };

  // Write the cache index WITHOUT a BOM (fs.writeFileSync, not Set-Content).
  const indexPath = getSourceIndexPath(sourceId);
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n", "utf-8");

  saveSourceRegistry({
    sources: [{ id: sourceId, name: "Fixture", url: FIXTURE_URL, enabled: true, priority: 0 }],
  });
}

// One-time setup, BEFORE any stdout swap:
//  1. Seed the offline git-backed fixture source (the git spawns happen here).
//  2. Pre-warm all adapters and force one merged-index load, so every
//     transitive `.ts` is compiled by tsx/esbuild up front. The dispatch path
//     then hits only warm modules, keeping captured stdout pure JSON.
seedCommandSource();
await initAdapters(["opencode", "claude-code", "codex"]);
await loadMergedIndexFromConfiguredSources();

/**
 * Run one command through the real dispatcher, capturing the emitted envelope.
 *
 * The dispatcher's `emit()` always writes a single string chunk
 * (`JSON.stringify(...) + "\n"`). Under the node:test runner + tsx, unrelated
 * binary chunks (esbuild IPC / TAP framing as Buffers) can transiently hit fd 1
 * while it's swapped; we therefore accumulate ONLY string chunks and forward
 * everything else to the real stdout, so the captured buffer is pure JSON.
 */
async function run(argv: string[]): Promise<{ code: number; env: Envelope }> {
  const original = process.stdout.write.bind(process.stdout);
  let out = "";
  (process.stdout.write as unknown as (chunk: unknown, ...rest: unknown[]) => boolean) = (
    chunk: unknown,
    ...rest: unknown[]
  ): boolean => {
    if (typeof chunk === "string") {
      out += chunk;
      return true;
    }
    return (original as unknown as (...args: unknown[]) => boolean)(chunk, ...rest);
  };
  let code: number;
  try {
    code = await dispatch(argv, registry);
  } finally {
    process.stdout.write = original;
  }
  return { code, env: JSON.parse(out) as Envelope };
}

/** A fresh temp project dir marked with .git so it resolves as a real project. */
function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-items-proj-"));
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
  return dir;
}

// ── Flag-contract validation (no disk writes) ──

test("missing --scope is MISSING_SCOPE (exit 1)", async () => {
  const { code, env } = await run(["install", "skill", "x"]);
  assert.equal(code, 1);
  assert.equal(env.ok, false);
  assert.equal(env.error?.code, "MISSING_SCOPE");
});

test("missing --target is MISSING_TARGET (exit 1)", async () => {
  const { code, env } = await run(["install", "skill", "x", "--scope", "global"]);
  assert.equal(code, 1);
  assert.equal(env.error?.code, "MISSING_TARGET");
});

test("invalid --target is INVALID_TARGET (exit 1)", async () => {
  const { code, env } = await run(["list", "skills", "--scope", "global", "--target", "foo"]);
  assert.equal(code, 1);
  assert.equal(env.error?.code, "INVALID_TARGET");
});

test("invalid --scope is INVALID_SCOPE (exit 1)", async () => {
  const { code, env } = await run(["list", "skills", "--scope", "sideways", "--target", "opencode"]);
  assert.equal(code, 1);
  assert.equal(env.error?.code, "INVALID_SCOPE");
});

test("--scope project with a non-project cwd and no --project is NOT_A_PROJECT (exit 1)", async () => {
  const nonProject = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-items-noproj-"));
  const original = process.cwd();
  try {
    process.chdir(nonProject);
    const { code, env } = await run(["list", "skills", "--scope", "project", "--target", "opencode"]);
    assert.equal(code, 1);
    assert.equal(env.error?.code, "NOT_A_PROJECT");
  } finally {
    process.chdir(original);
  }
});

// ── list shape ──

test("list configs returns the documented shape with echoed scope/targets", async () => {
  // Built-in CLAUDE.md redirect is a config; listable offline with claude-code.
  const { code, env } = await run(["list", "configs", "--scope", "global", "--target", "claude-code"]);
  assert.equal(code, 0);
  assert.equal(env.ok, true);
  const data = env.data as {
    scope: string;
    projectDir: string | null;
    projectName: string | null;
    targets: string[];
    type: string;
    count: number;
    items: Array<{ id: string; type: string }>;
  };
  assert.equal(data.scope, "global");
  assert.equal(data.projectDir, null);
  assert.equal(data.projectName, null);
  assert.deepEqual(data.targets, ["claude-code"]);
  assert.equal(data.type, "config");
  assert.equal(data.count, data.items.length);
  assert.ok(data.items.some((i) => i.id === "claude-md-redirect" && i.type === "config"));
});

// ── not found ──

test("install <unknown id> is ITEM_NOT_FOUND (exit 2)", async () => {
  const { code, env } = await run(["install", "skill", "no-such-skill", "--scope", "global", "--target", "opencode"]);
  assert.equal(code, 2);
  assert.equal(env.error?.code, "ITEM_NOT_FOUND");
  assert.deepEqual(env.error?.details, { type: "skill", id: "no-such-skill" });
});

// ── happy-path install → remove → remove-again (idempotency) against a temp project ──

test("install then remove a command against a temp project; file lands then is gone; remove is idempotent", async () => {
  const id = FIXTURE_CMD_ID;
  const projectDir = makeProject();
  const installedPath = path.join(projectDir, ".opencode", "commands", `${id}.md`);

  // install
  const installed = await run([
    "install",
    "command",
    id,
    "--scope",
    "project",
    "--project",
    projectDir,
    "--target",
    "opencode",
  ]);
  assert.equal(installed.code, 0);
  assert.equal(installed.env.ok, true);
  const insData = installed.env.data as {
    item: { type: string; id: string };
    changed: boolean;
    changedTargets: string[];
    eligibleTargets: string[];
    requestedTargets: string[];
    skipped: unknown[];
    projectDir: string;
    dryRun: boolean;
  };
  assert.equal(insData.changed, true);
  assert.deepEqual(insData.changedTargets, ["opencode"]);
  assert.deepEqual(insData.eligibleTargets, ["opencode"]);
  assert.deepEqual(insData.requestedTargets, ["opencode"]);
  assert.deepEqual(insData.skipped, []);
  assert.equal(insData.dryRun, false);
  assert.equal(insData.projectDir, projectDir);
  assert.equal(fs.existsSync(installedPath), true);

  // remove → file gone, changed: true
  const removed = await run([
    "remove",
    "command",
    id,
    "--scope",
    "project",
    "--project",
    projectDir,
    "--target",
    "opencode",
  ]);
  assert.equal(removed.code, 0);
  const remData = removed.env.data as { changed: boolean; changedTargets: string[] };
  assert.equal(remData.changed, true);
  assert.deepEqual(remData.changedTargets, ["opencode"]);
  assert.equal(fs.existsSync(installedPath), false);

  // remove again → idempotent no-op, changed: false
  const removedAgain = await run([
    "remove",
    "command",
    id,
    "--scope",
    "project",
    "--project",
    projectDir,
    "--target",
    "opencode",
  ]);
  assert.equal(removedAgain.code, 0);
  assert.equal(removedAgain.env.ok, true);
  const remAgainData = removedAgain.env.data as { changed: boolean; changedTargets: string[] };
  assert.equal(remAgainData.changed, false);
  assert.deepEqual(remAgainData.changedTargets, []);
});

// ── NOT_ELIGIBLE + skipped reason: codex cannot install commands ──

test("install command for codex only is NOT_ELIGIBLE with a skipped reason (exit 3)", async () => {
  const { code, env } = await run(["install", "command", FIXTURE_CMD_ID, "--scope", "global", "--target", "codex"]);
  assert.equal(code, 3);
  assert.equal(env.error?.code, "NOT_ELIGIBLE");
  const details = env.error?.details as { skipped: Array<{ targetId: string; reason: string }> };
  assert.equal(details.skipped.length, 1);
  assert.equal(details.skipped[0].targetId, "codex");
  assert.ok(details.skipped[0].reason.length > 0);
});
