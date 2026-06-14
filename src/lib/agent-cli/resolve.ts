// The explicit-flag contract: scope, targets, and project context resolution.
// Item commands must never guess scope or target; a missing/invalid flag is a
// usage error with a precise code. All validation here happens before any
// disk/git write.

import path from "node:path";
import { detectExactProjectContext } from "../project-context.js";
import type { ConfigMode, ProjectContext, TargetId } from "../types.js";
import type { ParsedFlags } from "./parser.js";
import { CliError } from "./types.js";

const VALID_TARGETS: TargetId[] = ["opencode", "claude-code", "codex"];

/** Read `--scope`; throw MISSING_SCOPE if absent, INVALID_SCOPE if not global|project. */
export function requireScope(flags: ParsedFlags): ConfigMode {
  if (!flags.has("scope")) {
    throw new CliError("MISSING_SCOPE", "Missing required --scope flag. Use --scope global|project.");
  }
  const raw = flags.getOne("scope") ?? "";
  if (raw !== "global" && raw !== "project") {
    throw new CliError("INVALID_SCOPE", `Invalid --scope value '${raw}'. Valid scopes: global, project.`, {
      scope: raw,
    });
  }
  return raw;
}

/**
 * Read repeatable `--target`; throw MISSING_TARGET if none, INVALID_TARGET if any
 * value is unknown. Dedupes while preserving first-seen order.
 */
export function requireTargets(flags: ParsedFlags): TargetId[] {
  const raw = flags.getAll("target").filter((value) => value.length > 0);
  if (raw.length === 0) {
    throw new CliError(
      "MISSING_TARGET",
      `Missing required --target flag. Repeatable; valid targets: ${VALID_TARGETS.join(", ")}.`
    );
  }
  const invalid = raw.filter((value) => !VALID_TARGETS.includes(value as TargetId));
  if (invalid.length > 0) {
    throw new CliError(
      "INVALID_TARGET",
      `Invalid --target value(s): ${invalid.join(", ")}. Valid targets: ${VALID_TARGETS.join(", ")}.`,
      { invalid }
    );
  }
  const seen = new Set<string>();
  const deduped: TargetId[] = [];
  for (const value of raw as TargetId[]) {
    if (!seen.has(value)) {
      seen.add(value);
      deduped.push(value);
    }
  }
  return deduped;
}

/**
 * Resolve the project context from scope + flags.
 *   global  → { mode: "global" }
 *   project → `--project <path>` is trusted (absolute-ized, name from basename);
 *             otherwise cwd must resolve to a real project (.git/.opencode/...),
 *             else NOT_A_PROJECT.
 * The result always carries projectDir/projectName for project scope so callers
 * can echo what was resolved.
 */
export function resolveProjectContext(scope: ConfigMode, flags: ParsedFlags): ProjectContext {
  if (scope === "global") {
    return { mode: "global" };
  }

  const explicit = flags.getOne("project");
  if (explicit !== undefined && explicit.length > 0) {
    const projectDir = path.resolve(explicit);
    return {
      mode: "project",
      projectDir,
      projectName: path.basename(projectDir),
    };
  }

  const ctx = detectExactProjectContext(process.cwd());
  if (ctx.mode !== "project") {
    throw new CliError(
      "NOT_A_PROJECT",
      `Current directory is not a project root (expected .git or .opencode). Pass --project <path> to target one explicitly.`,
      { cwd: process.cwd() }
    );
  }
  return ctx;
}
