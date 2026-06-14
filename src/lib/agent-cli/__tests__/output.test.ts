import { test } from "node:test";
import assert from "node:assert/strict";
import type { StoreSource } from "../../types.js";
import { buildError, buildOk, EXIT_CODES, projectSource } from "../output.js";

test("buildOk shape: ok true, data present, error null, no warnings key when empty", () => {
  const env = buildOk("list sources", { count: 0 });
  assert.equal(env.schemaVersion, "1");
  assert.equal(env.ok, true);
  assert.equal(env.command, "list sources");
  assert.deepEqual(env.data, { count: 0 });
  assert.equal(env.error, null);
  assert.equal("warnings" in env, false);
});

test("buildOk includes warnings only when non-empty", () => {
  const withWarn = buildOk("add source", { changed: true }, ["clone failed"]);
  assert.deepEqual(withWarn.warnings, ["clone failed"]);
  const emptyWarn = buildOk("add source", { changed: true }, []);
  assert.equal("warnings" in emptyWarn, false);
});

test("buildError shape: ok false, no data key, error populated", () => {
  const env = buildError("install skill", "ITEM_NOT_FOUND", "no such item", { id: "pdf" });
  assert.equal(env.ok, false);
  assert.equal("data" in env, false);
  assert.equal(env.error?.code, "ITEM_NOT_FOUND");
  assert.equal(env.error?.message, "no such item");
  assert.deepEqual(env.error?.details, { id: "pdf" });
});

test("buildError omits details when undefined", () => {
  const env = buildError("install skill", "USAGE", "bad usage");
  assert.equal(env.error?.code, "USAGE");
  assert.equal("details" in (env.error ?? {}), false);
});

test("EXIT_CODES mapping matches the spec table", () => {
  assert.equal(EXIT_CODES.USAGE, 1);
  assert.equal(EXIT_CODES.MISSING_SCOPE, 1);
  assert.equal(EXIT_CODES.INVALID_SCOPE, 1);
  assert.equal(EXIT_CODES.MISSING_TARGET, 1);
  assert.equal(EXIT_CODES.INVALID_TARGET, 1);
  assert.equal(EXIT_CODES.NOT_A_PROJECT, 1);
  assert.equal(EXIT_CODES.UNKNOWN_COMMAND, 1);
  assert.equal(EXIT_CODES.SOURCE_NOT_FOUND, 2);
  assert.equal(EXIT_CODES.ITEM_NOT_FOUND, 2);
  assert.equal(EXIT_CODES.NOT_ELIGIBLE, 3);
  assert.equal(EXIT_CODES.OPERATION_FAILED, 3);
  assert.equal(EXIT_CODES.PARTIAL_FAILURE, 3);
});

test("projectSource projects only the public fields, mapping undefined to null", () => {
  const source: StoreSource = {
    id: "anthropic",
    name: "Anthropic Skills",
    url: "https://github.com/example/skills",
    branch: "main",
    enabled: true,
    priority: 0,
    lastIndexedAt: "2026-06-10T12:00:00Z",
    // internal head-tracking fields that must be dropped:
    lastCheckedAt: "2026-06-10T11:00:00Z",
    lastKnownRemoteHead: "abc",
    lastFetchedHead: "def",
    indexedHead: "ghi",
    lastError: undefined,
  };
  const projected = projectSource(source) as Record<string, unknown>;
  assert.deepEqual(projected, {
    id: "anthropic",
    name: "Anthropic Skills",
    url: "https://github.com/example/skills",
    branch: "main",
    enabled: true,
    priority: 0,
    lastIndexedAt: "2026-06-10T12:00:00Z",
    lastError: null,
  });
  // internal fields are absent
  assert.equal("lastFetchedHead" in projected, false);
  assert.equal("indexedHead" in projected, false);
});

test("projectSource maps a missing branch to null", () => {
  const source: StoreSource = {
    id: "local",
    name: "Local",
    url: "/tmp/local",
    enabled: false,
    priority: 2,
  };
  const projected = projectSource(source) as Record<string, unknown>;
  assert.equal(projected.branch, null);
  assert.equal(projected.lastIndexedAt, null);
  assert.equal(projected.enabled, false);
});
