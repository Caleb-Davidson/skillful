import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { hashSkillDir, replaceSkillDir } from "../skill-dir.js";

/** Write `files` (relative path → content) into a fresh temp dir, in the given order. */
function makeDir(files: Array<[string, string]>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-skill-dir-"));
  for (const [rel, content] of files) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf-8");
  }
  return dir;
}

const BASE: Array<[string, string]> = [
  ["SKILL.md", "---\nname: s\ndescription: d\n---\n\nBody.\n"],
  ["finder.md", "Find things.\n"],
  ["angles/correctness.md", "Check correctness.\n"],
];

test("hashSkillDir: independent of file creation order", () => {
  const forward = makeDir(BASE);
  const reversed = makeDir([...BASE].reverse());
  assert.equal(hashSkillDir(forward), hashSkillDir(reversed));
});

test("hashSkillDir: CRLF and LF content hash the same", () => {
  const lf = makeDir(BASE);
  const crlf = makeDir(BASE.map(([rel, content]) => [rel, content.replace(/\n/g, "\r\n")]));
  assert.equal(hashSkillDir(lf), hashSkillDir(crlf));
});

test("hashSkillDir: changes when any file is edited, added, or removed", () => {
  const baseline = hashSkillDir(makeDir(BASE));

  const edited = makeDir(BASE.map(([rel, content]) => [rel, rel === "angles/correctness.md" ? "Changed.\n" : content]));
  assert.notEqual(hashSkillDir(edited), baseline, "editing a nested supporting file");

  const added = makeDir([...BASE, ["extra.md", "More.\n"]]);
  assert.notEqual(hashSkillDir(added), baseline, "adding a file");

  const removed = makeDir(BASE.filter(([rel]) => rel !== "finder.md"));
  assert.notEqual(hashSkillDir(removed), baseline, "removing a file");
});

test("replaceSkillDir: destination mirrors the source exactly", () => {
  const src = makeDir(BASE);
  const dest = makeDir([["stale.md", "Old.\n"], ["SKILL.md", "Old skill.\n"]]);

  replaceSkillDir(src, dest);

  assert.equal(fs.existsSync(path.join(dest, "stale.md")), false, "files absent from the source are removed");
  assert.equal(hashSkillDir(dest), hashSkillDir(src));
});

test("replaceSkillDir: creates a destination whose parent does not exist yet", () => {
  const src = makeDir(BASE);
  const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "skillful-skill-dir-")), "skills", "s");

  replaceSkillDir(src, dest);

  assert.equal(hashSkillDir(dest), hashSkillDir(src));
});
