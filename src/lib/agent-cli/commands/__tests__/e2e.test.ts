// End-to-end proof of the real install path, driving the CLI as a CHILD PROCESS
// (not in-process stdout capture). The TS entry is run directly via tsx so no
// build step is needed. Everything is fully offline: the source is cloned from a
// LOCAL git repo whose origin URL equals its own path, so later index loads are
// no-ops and no network is ever touched.
//
// SAFETY: every child runs with USERPROFILE+HOME pinned to a throwaway temp dir,
// so the real ~/.config/skillful, ~/.cache/skillful, and opencode config are
// never touched. Any JSON we seed is written BOM-free via fs.writeFileSync.

import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import type { Envelope } from "../../types.js";

// Repo root is 5 levels above this file:
// src/lib/agent-cli/commands/__tests__/e2e.test.ts → repoRoot.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..", "..", "..");
const cliEntry = path.join(repoRoot, "src", "cli.tsx");

const SKILL_ID = "e2e-skill";
const SOURCE_ID = "e2e";

/** Whether git is available; if not, the test self-skips rather than failing. */
function gitAvailable(): boolean {
  const probe = spawnSync("git", ["--version"], { encoding: "utf8" });
  return probe.status === 0;
}

/**
 * Build a real local git repo acting as a store source. `origin` is set to the
 * repo's own path so `ensureRepository` clones it once (cache dir is empty) and
 * subsequent loads see a matching origin and skip re-cloning.
 */
function makeStoreRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-e2e-store-"));

  const skillDir = path.join(repo, "store", "skills", SKILL_ID);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${SKILL_ID}\ndescription: An end-to-end fixture skill.\n---\n\nDo the thing.\n`,
    "utf-8"
  );

  // A command too, to exercise more of the store format (not strictly asserted).
  const cmdDir = path.join(repo, "store", "commands");
  fs.mkdirSync(cmdDir, { recursive: true });
  fs.writeFileSync(
    path.join(cmdDir, "e2e-cmd.md"),
    "---\ndescription: An end-to-end fixture command.\n---\n\nRun it.\n",
    "utf-8"
  );

  // Commit with git env that avoids signing/hooks/global-config interference.
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
  git([
    "-c",
    "user.email=t@t",
    "-c",
    "user.name=t",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-q",
    "-m",
    "init",
  ]);

  return repo;
}

/** Run the CLI as a child process with an isolated HOME; parse stdout as JSON. */
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

test("e2e: add local source → list → install → remove → idempotent remove (child process, offline)", { timeout: 120000 }, async (t) => {
  if (!gitAvailable()) {
    t.skip("git is not available in this environment");
    return;
  }

  const storeRepo = makeStoreRepo();
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-e2e-home-"));
  // Global opencode skill install location under the isolated HOME.
  const installedSkillDir = path.join(tmpHome, ".config", "opencode", "skills", SKILL_ID);
  const installedSkillFile = path.join(installedSkillDir, "SKILL.md");

  // 1. add source <localRepoPath> --id e2e → clone+index offline.
  const added = runCli(["add", "source", storeRepo, "--id", SOURCE_ID], tmpHome);
  assert.equal(added.code, 0, `add source exit; stdout: ${added.stdout}`);
  assert.equal(added.env.ok, true);
  const addedData = added.env.data as { source: { url: string; lastError: string | null }; changed: boolean };
  assert.equal(addedData.changed, true, "source should be newly added and indexed");
  assert.equal(addedData.source.lastError, null, "clone+index should succeed offline");
  assert.equal(addedData.source.url, storeRepo, "stored origin URL equals the local path");

  // 2. list skills --scope global --target opencode → fixture skill present.
  const listed = runCli(["list", "skills", "--scope", "global", "--target", "opencode"], tmpHome);
  assert.equal(listed.code, 0, `list skills exit; stdout: ${listed.stdout}`);
  assert.equal(listed.env.ok, true);
  const listData = listed.env.data as { items: Array<{ id: string; type: string }> };
  assert.ok(
    listData.items.some((i) => i.id === SKILL_ID && i.type === "skill"),
    `fixture skill '${SKILL_ID}' should be listed; got: ${listData.items.map((i) => i.id).join(", ")}`
  );

  // 3. install skill <id> --scope global --target opencode → file lands.
  const installed = runCli(
    ["install", "skill", SKILL_ID, "--scope", "global", "--target", "opencode"],
    tmpHome
  );
  assert.equal(installed.code, 0, `install exit; stdout: ${installed.stdout}`);
  assert.equal(installed.env.ok, true);
  const insData = installed.env.data as { changed: boolean; changedTargets: string[] };
  assert.equal(insData.changed, true);
  assert.ok(insData.changedTargets.includes("opencode"), "opencode should be a changed target");
  assert.equal(fs.existsSync(installedSkillFile), true, `skill file should exist at ${installedSkillFile}`);

  // 4. remove skill <id> → file gone, changed: true.
  const removed = runCli(
    ["remove", "skill", SKILL_ID, "--scope", "global", "--target", "opencode"],
    tmpHome
  );
  assert.equal(removed.code, 0, `remove exit; stdout: ${removed.stdout}`);
  assert.equal(removed.env.ok, true);
  const remData = removed.env.data as { changed: boolean };
  assert.equal(remData.changed, true);
  assert.equal(fs.existsSync(installedSkillDir), false, "skill folder should be gone after remove");

  // 5. remove again → idempotent no-op, changed: false.
  const removedAgain = runCli(
    ["remove", "skill", SKILL_ID, "--scope", "global", "--target", "opencode"],
    tmpHome
  );
  assert.equal(removedAgain.code, 0, `idempotent remove exit; stdout: ${removedAgain.stdout}`);
  assert.equal(removedAgain.env.ok, true);
  const remAgainData = removedAgain.env.data as { changed: boolean };
  assert.equal(remAgainData.changed, false, "removing an absent item is a no-op");
});
