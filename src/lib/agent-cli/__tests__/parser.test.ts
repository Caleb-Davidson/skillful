import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgv } from "../parser.js";

test("parses positionals in order", () => {
  const { positionals } = parseArgv(["install", "skill", "pdf"]);
  assert.deepEqual(positionals, ["install", "skill", "pdf"]);
});

test("--flag=value form", () => {
  const { flags } = parseArgv(["--scope=project"]);
  assert.equal(flags.getOne("scope"), "project");
  assert.ok(flags.has("scope"));
});

test("--flag value form", () => {
  const { flags } = parseArgv(["--scope", "global"]);
  assert.equal(flags.getOne("scope"), "global");
});

test("repeated --target collects all values in order", () => {
  const { flags } = parseArgv(["--target", "opencode", "--target", "claude-code"]);
  assert.deepEqual(flags.getAll("target"), ["opencode", "claude-code"]);
  assert.equal(flags.getOne("target"), "opencode");
});

test("boolean --dry-run records empty value and reads as present", () => {
  const { flags } = parseArgv(["install", "skill", "pdf", "--dry-run"]);
  assert.ok(flags.has("dry-run"));
  assert.equal(flags.getOne("dry-run"), "");
});

test("boolean flag at end of argv does not consume a following flag", () => {
  const { flags } = parseArgv(["--dry-run", "--scope", "project"]);
  assert.equal(flags.getOne("dry-run"), "");
  assert.equal(flags.getOne("scope"), "project");
});

test("mixes positionals and flags", () => {
  const { positionals, flags } = parseArgv([
    "install",
    "skill",
    "pdf",
    "--scope",
    "project",
    "--target",
    "opencode",
    "--dry-run",
  ]);
  assert.deepEqual(positionals, ["install", "skill", "pdf"]);
  assert.equal(flags.getOne("scope"), "project");
  assert.deepEqual(flags.getAll("target"), ["opencode"]);
  assert.ok(flags.has("dry-run"));
});

test("absent flag: getOne undefined, getAll empty, has false", () => {
  const { flags } = parseArgv(["list", "skills"]);
  assert.equal(flags.getOne("scope"), undefined);
  assert.deepEqual(flags.getAll("scope"), []);
  assert.equal(flags.has("scope"), false);
});

test("--flag= yields empty-string value (explicitly present)", () => {
  const { flags } = parseArgv(["--name="]);
  assert.ok(flags.has("name"));
  assert.equal(flags.getOne("name"), "");
});
