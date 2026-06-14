import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRegistry, dispatch, isAgentCliInvocation, AGENT_CLI_VERBS } from "../dispatch.js";
import { CliError } from "../types.js";
import type { CommandContext, CommandDef, Envelope } from "../types.js";

/** Capture everything written to stdout while `fn` runs; restore afterwards. */
async function captureStdout(fn: () => Promise<number>): Promise<{ code: number; out: string }> {
  const original = process.stdout.write.bind(process.stdout);
  let out = "";
  (process.stdout.write as unknown as (chunk: string) => boolean) = (chunk: string): boolean => {
    out += chunk;
    return true;
  };
  try {
    const code = await fn();
    return { code, out };
  } finally {
    process.stdout.write = original;
  }
}

function parseEnvelope(out: string): Envelope {
  return JSON.parse(out) as Envelope;
}

test("dispatch runs a matched command and emits an ok envelope with exit 0", async () => {
  let received: CommandContext | undefined;
  const fake: CommandDef = {
    verb: "list",
    noun: "things",
    run(ctx) {
      received = ctx;
      return { count: 3 };
    },
  };
  const { code, out } = await captureStdout(() =>
    dispatch(["list", "things", "extra", "--flag", "v"], buildRegistry([fake]))
  );
  assert.equal(code, 0);
  const env = parseEnvelope(out);
  assert.equal(env.ok, true);
  assert.equal(env.command, "list things");
  assert.deepEqual(env.data, { count: 3 });
  assert.equal(env.error, null);
  // positionals beyond verb+noun reach the handler; flags are parsed.
  assert.deepEqual(received?.positionals, ["extra"]);
  assert.equal(received?.flags.getOne("flag"), "v");
});

test("dispatch returns UNKNOWN_COMMAND envelope and exit 1 for an unmatched command", async () => {
  const { code, out } = await captureStdout(() => dispatch(["list", "sources"], buildRegistry([])));
  assert.equal(code, 1);
  const env = parseEnvelope(out);
  assert.equal(env.ok, false);
  assert.equal(env.command, "list sources");
  assert.equal(env.error?.code, "UNKNOWN_COMMAND");
  assert.deepEqual(env.error?.details, { verb: "list", noun: "sources" });
});

test("dispatch maps a thrown CliError to its code and exit code", async () => {
  const fake: CommandDef = {
    verb: "install",
    noun: "skill",
    run() {
      throw new CliError("ITEM_NOT_FOUND", "nope", { id: "pdf" });
    },
  };
  const { code, out } = await captureStdout(() => dispatch(["install", "skill", "pdf"], buildRegistry([fake])));
  assert.equal(code, 2);
  const env = parseEnvelope(out);
  assert.equal(env.error?.code, "ITEM_NOT_FOUND");
  assert.deepEqual(env.error?.details, { id: "pdf" });
});

test("dispatch maps a generic thrown Error to OPERATION_FAILED and exit 3", async () => {
  const fake: CommandDef = {
    verb: "update",
    noun: "source",
    run() {
      throw new Error("disk on fire");
    },
  };
  const { code, out } = await captureStdout(() => dispatch(["update", "source", "x"], buildRegistry([fake])));
  assert.equal(code, 3);
  const env = parseEnvelope(out);
  assert.equal(env.error?.code, "OPERATION_FAILED");
  assert.equal(env.error?.message, "disk on fire");
});

test("dispatch awaits async handlers", async () => {
  const fake: CommandDef = {
    verb: "check",
    noun: "sources",
    async run() {
      return await Promise.resolve({ checked: true });
    },
  };
  const { code, out } = await captureStdout(() => dispatch(["check", "sources"], buildRegistry([fake])));
  assert.equal(code, 0);
  assert.deepEqual(parseEnvelope(out).data, { checked: true });
});

test("isAgentCliInvocation: true for an agent verb, ignoring leading flags", () => {
  assert.equal(isAgentCliInvocation(["list", "sources"]), true);
  assert.equal(isAgentCliInvocation(["--target", "opencode", "install", "skill"]), false);
  // first non-flag token decides; here it's a value consumed only by the parser,
  // but isAgentCliInvocation treats the first bare token as the verb.
  assert.equal(isAgentCliInvocation(["schema"]), true);
});

test("isAgentCliInvocation: false for TUI subcommands and empty argv", () => {
  assert.equal(isAgentCliInvocation(["manage"]), false);
  assert.equal(isAgentCliInvocation(["projects"]), false);
  assert.equal(isAgentCliInvocation(["settings"]), false);
  assert.equal(isAgentCliInvocation(["sync"]), false);
  assert.equal(isAgentCliInvocation([]), false);
});

test("AGENT_CLI_VERBS does not collide with TUI subcommands", () => {
  for (const tui of ["manage", "projects", "settings", "sync"]) {
    assert.equal(AGENT_CLI_VERBS.includes(tui), false);
  }
});
