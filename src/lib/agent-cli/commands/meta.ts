// Introspection commands for the Agent CLI: `version` and `schema`.
//
// Both are noun-less (`{ verb, noun: "" }`), so the dispatcher's `${verb} ${noun}`
// key resolves to `"version "` / `"schema "`. They add no domain logic: `version`
// reports the package version; `schema` emits the full command catalog generated
// from the LIVE registry (via `ctx.commands`, populated by `dispatch()`), so it
// can never drift from the actual command set. Reading `ctx.commands` instead of
// importing `allCommands` from `./index.js` avoids a circular import (index imports
// this file).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT_CODES } from "../output.js";
import { CliError } from "../types.js";
import type { CommandContext, CommandDef, CommandResult, ErrorCode } from "../types.js";

/** Item-family verbs: these require `--scope` and `--target`. */
const ITEM_VERBS = new Set(["list", "info", "install", "remove"]);
/** Introspection verbs: these belong to the "meta" family. */
const META_VERBS = new Set(["schema", "version"]);

type CommandFamily = "item" | "source" | "meta";

/**
 * Resolve the package version. Read `package.json` at runtime relative to this
 * module so the real version is reported in both layouts (dev `src/...` and
 * built `dist/...` are each 4 levels below the repo root). A static JSON import
 * would violate the `rootDir: src` constraint at build time; runtime fs read
 * sidesteps that. Falls back to npm's env var, then a constant, if unreadable.
 */
function resolveVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(here, "..", "..", "..", "..", "package.json");
    const raw = fs.readFileSync(pkgPath, "utf-8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version;
    }
  } catch {
    // Fall through to env/constant below.
  }
  return process.env.npm_package_version ?? "1.0.0";
}

const VERSION = resolveVersion();

/** Family for a command, derived from its verb. */
function familyFor(verb: string): CommandFamily {
  if (META_VERBS.has(verb)) return "meta";
  if (ITEM_VERBS.has(verb)) return "item";
  return "source";
}

/** True when a command takes a positional id (info/install/remove + single-source verbs). */
function takesId(def: CommandDef, family: CommandFamily): boolean {
  if (family === "item") {
    return def.verb === "info" || def.verb === "install" || def.verb === "remove";
  }
  if (family === "source") {
    // `list sources` and `check sources` act on the whole registry; `add source`
    // takes a <url>; the rest act on one source by id.
    if (def.verb === "list") return false;
    if (def.verb === "check") return def.noun === "source"; // singular = one id
    return true;
  }
  return false;
}

/** The positional placeholder a command's usage string should show, if any. */
function positionalFor(def: CommandDef, family: CommandFamily): string | null {
  if (family === "item") {
    return takesId(def, family) ? "<id>" : null;
  }
  if (family === "source") {
    if (def.verb === "add") return "<url>";
    return takesId(def, family) ? "<id>" : null;
  }
  return null;
}

/** Build a generated usage string for one command from verb+noun+flags. */
function usageFor(def: CommandDef, family: CommandFamily): string {
  const parts = [def.verb];
  if (def.noun.length > 0) parts.push(def.noun);
  const positional = positionalFor(def, family);
  if (positional) parts.push(positional);

  if (family === "item") {
    parts.push("--scope <global|project>", "--target <id>", "[--project <path>]");
    if (def.verb === "install" || def.verb === "remove") {
      parts.push("[--dry-run]");
    }
  } else if (family === "source") {
    if (def.verb === "add") parts.push("[--id <id>]", "[--name <name>]", "[--branch <branch>]");
    if (def.verb === "reorder") parts.push("--direction <up|down>");
  }

  return parts.join(" ");
}

/** Project one registry command to its schema catalog entry. */
function describeCommand(def: CommandDef): object {
  const family = familyFor(def.verb);
  const command = `${def.verb} ${def.noun}`.trim();
  return {
    command,
    verb: def.verb,
    noun: def.noun,
    family,
    requiresScopeTarget: family === "item",
    takesId: takesId(def, family),
    usage: usageFor(def, family),
    summary: def.summary ?? null,
  };
}

/**
 * Map EXIT_CODES (error code -> exit number) to the spec's errorCodes shape,
 * dropping the internal-only UNKNOWN_COMMAND so the catalog matches the doc.
 */
function errorCodeMap(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, exit] of Object.entries(EXIT_CODES) as Array<[ErrorCode, number]>) {
    if (code === "UNKNOWN_COMMAND") continue;
    out[code] = exit;
  }
  return out;
}

export const versionCommand: CommandDef = {
  verb: "version",
  noun: "",
  summary: "Print the skillful version as JSON.",
  run(): CommandResult {
    return { data: { version: VERSION } };
  },
};

export const schemaCommand: CommandDef = {
  verb: "schema",
  noun: "",
  summary: "Print the full Agent CLI command catalog as JSON.",
  run(ctx: CommandContext): CommandResult {
    // Derive the catalog from the live registry the dispatcher built. If it's
    // absent (e.g. a caller invoked the handler directly), that's a wiring bug.
    const commands = ctx.commands;
    if (!commands) {
      throw new CliError("OPERATION_FAILED", "schema: command registry was not provided to the handler.");
    }

    const catalog = commands
      .map(describeCommand)
      .sort((a, b) => (a as { command: string }).command.localeCompare((b as { command: string }).command));

    return {
      data: {
        version: VERSION,
        exitCodes: {
          "0": "success",
          "1": "usage/validation",
          "2": "not found",
          "3": "operation failed",
        },
        errorCodes: errorCodeMap(),
        flags: {
          scope: { values: ["global", "project"], requiredFor: "item commands" },
          target: { values: ["opencode", "claude-code", "codex"], repeatable: true, requiredFor: "item commands" },
          project: { appliesTo: "--scope project", optional: true },
          "dry-run": { appliesTo: "install/remove", optional: true },
        },
        commands: catalog,
      },
    };
  },
};

/** The introspection command family. */
export const metaCommands: CommandDef[] = [schemaCommand, versionCommand];
