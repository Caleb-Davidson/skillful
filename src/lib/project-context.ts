import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import type { ProjectContext } from "./types.js";

const PROJECT_MARKERS = [".git", ".opencode", ".claude", ".codex"];

/** True when a directory itself has project markers (no parent lookup). */
export function isProjectDirectory(dir: string): boolean {
  return PROJECT_MARKERS.some((marker) => fs.existsSync(path.join(dir, marker)));
}

/**
 * Detect whether cwd is inside a project directory.
 * A project is detected if the current directory (or an ancestor up to the
 * filesystem root) contains one of the known marker directories.
 * Returns the project root directory or null.
 */
export function detectProjectRoot(startDir?: string): string | null {
  let dir = startDir ?? process.cwd();
  const root = path.parse(dir).root;
  const homeDir = os.homedir();

  while (true) {
    // Never treat the home directory itself as a project root.
    if (dir === homeDir) {
      break;
    }

    if (isProjectDirectory(dir)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir || dir === root) break;
    dir = parent;
  }
  return null;
}

/**
 * Resolve a human-readable project name.
 * Tries git remote/repo name first, falls back to the directory basename.
 */
function resolveProjectName(projectDir: string): string {
  try {
    const remote = execSync("git remote get-url origin", {
      cwd: projectDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const match = remote.match(/\/([^/]+?)(?:\.git)?$/) ?? remote.match(/:([^/]+?)(?:\.git)?$/);
    if (match?.[1]) return match[1];
  } catch {
    // Ignore; fallback below.
  }

  try {
    const topLevel = execSync("git rev-parse --show-toplevel", {
      cwd: projectDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return path.basename(topLevel);
  } catch {
    // Ignore; fallback below.
  }

  return path.basename(projectDir);
}

/** Build the full project context for the current working directory. */
export function detectProjectContext(): ProjectContext {
  const projectDir = detectProjectRoot();
  if (!projectDir) {
    return { mode: "global" };
  }
  return {
    mode: "project",
    projectDir,
    projectName: resolveProjectName(projectDir),
  };
}

/** Build project context only if the exact directory is a project root. */
export function detectExactProjectContext(startDir?: string): ProjectContext {
  const dir = startDir ?? process.cwd();
  if (!isProjectDirectory(dir)) {
    return { mode: "global" };
  }

  return {
    mode: "project",
    projectDir: dir,
    projectName: resolveProjectName(dir),
  };
}
