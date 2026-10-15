import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { hashSkillDir, isSafeSkillId, replaceSkillDir } from "../skill-dir.js";

/** Write `files` (relative path → content) into a fresh temp dir, in the given order. */
function makeDir(files: Array<[string, string | Buffer]>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-skill-dir-"));
  for (const [rel, content] of files) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

/** A not-yet-created `<tmp>/skills/<id>` install destination. */
function skillDest(id = "s"): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "skillful-skill-dir-")), "skills", id);
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

test("hashSkillDir: CRLF, lone CR, and LF content hash the same", () => {
  const lf = makeDir(BASE);
  const crlf = makeDir(BASE.map(([rel, content]) => [rel, content.replace(/\n/g, "\r\n")]));
  const cr = makeDir(BASE.map(([rel, content]) => [rel, content.replace(/\n/g, "\r")]));
  assert.equal(hashSkillDir(lf), hashSkillDir(crlf));
  assert.equal(hashSkillDir(lf), hashSkillDir(cr));
});

test("hashSkillDir: changes when any file is edited, added, removed, or renamed", () => {
  const baseline = hashSkillDir(makeDir(BASE));

  const edited = makeDir(BASE.map(([rel, content]) => [rel, rel === "angles/correctness.md" ? "Changed.\n" : content]));
  assert.notEqual(hashSkillDir(edited), baseline, "editing a nested supporting file");

  const added = makeDir([...BASE, ["extra.md", "More.\n"]]);
  assert.notEqual(hashSkillDir(added), baseline, "adding a file");

  const removed = makeDir(BASE.filter(([rel]) => rel !== "finder.md"));
  assert.notEqual(hashSkillDir(removed), baseline, "removing a file");

  const renamed = makeDir(BASE.map(([rel, content]) => [rel === "finder.md" ? "finder2.md" : rel, content]));
  assert.notEqual(hashSkillDir(renamed), baseline, "renaming a file");
});

test("hashSkillDir: distinguishes binary files that aren't valid UTF-8", () => {
  const a = makeDir([...BASE, ["icon.bin", Buffer.from([0xff, 0xfe, 0x00, 0x01])]]);
  const b = makeDir([...BASE, ["icon.bin", Buffer.from([0xff, 0xfe, 0x00, 0x02])]]);
  assert.notEqual(hashSkillDir(a), hashSkillDir(b));
});

test("hashSkillDir: ignores OS metadata files", () => {
  const clean = makeDir(BASE);
  const withJunk = makeDir([...BASE, [".DS_Store", "x"], ["angles/Thumbs.db", "y"], ["desktop.ini", "z"]]);
  assert.equal(hashSkillDir(withJunk), hashSkillDir(clean));
});

test("isSafeSkillId: accepts one path segment only", () => {
  for (const id of ["pr-review", "code_comments", "v1.2"]) assert.equal(isSafeSkillId(id), true, id);
  for (const id of ["", ".", "..", "a/b", "a\\b", "../x", "C:x"]) assert.equal(isSafeSkillId(id), false, id);
});

test("replaceSkillDir: destination mirrors the source exactly", () => {
  const src = makeDir(BASE);
  const dest = skillDest();
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, "stale.md"), "Old.\n");
  fs.writeFileSync(path.join(dest, "SKILL.md"), "Old skill.\n");

  replaceSkillDir(src, dest);

  assert.equal(fs.existsSync(path.join(dest, "stale.md")), false, "files absent from the source are removed");
  assert.equal(hashSkillDir(dest), hashSkillDir(src));
});

test("replaceSkillDir: creates a destination whose parent does not exist yet", () => {
  const src = makeDir(BASE);
  const dest = skillDest();

  replaceSkillDir(src, dest);

  assert.equal(hashSkillDir(dest), hashSkillDir(src));
});

test("replaceSkillDir: refuses a destination that isn't a folder inside a skills directory", () => {
  const src = makeDir(BASE);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-skill-dir-"));
  const keep = path.join(root, "keep.md");
  fs.writeFileSync(keep, "Keep me.\n");

  // What path.join(base, "skills", "..") and (base, "skills", ".") resolve to.
  for (const dest of [root, path.join(root, "skills"), path.join(root, "other", "s")]) {
    assert.throws(() => replaceSkillDir(src, dest), /Refusing to replace/, dest);
  }
  assert.equal(fs.existsSync(keep), true, "nothing was deleted");
});
