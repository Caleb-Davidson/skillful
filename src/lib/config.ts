/**
 * Reads and writes OpenCode configuration at both global and project levels.
 *
 * Global config:   ~/.config/opencode/opencode.json + ~/.config/opencode/{agents,commands,skills}/
 * Project config:  <projectRoot>/opencode.json + <projectRoot>/.opencode/{agents,commands,skills}/
 *
 * When running inside a project directory (detected by .git or .opencode),
 * install/uninstall operations target project-level config. Global install
 * state is read-only and shown for reference.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { parse as parseJsonc, modify, applyEdits } from "jsonc-parser";
import type {
  StoreItemMeta,
  InstalledState,
  StoreItemWithState,
  StoreView,
  ProjectContext,
} from "./types.js";
import { getStorePath } from "./store.js";

const FORMAT_OPTS = { formattingOptions: { insertSpaces: true, tabSize: 2 } };

// ---------------------------------------------------------------------------
// Project detection
// ---------------------------------------------------------------------------

/**
 * Detect whether cwd is inside a project directory.
 * A project is detected if the current directory (or an ancestor up to the
 * filesystem root) contains a `.git` folder or a `.opencode` folder.
 * Returns the project root directory or null.
 */
export function detectProjectRoot(startDir?: string): string | null {
  let dir = startDir ?? process.cwd();
  const root = path.parse(dir).root;

  while (true) {
    if (
      fs.existsSync(path.join(dir, ".git")) ||
      fs.existsSync(path.join(dir, ".opencode"))
    ) {
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
  // Try to get project name from git remote origin
  try {
    const remote = execSync("git remote get-url origin", {
      cwd: projectDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    // Extract repo name from URL: https://github.com/user/repo.git or git@github.com:user/repo.git
    const match = remote.match(/\/([^/]+?)(?:\.git)?$/) ?? remote.match(/:([^/]+?)(?:\.git)?$/);
    if (match?.[1]) return match[1];
  } catch {
    // No git remote — fall through
  }

  // Try git repo root directory name (handles local repos without remote)
  try {
    const topLevel = execSync("git rev-parse --show-toplevel", {
      cwd: projectDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return path.basename(topLevel);
  } catch {
    // Not a git repo — fall through
  }

  return path.basename(projectDir);
}

/**
 * Build the full project context for the current working directory.
 */
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

// ---------------------------------------------------------------------------
// Global config helpers
// ---------------------------------------------------------------------------

/** OpenCode global config directory */
export function getGlobalConfigDir(): string {
  return path.join(os.homedir(), ".config", "opencode");
}

/** OpenCode global config file path */
export function getGlobalConfigPath(): string {
  return path.join(getGlobalConfigDir(), "opencode.json");
}

/** Read and parse the global opencode.json (JSONC) */
export function readGlobalConfig(): Record<string, unknown> {
  const configPath = getGlobalConfigPath();
  if (!fs.existsSync(configPath)) return {};
  const raw = fs.readFileSync(configPath, "utf-8");
  try {
    return parseJsonc(raw) ?? {};
  } catch {
    return {};
  }
}

/** Read the raw text of global opencode.json */
function readGlobalConfigRaw(): string {
  const configPath = getGlobalConfigPath();
  if (!fs.existsSync(configPath)) return "{}";
  return fs.readFileSync(configPath, "utf-8");
}

/** Write back the global opencode.json preserving formatting */
function writeGlobalConfig(content: string): void {
  const configPath = getGlobalConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Project config helpers
// ---------------------------------------------------------------------------

/** OpenCode project config file path: <projectRoot>/opencode.json */
function getProjectConfigPath(ctx: ProjectContext): string {
  return path.join(ctx.projectDir!, "opencode.json");
}

/** The .opencode directory inside the project root */
function getProjectDotDir(ctx: ProjectContext): string {
  return path.join(ctx.projectDir!, ".opencode");
}

/** Read and parse the project opencode.json (JSONC) */
function readProjectConfig(ctx: ProjectContext): Record<string, unknown> {
  const configPath = getProjectConfigPath(ctx);
  if (!fs.existsSync(configPath)) return {};
  const raw = fs.readFileSync(configPath, "utf-8");
  try {
    return parseJsonc(raw) ?? {};
  } catch {
    return {};
  }
}

/** Read raw text of project opencode.json */
function readProjectConfigRaw(ctx: ProjectContext): string {
  const configPath = getProjectConfigPath(ctx);
  if (!fs.existsSync(configPath)) return "{}";
  return fs.readFileSync(configPath, "utf-8");
}

/** Write back the project opencode.json */
function writeProjectConfig(ctx: ProjectContext, content: string): void {
  const configPath = getProjectConfigPath(ctx);
  fs.writeFileSync(configPath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// File-based item listing (global)
// ---------------------------------------------------------------------------

function listGlobalAgentFiles(): string[] {
  const dir = path.join(getGlobalConfigDir(), "agents");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f: string) => f.endsWith(".md")).map((f: string) => path.basename(f, ".md"));
}

function listGlobalCommandFiles(): string[] {
  const dir = path.join(getGlobalConfigDir(), "commands");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f: string) => f.endsWith(".md")).map((f: string) => path.basename(f, ".md"));
}

function listGlobalSkillFolders(): string[] {
  const dir = path.join(getGlobalConfigDir(), "skills");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d: fs.Dirent) => d.isDirectory())
    .filter((d: fs.Dirent) => fs.existsSync(path.join(dir, d.name, "SKILL.md")))
    .map((d: fs.Dirent) => d.name);
}

// ---------------------------------------------------------------------------
// File-based item listing (project)
// ---------------------------------------------------------------------------

function listProjectAgentFiles(ctx: ProjectContext): string[] {
  const dir = path.join(getProjectDotDir(ctx), "agents");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f: string) => f.endsWith(".md")).map((f: string) => path.basename(f, ".md"));
}

function listProjectCommandFiles(ctx: ProjectContext): string[] {
  const dir = path.join(getProjectDotDir(ctx), "commands");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f: string) => f.endsWith(".md")).map((f: string) => path.basename(f, ".md"));
}

function listProjectSkillFolders(ctx: ProjectContext): string[] {
  const dir = path.join(getProjectDotDir(ctx), "skills");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d: fs.Dirent) => d.isDirectory())
    .filter((d: fs.Dirent) => fs.existsSync(path.join(dir, d.name, "SKILL.md")))
    .map((d: fs.Dirent) => d.name);
}

// ---------------------------------------------------------------------------
// Store file reading (strips _meta from provider/mcp JSON)
// ---------------------------------------------------------------------------

/** Read a store JSON file and return the config payload (without _meta) */
function readStoreJsonPayload(item: StoreItemMeta): Record<string, unknown> {
  const storePath = getStorePath();
  const srcPath = path.join(storePath, item.path);
  const raw = fs.readFileSync(srcPath, "utf-8");
  const parsed = parseJsonc(raw) as Record<string, unknown>;
  // Strip _meta — everything else is the config value
  const { _meta: _, ...payload } = parsed;
  return payload;
}

// ---------------------------------------------------------------------------
// Global installed state detection (used both standalone and as sub-check)
// ---------------------------------------------------------------------------

/** Check if a store item is installed in the global config */
function getGlobalInstalledState(item: StoreItemMeta): InstalledState {
  const config = readGlobalConfig();

  if (item.type === "agent") {
    const agents = config.agent as Record<string, unknown> | undefined;
    if (agents && item.id in agents) {
      return { installed: true, installedVia: "json" };
    }
    if (listGlobalAgentFiles().includes(item.id)) {
      return { installed: true, installedVia: "file" };
    }
  }

  if (item.type === "command") {
    const commands = config.command as Record<string, unknown> | undefined;
    if (commands && item.id in commands) {
      return { installed: true, installedVia: "json" };
    }
    if (listGlobalCommandFiles().includes(item.id)) {
      return { installed: true, installedVia: "file" };
    }
  }

  if (item.type === "skill") {
    if (listGlobalSkillFolders().includes(item.id)) {
      return { installed: true, installedVia: "file" };
    }
  }

  if (item.type === "provider") {
    const providers = config.provider as Record<string, unknown> | undefined;
    if (providers && item.id in providers) {
      return { installed: true, installedVia: "json" };
    }
  }

  if (item.type === "mcp") {
    const mcps = config.mcp as Record<string, unknown> | undefined;
    if (mcps && item.id in mcps) {
      return { installed: true, installedVia: "json" };
    }
  }

  return { installed: false };
}

// ---------------------------------------------------------------------------
// Project installed state detection
// ---------------------------------------------------------------------------

/** Check if a store item is installed at the project level */
function getProjectInstalledState(item: StoreItemMeta, ctx: ProjectContext): InstalledState {
  const config = readProjectConfig(ctx);

  // Agents: project .opencode/agents/*.md or project opencode.json agent.<id>
  if (item.type === "agent") {
    const agents = config.agent as Record<string, unknown> | undefined;
    if (agents && item.id in agents) {
      return { installed: true, installedVia: "json" };
    }
    if (listProjectAgentFiles(ctx).includes(item.id)) {
      return { installed: true, installedVia: "file" };
    }
  }

  // Commands: project .opencode/commands/*.md or project opencode.json command.<id>
  if (item.type === "command") {
    const commands = config.command as Record<string, unknown> | undefined;
    if (commands && item.id in commands) {
      return { installed: true, installedVia: "json" };
    }
    if (listProjectCommandFiles(ctx).includes(item.id)) {
      return { installed: true, installedVia: "file" };
    }
  }

  // Skills: project .opencode/skills/<id>/SKILL.md
  if (item.type === "skill") {
    if (listProjectSkillFolders(ctx).includes(item.id)) {
      return { installed: true, installedVia: "file" };
    }
  }

  // Providers: project opencode.json provider.<id>
  if (item.type === "provider") {
    const providers = config.provider as Record<string, unknown> | undefined;
    if (providers && item.id in providers) {
      return { installed: true, installedVia: "json" };
    }
  }

  // MCPs: project opencode.json mcp.<id>
  if (item.type === "mcp") {
    const mcps = config.mcp as Record<string, unknown> | undefined;
    if (mcps && item.id in mcps) {
      return { installed: true, installedVia: "json" };
    }
  }

  return { installed: false };
}

// ---------------------------------------------------------------------------
// Unified installed state detection
// ---------------------------------------------------------------------------

/**
 * Determine if a store item is currently installed.
 *
 * In global mode: checks global config only (backward-compatible).
 * In project mode: checks project config for `installed`, and also
 *   checks global config to set `globalInstalled` (read-only indicator).
 */
export function getInstalledState(item: StoreItemMeta, ctx?: ProjectContext): InstalledState {
  if (!ctx || ctx.mode === "global") {
    return getGlobalInstalledState(item);
  }

  // Project mode — check both scopes
  const globalState = getGlobalInstalledState(item);
  const projectState = getProjectInstalledState(item, ctx);

  if (projectState.installed) {
    // Installed in project — that's the active state
    return {
      installed: true,
      installedVia: projectState.installedVia,
      globalInstalled: globalState.installed,
    };
  }

  // Not installed in project — report as not installed, but carry global flag
  return {
    installed: false,
    globalInstalled: globalState.installed,
  };
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

/** Install a store item into the active config scope */
export function installItem(item: StoreItemMeta, ctx?: ProjectContext): void {
  const storePath = getStorePath();
  const srcPath = path.join(storePath, item.path);

  if (!fs.existsSync(srcPath)) {
    throw new Error(`Store item not found: ${srcPath}`);
  }

  if (!ctx || ctx.mode === "global") {
    installItemGlobal(item, storePath, srcPath);
  } else {
    installItemProject(item, ctx, storePath, srcPath);
  }
}

function installItemGlobal(item: StoreItemMeta, _storePath: string, srcPath: string): void {
  if (item.type === "agent") {
    const destDir = path.join(getGlobalConfigDir(), "agents");
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, path.join(destDir, `${item.id}.md`));
  } else if (item.type === "command") {
    const destDir = path.join(getGlobalConfigDir(), "commands");
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, path.join(destDir, `${item.id}.md`));
  } else if (item.type === "skill") {
    const destDir = path.join(getGlobalConfigDir(), "skills", item.id);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, path.join(destDir, "SKILL.md"));
  } else if (item.type === "provider") {
    const payload = readStoreJsonPayload(item);
    let raw = readGlobalConfigRaw();
    raw = applyEdits(raw, modify(raw, ["provider", item.id], payload, FORMAT_OPTS));
    writeGlobalConfig(raw);
  } else if (item.type === "mcp") {
    const payload = readStoreJsonPayload(item);
    let raw = readGlobalConfigRaw();
    raw = applyEdits(raw, modify(raw, ["mcp", item.id], payload, FORMAT_OPTS));
    writeGlobalConfig(raw);
  }
}

function installItemProject(item: StoreItemMeta, ctx: ProjectContext, _storePath: string, srcPath: string): void {
  const dotDir = getProjectDotDir(ctx);

  if (item.type === "agent") {
    const destDir = path.join(dotDir, "agents");
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, path.join(destDir, `${item.id}.md`));
  } else if (item.type === "command") {
    const destDir = path.join(dotDir, "commands");
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, path.join(destDir, `${item.id}.md`));
  } else if (item.type === "skill") {
    const destDir = path.join(dotDir, "skills", item.id);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, path.join(destDir, "SKILL.md"));
  } else if (item.type === "provider") {
    const payload = readStoreJsonPayload(item);
    let raw = readProjectConfigRaw(ctx);
    raw = applyEdits(raw, modify(raw, ["provider", item.id], payload, FORMAT_OPTS));
    writeProjectConfig(ctx, raw);
  } else if (item.type === "mcp") {
    const payload = readStoreJsonPayload(item);
    let raw = readProjectConfigRaw(ctx);
    raw = applyEdits(raw, modify(raw, ["mcp", item.id], payload, FORMAT_OPTS));
    writeProjectConfig(ctx, raw);
  }
}

// ---------------------------------------------------------------------------
// Uninstall
// ---------------------------------------------------------------------------

/** Uninstall a store item from the active config scope */
export function uninstallItem(item: StoreItemMeta, ctx?: ProjectContext): void {
  if (!ctx || ctx.mode === "global") {
    uninstallItemGlobal(item);
  } else {
    uninstallItemProject(item, ctx);
  }
}

function uninstallItemGlobal(item: StoreItemMeta): void {
  const state = getGlobalInstalledState(item);
  if (!state.installed) return;

  if (state.installedVia === "file") {
    if (item.type === "agent") {
      const filePath = path.join(getGlobalConfigDir(), "agents", `${item.id}.md`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } else if (item.type === "command") {
      const filePath = path.join(getGlobalConfigDir(), "commands", `${item.id}.md`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } else if (item.type === "skill") {
      const dirPath = path.join(getGlobalConfigDir(), "skills", item.id);
      if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true });
    }
  } else if (state.installedVia === "json") {
    const configKey = getConfigKey(item.type);
    let raw = readGlobalConfigRaw();
    raw = applyEdits(raw, modify(raw, [configKey, item.id], undefined, FORMAT_OPTS));
    const parsed = parseJsonc(raw) as Record<string, unknown> | null;
    if (parsed) {
      const section = parsed[configKey];
      if (section && typeof section === "object" && Object.keys(section as object).length === 0) {
        raw = applyEdits(raw, modify(raw, [configKey], undefined, FORMAT_OPTS));
      }
    }
    writeGlobalConfig(raw);
  }
}

function uninstallItemProject(item: StoreItemMeta, ctx: ProjectContext): void {
  const state = getProjectInstalledState(item, ctx);
  if (!state.installed) return;

  const dotDir = getProjectDotDir(ctx);

  if (state.installedVia === "file") {
    if (item.type === "agent") {
      const filePath = path.join(dotDir, "agents", `${item.id}.md`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } else if (item.type === "command") {
      const filePath = path.join(dotDir, "commands", `${item.id}.md`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } else if (item.type === "skill") {
      const dirPath = path.join(dotDir, "skills", item.id);
      if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true });
    }
  } else if (state.installedVia === "json") {
    const configKey = getConfigKey(item.type);
    let raw = readProjectConfigRaw(ctx);
    raw = applyEdits(raw, modify(raw, [configKey, item.id], undefined, FORMAT_OPTS));
    const parsed = parseJsonc(raw) as Record<string, unknown> | null;
    if (parsed) {
      const section = parsed[configKey];
      if (section && typeof section === "object" && Object.keys(section as object).length === 0) {
        raw = applyEdits(raw, modify(raw, [configKey], undefined, FORMAT_OPTS));
      }
    }
    writeProjectConfig(ctx, raw);
  }
}

/** Map item type to the top-level opencode.json key */
function getConfigKey(type: StoreItemMeta["type"]): string {
  switch (type) {
    case "agent": return "agent";
    case "command": return "command";
    case "provider": return "provider";
    case "mcp": return "mcp";
    default: return type;
  }
}

// ---------------------------------------------------------------------------
// Toggle & view
// ---------------------------------------------------------------------------

/** Toggle install state - install if not installed, uninstall if installed */
export function toggleItem(item: StoreItemMeta, ctx?: ProjectContext): boolean {
  const state = getInstalledState(item, ctx);
  if (state.installed) {
    uninstallItem(item, ctx);
    return false;
  } else {
    installItem(item, ctx);
    return true;
  }
}

/** Build the full store view with installed states */
export function buildStoreView(items: StoreItemMeta[], ctx?: ProjectContext): StoreView {
  const context: ProjectContext = ctx ?? { mode: "global" };

  const withState: StoreItemWithState[] = items.map((item) => ({
    ...item,
    state: getInstalledState(item, context),
  }));

  return {
    agents: withState.filter((i) => i.type === "agent"),
    commands: withState.filter((i) => i.type === "command"),
    skills: withState.filter((i) => i.type === "skill"),
    providers: withState.filter((i) => i.type === "provider"),
    mcps: withState.filter((i) => i.type === "mcp"),
    context,
  };
}
