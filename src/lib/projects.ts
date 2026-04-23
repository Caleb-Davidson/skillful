/**
 * Project registry persistence.
 * Stored at ~/.config/opencode-manager/projects.json
 *
 * Tracks which projects the user has registered, their names,
 * and optional per-project default targets.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import type { ProjectEntry, ProjectRegistry, TargetId } from "./types.js";

const CONFIG_DIR = path.join(os.homedir(), ".config", "opencode-manager");
const REGISTRY_PATH = path.join(CONFIG_DIR, "projects.json");

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/** Load the project registry. Returns empty registry if file doesn't exist. */
export function loadRegistry(): ProjectRegistry {
  if (!fs.existsSync(REGISTRY_PATH)) return { projects: [] };
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
    return JSON.parse(raw) as ProjectRegistry;
  } catch {
    return { projects: [] };
  }
}

/** Save the project registry to disk. */
export function saveRegistry(registry: ProjectRegistry): void {
  ensureConfigDir();
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n", "utf-8");
}

/** Resolve a project name from its directory (git remote > git toplevel > basename). */
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
    // Ignore
  }

  try {
    const topLevel = execSync("git rev-parse --show-toplevel", {
      cwd: projectDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return path.basename(topLevel);
  } catch {
    // Ignore
  }

  return path.basename(projectDir);
}

/** Add a project to the registry. Returns false if already registered. */
export function addProject(projectDir: string): { added: boolean; entry: ProjectEntry } {
  const absPath = path.resolve(projectDir);
  const registry = loadRegistry();

  const existing = registry.projects.find((p) => p.path === absPath);
  if (existing) {
    return { added: false, entry: existing };
  }

  const entry: ProjectEntry = {
    path: absPath,
    name: resolveProjectName(absPath),
    addedAt: new Date().toISOString(),
  };

  registry.projects.push(entry);
  saveRegistry(registry);
  return { added: true, entry };
}

/** Remove a project from the registry by path. Returns true if removed. */
export function removeProject(projectDir: string): boolean {
  const absPath = path.resolve(projectDir);
  const registry = loadRegistry();
  const before = registry.projects.length;
  registry.projects = registry.projects.filter((p) => p.path !== absPath);
  if (registry.projects.length < before) {
    saveRegistry(registry);
    return true;
  }
  return false;
}

/** Set the default target for a specific project. */
export function setProjectTarget(projectDir: string, target: TargetId | undefined): boolean {
  const absPath = path.resolve(projectDir);
  const registry = loadRegistry();
  const entry = registry.projects.find((p) => p.path === absPath);
  if (!entry) return false;

  if (target === undefined) {
    delete entry.defaultTarget;
  } else {
    entry.defaultTarget = target;
  }
  saveRegistry(registry);
  return true;
}

/** Check if a path exists and looks like a valid project directory. */
export function isValidProjectDir(dir: string): boolean {
  const absPath = path.resolve(dir);
  if (!fs.existsSync(absPath)) return false;
  const stat = fs.statSync(absPath);
  if (!stat.isDirectory()) return false;
  // Check for common project markers
  const markers = [".git", ".opencode", ".claude", ".codex", "package.json", "Cargo.toml", "go.mod", "pyproject.toml"];
  return markers.some((m) => fs.existsSync(path.join(absPath, m)));
}

/** Get the registry file path (for display). */
export function getRegistryPath(): string {
  return REGISTRY_PATH;
}
