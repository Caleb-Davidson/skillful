// Public contract for the non-interactive Agent CLI.
// These types are the stable surface later phases build commands against;
// keep them precise.

import type { ParsedFlags } from "./parser.js";

/** Stable error codes returned in the envelope and mapped to exit codes. */
export type ErrorCode =
  | "USAGE"
  | "MISSING_SCOPE"
  | "INVALID_SCOPE"
  | "MISSING_TARGET"
  | "INVALID_TARGET"
  | "NOT_A_PROJECT"
  | "SOURCE_NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "NOT_ELIGIBLE"
  | "OPERATION_FAILED"
  | "PARTIAL_FAILURE"
  | "UNKNOWN_COMMAND";

/** The error object embedded in a failing envelope. */
export interface CliErrorPayload {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/** The single JSON object emitted per invocation. */
export interface Envelope {
  schemaVersion: "1";
  ok: boolean;
  command: string;
  data?: unknown;
  warnings?: string[];
  error: CliErrorPayload | null;
}

/**
 * Thrown by command handlers (and the resolve helpers) to signal a precise
 * failure. The dispatcher catches it and renders the error envelope.
 */
export class CliError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.details = details;
  }
}

/** Resolved invocation passed to a command handler. */
export interface CommandContext {
  command: string;
  positionals: string[];
  flags: ParsedFlags;
}

/**
 * The value a command handler returns on success: the envelope `data` payload
 * plus optional `warnings` to surface in the top-level `warnings` array.
 */
export interface CommandResult {
  data: unknown;
  warnings?: string[];
}

/**
 * A single command in the registry. The matched key is `${verb} ${noun}`.
 * `run` returns a `CommandResult` (success `data` + optional `warnings`), or
 * throws `CliError`.
 */
export interface CommandDef {
  verb: string;
  noun: string;
  summary?: string;
  run(ctx: CommandContext): Promise<CommandResult> | CommandResult;
}
