// End-to-end proof that a store skill installs as its whole directory: supporting
// files are copied, a reinstall replaces the folder, and mismatch detection covers
// every file in it, as `info` reports it. Everything runs through the real CLI as a
// child process, fully offline.
//
// SAFETY: identical isolation to e2e.test.ts — USERPROFILE/HOME are pinned to a
// throwaway temp dir for every child, and the project is a throwaway dir passed via
// --project.

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

const SKILL_ID = "dir-skill";
const SOURCE_ID = "skill-dir-e2e";
const SKILL_MD = `---\nname: ${SKILL_ID}\ndescription: A skill with supporting files.\n---\n\nRead finder.md and angles/correctness.md.\n`;
const FINDER = "Find candidates.\n";
const CORRECTNESS = "Check correctness.\n";

function gitAvailable(): boolean {
  return spawnSync("git", ["--version"], { encoding: "utf8" }).status === 0;
}

function gitIn(repo: string, args: string[]): void {
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], {
    cwd: repo,
    stdio: "ignore",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: path.join(repo, ".gitconfig-none"),
      GIT_CONFIG_SYSTEM: path.join(repo, ".gitconfig-none"),
      GIT_TERMINAL_PROMPT: "0",
    },
  });
}

/** A local git store repo holding one skill with a top-level and a nested supporting file. */
function makeStoreRepo(): { repo: string; skillDir: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-skilldir-store-"));
  const skillDir = path.join(repo, "store", "skills", SKILL_ID);
  fs.mkdirSync(path.join(skillDir, "angles"), { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), SKILL_MD, "utf-8");
  fs.writeFileSync(path.join(skillDir, "finder.md"), FINDER, "utf-8");
  fs.writeFileSync(path.join(skillDir, "angles", "correctness.md"), CORRECTNESS, "utf-8");

  gitIn(repo, ["init", "-q"]);
  gitIn(repo, ["add", "-A"]);
  gitIn(repo, ["commit", "-q", "-m", "init"]);
  return { repo, skillDir };
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

interface InfoItem {
  storeHash: string | null;
  state: { status: string | null; mismatch: boolean; perTarget: { targetId: string; mismatch: boolean }[] };
}

/** The skill as `info` reports it for the given scope and target flags. */
function infoSkill(flags: string[], tmpHome: string): InfoItem {
  const info = runCli(["info", "skill", SKILL_ID, ...flags], tmpHome);
  assert.equal(info.env.ok, true, `info; stdout: ${info.stdout}`);
  return (info.env.data as { item: InfoItem }).item;
}

function readLf(file: string): string {
  return fs.readFileSync(file, "utf-8").replace(/\r\n/g, "\n");
}

test("e2e: a skill installs, drifts, and reinstalls as its whole directory (claude-code, offline)", { timeout: 120000 }, async (t) => {
  if (!gitAvailable()) {
    t.skip("git is not available in this environment");
    return;
  }

  const { repo, skillDir } = makeStoreRepo();
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-skilldir-home-"));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-skilldir-proj-"));
  const installedDir = path.join(projectDir, ".claude", "skills", SKILL_ID);
  const proj = ["--scope", "project", "--project", projectDir, "--target", "claude-code"];

  const added = runCli(["add", "source", repo, "--id", SOURCE_ID], tmpHome);
  assert.equal(added.env.ok, true, `add source; stdout: ${added.stdout}`);

  // install → supporting files, nested ones included, land beside SKILL.md
  const installed = runCli(["install", "skill", SKILL_ID, ...proj], tmpHome);
  assert.equal(installed.env.ok, true, `install; stdout: ${installed.stdout}`);
  assert.equal(readLf(path.join(installedDir, "finder.md")), FINDER);
  assert.equal(readLf(path.join(installedDir, "angles", "correctness.md")), CORRECTNESS);

  const item = infoSkill(proj, tmpHome);
  assert.equal(item.state.mismatch, false, "no mismatch right after install");
  assert.equal(item.state.status, "installed");

  // editing only a supporting file is drift, reported as an older version
  fs.writeFileSync(path.join(installedDir, "angles", "correctness.md"), "Locally edited.\n", "utf-8");
  const drifted = infoSkill(proj, tmpHome);
  assert.equal(drifted.state.mismatch, true, "an edited supporting file is a mismatch");
  assert.equal(drifted.state.status, "older-version");
  assert.deepEqual(
    drifted.state.perTarget.map((p) => [p.targetId, p.mismatch]),
    [["claude-code", true]]
  );
  const listed = runCli(["list", "skills", ...proj], tmpHome);
  assert.equal(listed.env.ok, true, `list; stdout: ${listed.stdout}`);
  const listedItem = (listed.env.data as { items: Array<InfoItem & { id: string }> }).items.find((i) => i.id === SKILL_ID);
  assert.equal(listedItem?.state.status, "older-version", "list reports the drift too");

  // store commit: delete one supporting file, edit another
  const editedFinder = "Find candidates, then rank them.\n";
  fs.rmSync(path.join(skillDir, "angles", "correctness.md"));
  fs.writeFileSync(path.join(skillDir, "finder.md"), editedFinder, "utf-8");
  gitIn(repo, ["add", "-A"]);
  gitIn(repo, ["commit", "-q", "-m", "drop correctness, edit finder"]);

  const updated = runCli(["update", "source", SOURCE_ID], tmpHome);
  assert.equal(updated.env.ok, true, `update source; stdout: ${updated.stdout}`);
  assert.equal((updated.env.data as { changed: boolean }).changed, true, `source fetched; stdout: ${updated.stdout}`);

  const reinstalled = runCli(["install", "skill", SKILL_ID, ...proj], tmpHome);
  assert.equal(reinstalled.env.ok, true, `reinstall; stdout: ${reinstalled.stdout}`);
  assert.equal(
    fs.existsSync(path.join(installedDir, "angles", "correctness.md")),
    false,
    "a supporting file deleted from the store does not linger after reinstall"
  );
  assert.equal(readLf(path.join(installedDir, "finder.md")), editedFinder);

  const updatedItem = infoSkill(proj, tmpHome);
  assert.notEqual(updatedItem.storeHash, item.storeHash, "the store hash covers supporting files");
  assert.equal(updatedItem.state.mismatch, false, "no mismatch after reinstalling the updated skill");
  assert.equal(updatedItem.state.status, "installed");
});

test("e2e: an OpenCode skill install copies the whole directory (offline)", { timeout: 120000 }, async (t) => {
  if (!gitAvailable()) {
    t.skip("git is not available in this environment");
    return;
  }

  const { repo } = makeStoreRepo();
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-skilldir-home2-"));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-skilldir-proj2-"));
  const installedDir = path.join(projectDir, ".opencode", "skills", SKILL_ID);
  const proj = ["--scope", "project", "--project", projectDir, "--target", "opencode"];

  const added = runCli(["add", "source", repo, "--id", SOURCE_ID], tmpHome);
  assert.equal(added.env.ok, true, `add source; stdout: ${added.stdout}`);

  const installed = runCli(["install", "skill", SKILL_ID, ...proj], tmpHome);
  assert.equal(installed.env.ok, true, `install; stdout: ${installed.stdout}`);
  assert.equal(readLf(path.join(installedDir, "finder.md")), FINDER);
  assert.equal(readLf(path.join(installedDir, "angles", "correctness.md")), CORRECTNESS);
  assert.equal(infoSkill(proj, tmpHome).state.mismatch, false, "no mismatch right after install");

  fs.writeFileSync(path.join(installedDir, "finder.md"), "Locally edited.\n", "utf-8");
  assert.equal(infoSkill(proj, tmpHome).state.status, "older-version", "an edited supporting file is an older version");
});

test("e2e: an index cached by an older release is rebuilt, and an unsafe skill name is not indexed (offline)", { timeout: 120000 }, async (t) => {
  if (!gitAvailable()) {
    t.skip("git is not available in this environment");
    return;
  }

  const { repo } = makeStoreRepo();
  // A skill whose name would resolve its install folder to the parent of `skills/`.
  const escapeDir = path.join(repo, "store", "skills", "escape");
  fs.mkdirSync(escapeDir, { recursive: true });
  fs.writeFileSync(path.join(escapeDir, "SKILL.md"), "---\nname: ..\ndescription: Escapes skills/.\n---\n\nBody.\n", "utf-8");
  gitIn(repo, ["add", "-A"]);
  gitIn(repo, ["commit", "-q", "-m", "add escape"]);

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-skilldir-home3-"));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-skilldir-proj3-"));
  const proj = ["--scope", "project", "--project", projectDir, "--target", "claude-code"];

  const added = runCli(["add", "source", repo, "--id", SOURCE_ID], tmpHome);
  assert.equal(added.env.ok, true, `add source; stdout: ${added.stdout}`);

  // Age the cached index: an older shape version and a hash computed the old way. The source head is unchanged,
  // so only the version mismatch can trigger the rebuild.
  const indexPath = path.join(tmpHome, ".cache", "skillful", "sources", SOURCE_ID, "index.json");
  const index = JSON.parse(fs.readFileSync(indexPath, "utf-8")) as { version: number; items: Array<{ id: string; storeHash?: string }> };
  const realHash = index.items.find((i) => i.id === SKILL_ID)?.storeHash;
  index.version = 3;
  for (const item of index.items) if (item.id === SKILL_ID) item.storeHash = "stale";
  fs.writeFileSync(indexPath, JSON.stringify(index), "utf-8");

  assert.equal(infoSkill(proj, tmpHome).storeHash, realHash, "the stale index was rebuilt");

  const listed = runCli(["list", "skills", ...proj], tmpHome);
  assert.equal(listed.env.ok, true, `list; stdout: ${listed.stdout}`);
  const ids = (listed.env.data as { items: Array<{ id: string }> }).items.map((i) => i.id);
  assert.deepEqual(ids, [SKILL_ID], "the skill named '..' is not indexed");
});
