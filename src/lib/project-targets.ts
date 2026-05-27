/**
 * Project-local multi-target selection.
 *
 * A project can opt into multi-target mode by committing a `skillful.targets.json`
 * at the project root:
 *
 *   { "targets": ["claude-code", "opencode"] }
 *
 * Precedence (in cli.tsx): --target flag > skillful.targets.json > project registry
 * defaultTarget > user-settings defaultTarget > built-in fallback.
 */
import fs from "node:fs";
import path from "node:path";
import type { TargetId } from "./types.js";

export const PROJECT_TARGETS_FILENAME = "skillful.targets.json";

const VALID: TargetId[] = ["opencode", "claude-code", "codex"];

export interface ProjectTargetsFile {
  targets: TargetId[];
}

/** Path where the project-local targets file is expected. */
export function getProjectTargetsPath(projectDir: string): string {
  return path.join(projectDir, PROJECT_TARGETS_FILENAME);
}

/**
 * Load multi-target selection from a project's skillful.targets.json.
 * Returns null when the file is absent, unparseable, or yields no valid targets.
 * Order is preserved (first entry is the "primary" target); duplicates dropped.
 */
export function loadProjectTargets(projectDir: string): TargetId[] | null {
  const filePath = getProjectTargetsPath(projectDir);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ProjectTargetsFile>;
    if (!Array.isArray(parsed.targets)) return null;

    const seen = new Set<TargetId>();
    const ordered: TargetId[] = [];
    for (const entry of parsed.targets) {
      if (typeof entry !== "string") continue;
      if (!VALID.includes(entry as TargetId)) continue;
      const id = entry as TargetId;
      if (seen.has(id)) continue;
      seen.add(id);
      ordered.push(id);
    }
    return ordered.length > 0 ? ordered : null;
  } catch {
    return null;
  }
}
