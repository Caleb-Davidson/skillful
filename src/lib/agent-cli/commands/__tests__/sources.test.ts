import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// SAFETY: never touch the real ~/.config/skillful/sources.json or ~/.cache.
// sources.ts resolves CONFIG_DIR/CACHE_BASE from os.homedir() at module load, so
// pin HOME/USERPROFILE to a throwaway temp dir BEFORE importing anything that
// resolves those paths. All project imports below are dynamic for this reason.
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "skillful-sources-cli-"));
process.env.USERPROFILE = tmpHome;
process.env.HOME = tmpHome;

const { dispatch, buildRegistry } = await import("../../dispatch.js");
const { sourceCommands } = await import("../sources.js");
const { saveSourceRegistry, loadSourceRegistry } = await import("../../../sources.js");
import type { Envelope } from "../../types.js";
import type { StoreSource } from "../../../types.js";

const registry = buildRegistry(sourceCommands);

/** Run one command through the real dispatcher, capturing the emitted envelope. */
async function run(argv: string[]): Promise<{ code: number; env: Envelope }> {
  const original = process.stdout.write.bind(process.stdout);
  let out = "";
  (process.stdout.write as unknown as (chunk: string) => boolean) = (chunk: string): boolean => {
    out += chunk;
    return true;
  };
  let code: number;
  try {
    code = await dispatch(argv, registry);
  } finally {
    process.stdout.write = original;
  }
  return { code, env: JSON.parse(out) as Envelope };
}

/** Reset the isolated registry to a known set of sources before each scenario. */
function seed(sources: Array<Omit<StoreSource, "priority"> & { priority?: number }>): void {
  saveSourceRegistry({
    sources: sources.map((source, index) => ({ priority: index, ...source })),
  });
}

const SEED: Array<Omit<StoreSource, "priority">> = [
  { id: "alpha", name: "Alpha", url: "https://example.com/alpha.git", enabled: true },
  { id: "beta", name: "Beta", url: "https://example.com/beta.git", enabled: false, branch: "dev" },
];

test("list sources returns the seeded sources, including disabled", async () => {
  seed(SEED);
  const { code, env } = await run(["list", "sources"]);
  assert.equal(code, 0);
  assert.equal(env.ok, true);
  const data = env.data as { count: number; sources: Array<{ id: string; enabled: boolean }> };
  assert.equal(data.count, 2);
  assert.deepEqual(
    data.sources.map((s) => s.id),
    ["alpha", "beta"],
  );
  // disabled source is included
  assert.equal(data.sources.find((s) => s.id === "beta")?.enabled, false);
});

test("remove source removes an existing source (changed: true)", async () => {
  seed(SEED);
  const { code, env } = await run(["remove", "source", "alpha"]);
  assert.equal(code, 0);
  assert.equal(env.ok, true);
  assert.deepEqual(env.data, { id: "alpha", changed: true });
  assert.equal(loadSourceRegistry().sources.find((s) => s.id === "alpha"), undefined);
});

test("remove source on an unknown id returns SOURCE_NOT_FOUND (exit 2)", async () => {
  seed(SEED);
  const { code, env } = await run(["remove", "source", "nope"]);
  assert.equal(code, 2);
  assert.equal(env.ok, false);
  assert.equal(env.error?.code, "SOURCE_NOT_FOUND");
  assert.deepEqual(env.error?.details, { id: "nope" });
});

test("enable source flips a disabled source (changed: true) and is idempotent (changed: false)", async () => {
  seed(SEED);
  const first = await run(["enable", "source", "beta"]);
  assert.equal(first.code, 0);
  const firstData = first.env.data as { source: { enabled: boolean }; changed: boolean };
  assert.equal(firstData.source.enabled, true);
  assert.equal(firstData.changed, true);

  const second = await run(["enable", "source", "beta"]);
  const secondData = second.env.data as { changed: boolean };
  assert.equal(secondData.changed, false);
});

test("disable source flips an enabled source (changed: true)", async () => {
  seed(SEED);
  const { code, env } = await run(["disable", "source", "alpha"]);
  assert.equal(code, 0);
  const data = env.data as { source: { enabled: boolean }; changed: boolean };
  assert.equal(data.source.enabled, false);
  assert.equal(data.changed, true);
});

test("enable/disable source on an unknown id returns SOURCE_NOT_FOUND", async () => {
  seed(SEED);
  const enabled = await run(["enable", "source", "ghost"]);
  assert.equal(enabled.code, 2);
  assert.equal(enabled.env.error?.code, "SOURCE_NOT_FOUND");

  const disabled = await run(["disable", "source", "ghost"]);
  assert.equal(disabled.code, 2);
  assert.equal(disabled.env.error?.code, "SOURCE_NOT_FOUND");
});

test("reorder source --direction up moves a source and reports changed", async () => {
  seed(SEED);
  // beta is at priority 1; moving it up should swap with alpha.
  const { code, env } = await run(["reorder", "source", "beta", "--direction", "up"]);
  assert.equal(code, 0);
  const data = env.data as { source: { id: string; priority: number }; direction: string; changed: boolean };
  assert.equal(data.direction, "up");
  assert.equal(data.changed, true);
  assert.equal(data.source.id, "beta");
  assert.equal(data.source.priority, 0);
});

test("reorder source at a boundary reports changed: false (still ok)", async () => {
  seed(SEED);
  // alpha is already at the top (priority 0); moving up is a no-op.
  const { code, env } = await run(["reorder", "source", "alpha", "--direction", "up"]);
  assert.equal(code, 0);
  assert.equal(env.ok, true);
  const data = env.data as { changed: boolean };
  assert.equal(data.changed, false);
});

test("reorder source without --direction is a USAGE error (exit 1)", async () => {
  seed(SEED);
  const { code, env } = await run(["reorder", "source", "alpha"]);
  assert.equal(code, 1);
  assert.equal(env.error?.code, "USAGE");
});

test("reorder source with an invalid --direction is a USAGE error", async () => {
  seed(SEED);
  const { code, env } = await run(["reorder", "source", "alpha", "--direction", "sideways"]);
  assert.equal(code, 1);
  assert.equal(env.error?.code, "USAGE");
});

test("reorder source on an unknown id returns SOURCE_NOT_FOUND (checked before boundary)", async () => {
  seed(SEED);
  const { code, env } = await run(["reorder", "source", "ghost", "--direction", "down"]);
  assert.equal(code, 2);
  assert.equal(env.error?.code, "SOURCE_NOT_FOUND");
});

test("add source with an existing id is an idempotent no-op (changed: false, no clone)", async () => {
  seed(SEED);
  const { code, env } = await run([
    "add",
    "source",
    "https://example.com/other.git",
    "--id",
    "alpha",
  ]);
  assert.equal(code, 0);
  assert.equal(env.ok, true);
  const data = env.data as { source: { id: string; url: string }; changed: boolean };
  assert.equal(data.changed, false);
  assert.equal(data.source.id, "alpha");
  // The existing entry is untouched (original URL preserved, not the new one).
  assert.equal(data.source.url, "https://example.com/alpha.git");
  // No new entry was added.
  assert.equal(loadSourceRegistry().sources.length, 2);
});

test("add source requires a <url> (USAGE)", async () => {
  seed(SEED);
  const { code, env } = await run(["add", "source"]);
  assert.equal(code, 1);
  assert.equal(env.error?.code, "USAGE");
});

test("update source on an unknown id returns SOURCE_NOT_FOUND (no network)", async () => {
  seed(SEED);
  const { code, env } = await run(["update", "source", "ghost"]);
  assert.equal(code, 2);
  assert.equal(env.error?.code, "SOURCE_NOT_FOUND");
});

test("check source on an unknown id returns SOURCE_NOT_FOUND (no network)", async () => {
  seed(SEED);
  const { code, env } = await run(["check", "source", "ghost"]);
  assert.equal(code, 2);
  assert.equal(env.error?.code, "SOURCE_NOT_FOUND");
});

test("check source / update source without an id is a USAGE error", async () => {
  seed(SEED);
  const check = await run(["check", "source"]);
  assert.equal(check.code, 1);
  assert.equal(check.env.error?.code, "USAGE");

  const update = await run(["update", "source"]);
  assert.equal(update.code, 1);
  assert.equal(update.env.error?.code, "USAGE");
});
