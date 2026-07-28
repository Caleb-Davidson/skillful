// End-to-end proof of the `include` item type: a plain-markdown file shipped
// from a store source and installed into the PROJECT ROOT (so AGENTS.md can
// `@`-include it), driven through the real CLI as a child process, fully offline.
//
// SAFETY: identical isolation to e2e.test.ts — USERPROFILE/HOME are pinned to a
// throwaway temp dir, and the project is a throwaway dir passed via --project.

import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import type { Envelope } from "../../types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..", "..", "..");
const cliEntry = path.join(repoRoot, "src", "cli.tsx");

const INCLUDE_ID = "agent-workflow";
const SOURCE_ID = "inc-e2e";
const INCLUDE_HEADING = "Agent Workflow";
const INCLUDE_BODY = `# ${INCLUDE_HEADING}\n\n1. Claim the work item.\n2. Open a worktree.\n3. Run the gate.\n`;

function gitAvailable(): boolean {
  return spawnSync("git", ["--version"], { encoding: "utf8" }).status === 0;
}

/** A local git store repo containing a single frontmatter-free include file. */
function makeStoreRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-inc-store-"));

  const includesDir = path.join(repo, "store", "includes");
  fs.mkdirSync(includesDir, { recursive: true });
  fs.writeFileSync(path.join(includesDir, `${INCLUDE_ID}.md`), INCLUDE_BODY, "utf-8");

  const git = (args: string[]): void => {
    execFileSync("git", args, {
      cwd: repo,
      stdio: "ignore",
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: path.join(repo, ".gitconfig-none"),
        GIT_CONFIG_SYSTEM: path.join(repo, ".gitconfig-none"),
        GIT_TERMINAL_PROMPT: "0",
      },
    });
  };
  git(["init", "-q"]);
  git(["-c", "user.email=t@t", "-c", "user.name=t", "add", "-A"]);
  git(["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "init"]);

  return repo;
}

function runCli(args: string[], tmpHome: string): { code: number | null; env: Envelope; stdout: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", cliEntry, ...args], {
    env: { ...process.env, USERPROFILE: tmpHome, HOME: tmpHome },
    encoding: "utf8",
  });
  let env: Envelope;
  try {
    env = JSON.parse(result.stdout) as Envelope;
  } catch (err) {
    throw new Error(
      `Failed to parse CLI stdout as JSON for [${args.join(" ")}].\n` +
        `exit=${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}\n(${String(err)})`
    );
  }
  return { code: result.status, env, stdout: result.stdout };
}

test("e2e: include installs into the project root and round-trips (claude-code, offline)", { timeout: 120000 }, async (t) => {
  if (!gitAvailable()) {
    t.skip("git is not available in this environment");
    return;
  }

  const storeRepo = makeStoreRepo();
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-inc-home-"));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-inc-proj-"));
  const installedFile = path.join(projectDir, `${INCLUDE_ID}.md`);

  const proj = ["--scope", "project", "--project", projectDir, "--target", "claude-code"];

  // add source (offline clone+index)
  const added = runCli(["add", "source", storeRepo, "--id", SOURCE_ID], tmpHome);
  assert.equal(added.code, 0, `add source exit; stdout: ${added.stdout}`);
  assert.equal(added.env.ok, true);

  // list includes → fixture present with the heading-derived description
  const listed = runCli(["list", "includes", ...proj], tmpHome);
  assert.equal(listed.code, 0, `list includes exit; stdout: ${listed.stdout}`);
  assert.equal(listed.env.ok, true);
  const listData = listed.env.data as { items: Array<{ id: string; type: string; description: string }> };
  const row = listData.items.find((i) => i.id === INCLUDE_ID);
  assert.ok(row, `fixture include '${INCLUDE_ID}' should be listed; got: ${listData.items.map((i) => i.id).join(", ")}`);
  assert.equal(row.type, "include");
  assert.equal(row.description, INCLUDE_HEADING, "description derives from the first heading, stripped of '#'");

  // install → file lands in the PROJECT ROOT with byte-identical content
  const installed = runCli(["install", "include", INCLUDE_ID, ...proj], tmpHome);
  assert.equal(installed.code, 0, `install exit; stdout: ${installed.stdout}`);
  assert.equal(installed.env.ok, true);
  const insData = installed.env.data as { changed: boolean; changedTargets: string[] };
  assert.equal(insData.changed, true);
  assert.ok(insData.changedTargets.includes("claude-code"), "claude-code should be a changed target");
  assert.equal(fs.existsSync(installedFile), true, `include should exist at project root: ${installedFile}`);
  // Normalize EOL: git may check the store file out as CRLF on Windows, so the
  // copied file's line endings follow the platform — the content is what matters.
  const installedContent = fs.readFileSync(installedFile, "utf-8").replace(/\r\n/g, "\n");
  assert.equal(installedContent, INCLUDE_BODY, "installed content matches the store source");

  // remove → gone
  const removed = runCli(["remove", "include", INCLUDE_ID, ...proj], tmpHome);
  assert.equal(removed.code, 0, `remove exit; stdout: ${removed.stdout}`);
  assert.equal(removed.env.ok, true);
  assert.equal((removed.env.data as { changed: boolean }).changed, true);
  assert.equal(fs.existsSync(installedFile), false, "include file should be gone after remove");

  // remove again → idempotent no-op
  const removedAgain = runCli(["remove", "include", INCLUDE_ID, ...proj], tmpHome);
  assert.equal(removedAgain.code, 0, `idempotent remove exit; stdout: ${removedAgain.stdout}`);
  assert.equal(removedAgain.env.ok, true);
  assert.equal((removedAgain.env.data as { changed: boolean }).changed, false, "removing an absent include is a no-op");
});

test("e2e: include install is refused at global scope (project-only), offline", { timeout: 120000 }, async (t) => {
  if (!gitAvailable()) {
    t.skip("git is not available in this environment");
    return;
  }

  const storeRepo = makeStoreRepo();
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-inc-home2-"));

  const added = runCli(["add", "source", storeRepo, "--id", SOURCE_ID], tmpHome);
  assert.equal(added.env.ok, true, `add source; stdout: ${added.stdout}`);

  // Global scope: claude-code supports includes only partially (project-only), so
  // the install is attempted and the adapter refuses — mirroring the CLAUDE.md
  // redirect config item. The whole install fails; nothing is written globally.
  const installed = runCli(["install", "include", INCLUDE_ID, "--scope", "global", "--target", "claude-code"], tmpHome);
  assert.equal(installed.env.ok, false, `global-scope include install should fail; stdout: ${installed.stdout}`);
  assert.equal(installed.env.error?.code, "OPERATION_FAILED", "global include install fails at the adapter");
  const details = installed.env.error?.details as { failures?: Array<{ targetId: string; error: string }> };
  const failure = (details.failures ?? []).find((f) => f.targetId === "claude-code");
  assert.ok(failure, `claude-code should be a reported failure; stdout: ${installed.stdout}`);
  assert.match(failure.error, /project root/, "the refusal explains includes are project-scoped");
});
