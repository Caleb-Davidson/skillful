// The router: parse argv, look up a CommandDef by `${verb} ${noun}`, run it,
// and emit exactly one envelope. Returns the process exit code.

import { allCommands } from "./commands/index.js";
import { buildError, buildOk, emit, EXIT_CODES } from "./output.js";
import { parseArgv } from "./parser.js";
import { CliError } from "./types.js";
import type { CommandContext, CommandDef } from "./types.js";

/**
 * Verbs that belong to the Agent CLI. cli.tsx uses `isAgentCliInvocation` to
 * decide whether to route here before the TUI/sync paths. None of these collide
 * with the TUI subcommands (manage/projects/settings/sync).
 */
export const AGENT_CLI_VERBS: readonly string[] = [
  "list",
  "info",
  "install",
  "remove",
  "add",
  "enable",
  "disable",
  "reorder",
  "update",
  "check",
  "schema",
];

/** True when the first non-flag token is an Agent CLI verb. */
export function isAgentCliInvocation(argv: string[]): boolean {
  for (const arg of argv) {
    if (arg.startsWith("--")) continue;
    return AGENT_CLI_VERBS.includes(arg);
  }
  return false;
}

/** Build a `${verb} ${noun}` -> CommandDef lookup from a command list. */
export function buildRegistry(commands: CommandDef[]): Map<string, CommandDef> {
  const map = new Map<string, CommandDef>();
  for (const def of commands) {
    map.set(`${def.verb} ${def.noun}`, def);
  }
  return map;
}

/**
 * Core dispatch against an explicit registry. Emits exactly one envelope and
 * returns the exit code. Exposed (separately from `runAgentCli`) so the dispatch
 * logic can be tested with a fake registry, without real commands.
 */
export async function dispatch(argv: string[], registry: Map<string, CommandDef>): Promise<number> {
  const { positionals, flags } = parseArgv(argv);
  const verb = positionals[0] ?? "";
  const noun = positionals[1] ?? "";
  const command = `${verb} ${noun}`.trim();

  const def = registry.get(`${verb} ${noun}`);
  if (!def) {
    emit(buildError(command, "UNKNOWN_COMMAND", `Unknown command '${command}'.`, { verb, noun }));
    return EXIT_CODES.UNKNOWN_COMMAND;
  }

  const ctx: CommandContext = {
    command,
    // Positionals beyond the verb+noun are the command's own args (e.g. an id).
    positionals: positionals.slice(2),
    flags,
  };

  try {
    const result = await def.run(ctx);
    emit(buildOk(command, result.data, result.warnings));
    return 0;
  } catch (err) {
    if (err instanceof CliError) {
      emit(buildError(command, err.code, err.message, err.details));
      return EXIT_CODES[err.code];
    }
    const message = err instanceof Error ? err.message : String(err);
    emit(buildError(command, "OPERATION_FAILED", message));
    return EXIT_CODES.OPERATION_FAILED;
  }
}

/**
 * Run the Agent CLI for the given argv (already sliced past `node script`).
 * Emits a single envelope and resolves to the process exit code.
 */
export async function runAgentCli(argv: string[]): Promise<number> {
  return dispatch(argv, buildRegistry(allCommands));
}
