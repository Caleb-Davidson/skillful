/**
 * OpenCode-specific storage and install logic.
 *
 * Global config:   ~/.config/opencode/opencode.json + ~/.config/opencode/{agents,commands,skills}/
 * Project config:  <projectRoot>/opencode.json + <projectRoot>/.opencode/{agents,commands,skills}/
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parse as parseJsonc, modify, applyEdits } from "jsonc-parser";
import type { StoreItemMeta, InstalledState, ProjectContext } from "../types.js";
import { getStorePath } from "../store.js";

const FORMAT_OPTS = { formattingOptions: { insertSpaces: true, tabSize: 2 } };

// ── Per-session cache to avoid repeated filesystem reads during buildStoreView ──
// Call invalidateCache() after any install/uninstall to ensure fresh data.
let _globalConfigCache: Record<string, unknown> | null = null;
let _projectConfigCache: { key: string; data: Record<string, unknown> } | null = null;
let _globalFilesCache: { agents: string[]; commands: string[]; skills: string[] } | null = null;
let _projectFilesCache: { key: string; agents: string[]; commands: string[]; skills: string[] } | null = null;

/** Invalidate all caches. Call after install/uninstall operations. */
export function invalidateCache(): void {
  _globalConfigCache = null;
  _projectConfigCache = null;
  _globalFilesCache = null;
  _projectFilesCache = null;
}

/** OpenCode global config directory */
export function getGlobalConfigDir(): string {
  return path.join(os.homedir(), ".config", "opencode");
}

/** OpenCode global config file path */
export function getGlobalConfigPath(): string {
  return path.join(getGlobalConfigDir(), "opencode.json");
}

/** Read and parse the global opencode.json (JSONC) — cached per session */
export function readGlobalConfig(): Record<string, unknown> {
  if (_globalConfigCache !== null) return _globalConfigCache;
  const configPath = getGlobalConfigPath();
  if (!fs.existsSync(configPath)) {
    _globalConfigCache = {};
    return _globalConfigCache;
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  try {
    const parsed = (parseJsonc(raw) as Record<string, unknown> | null) ?? {};
    _globalConfigCache = parsed;
  } catch {
    _globalConfigCache = {};
  }
  return _globalConfigCache!;
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

/** OpenCode project config file path: <projectRoot>/opencode.json */
function getProjectConfigPath(ctx: ProjectContext): string {
  return path.join(ctx.projectDir!, "opencode.json");
}

/** The .opencode directory inside the project root */
function getProjectDotDir(ctx: ProjectContext): string {
  return path.join(ctx.projectDir!, ".opencode");
}

/** Read and parse the project opencode.json (JSONC) — cached per session */
function readProjectConfig(ctx: ProjectContext): Record<string, unknown> {
  const cacheKey = ctx.projectDir!;
  if (_projectConfigCache !== null && _projectConfigCache.key === cacheKey) {
    return _projectConfigCache.data;
  }
  const configPath = getProjectConfigPath(ctx);
  if (!fs.existsSync(configPath)) {
    _projectConfigCache = { key: cacheKey, data: {} };
    return _projectConfigCache.data;
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  try {
    _projectConfigCache = { key: cacheKey, data: parseJsonc(raw) ?? {} };
  } catch {
    _projectConfigCache = { key: cacheKey, data: {} };
  }
  return _projectConfigCache.data;
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

/** Cached global file listings */
function getGlobalFiles(): { agents: string[]; commands: string[]; skills: string[] } {
  if (_globalFilesCache !== null) return _globalFilesCache;

  const configDir = getGlobalConfigDir();

  const agentsDir = path.join(configDir, "agents");
  const agents = fs.existsSync(agentsDir)
    ? fs.readdirSync(agentsDir).filter((f: string) => f.endsWith(".md")).map((f: string) => path.basename(f, ".md"))
    : [];

  const commandsDir = path.join(configDir, "commands");
  const commands = fs.existsSync(commandsDir)
    ? fs.readdirSync(commandsDir).filter((f: string) => f.endsWith(".md")).map((f: string) => path.basename(f, ".md"))
    : [];

  const skillsDir = path.join(configDir, "skills");
  const skills = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter((d: fs.Dirent) => d.isDirectory())
        .filter((d: fs.Dirent) => fs.existsSync(path.join(skillsDir, d.name, "SKILL.md")))
        .map((d: fs.Dirent) => d.name)
    : [];

  _globalFilesCache = { agents, commands, skills };
  return _globalFilesCache;
}

/** Cached project file listings */
function getProjectFiles(ctx: ProjectContext): { agents: string[]; commands: string[]; skills: string[] } {
  const cacheKey = ctx.projectDir!;
  if (_projectFilesCache !== null && _projectFilesCache.key === cacheKey) {
    return _projectFilesCache;
  }

  const dotDir = getProjectDotDir(ctx);

  const agentsDir = path.join(dotDir, "agents");
  const agents = fs.existsSync(agentsDir)
    ? fs.readdirSync(agentsDir).filter((f: string) => f.endsWith(".md")).map((f: string) => path.basename(f, ".md"))
    : [];

  const commandsDir = path.join(dotDir, "commands");
  const commands = fs.existsSync(commandsDir)
    ? fs.readdirSync(commandsDir).filter((f: string) => f.endsWith(".md")).map((f: string) => path.basename(f, ".md"))
    : [];

  const skillsDir = path.join(dotDir, "skills");
  const skills = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter((d: fs.Dirent) => d.isDirectory())
        .filter((d: fs.Dirent) => fs.existsSync(path.join(skillsDir, d.name, "SKILL.md")))
        .map((d: fs.Dirent) => d.name)
    : [];

  _projectFilesCache = { key: cacheKey, agents, commands, skills };
  return _projectFilesCache;
}

/** Read a store JSON file and return the config payload (without _meta) */
function readStoreJsonPayload(item: StoreItemMeta): Record<string, unknown> {
  const storePath = getStorePath();
  const srcPath = path.join(storePath, item.path);
  const raw = fs.readFileSync(srcPath, "utf-8");
  const parsed = parseJsonc(raw) as Record<string, unknown>;
  const { _meta: _, ...payload } = parsed;
  return payload;
}

/** Check if a store item is installed in the global config */
function getGlobalInstalledState(item: StoreItemMeta): InstalledState {
  const config = readGlobalConfig();
  const files = getGlobalFiles();

  if (item.type === "agent") {
    const agents = config.agent as Record<string, unknown> | undefined;
    if (agents && item.id in agents) {
      return { installed: true, installedVia: "json" };
    }
    if (files.agents.includes(item.id)) {
      return { installed: true, installedVia: "file" };
    }
  }

  if (item.type === "command") {
    const commands = config.command as Record<string, unknown> | undefined;
    if (commands && item.id in commands) {
      return { installed: true, installedVia: "json" };
    }
    if (files.commands.includes(item.id)) {
      return { installed: true, installedVia: "file" };
    }
  }

  if (item.type === "skill") {
    if (files.skills.includes(item.id)) {
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

/** Check if a store item is installed at the project level */
function getProjectInstalledState(item: StoreItemMeta, ctx: ProjectContext): InstalledState {
  const config = readProjectConfig(ctx);
  const files = getProjectFiles(ctx);

  if (item.type === "agent") {
    const agents = config.agent as Record<string, unknown> | undefined;
    if (agents && item.id in agents) {
      return { installed: true, installedVia: "json" };
    }
    if (files.agents.includes(item.id)) {
      return { installed: true, installedVia: "file" };
    }
  }

  if (item.type === "command") {
    const commands = config.command as Record<string, unknown> | undefined;
    if (commands && item.id in commands) {
      return { installed: true, installedVia: "json" };
    }
    if (files.commands.includes(item.id)) {
      return { installed: true, installedVia: "file" };
    }
  }

  if (item.type === "skill") {
    if (files.skills.includes(item.id)) {
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

/** Determine if a store item is installed in active OpenCode scope. */
export function getInstalledState(item: StoreItemMeta, ctx?: ProjectContext): InstalledState {
  if (!ctx || ctx.mode === "global") {
    return getGlobalInstalledState(item);
  }

  const globalState = getGlobalInstalledState(item);
  const projectState = getProjectInstalledState(item, ctx);

  if (projectState.installed) {
    return {
      installed: true,
      installedVia: projectState.installedVia,
      globalInstalled: globalState.installed,
    };
  }

  return {
    installed: false,
    globalInstalled: globalState.installed,
  };
}

/** Install a store item into OpenCode's active config scope. */
export function installItem(item: StoreItemMeta, ctx?: ProjectContext): void {
  const storePath = getStorePath();
  const srcPath = path.join(storePath, item.path);

  if (!fs.existsSync(srcPath)) {
    throw new Error(`Store item not found: ${srcPath}`);
  }

  if (!ctx || ctx.mode === "global") {
    installItemGlobal(item, srcPath);
  } else {
    installItemProject(item, ctx, srcPath);
  }

  invalidateCache();
}

function installItemGlobal(item: StoreItemMeta, srcPath: string): void {
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

function installItemProject(item: StoreItemMeta, ctx: ProjectContext, srcPath: string): void {
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

/** Uninstall a store item from OpenCode's active config scope. */
export function uninstallItem(item: StoreItemMeta, ctx?: ProjectContext): void {
  if (!ctx || ctx.mode === "global") {
    uninstallItemGlobal(item);
  } else {
    uninstallItemProject(item, ctx);
  }

  invalidateCache();
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

function getConfigKey(type: StoreItemMeta["type"]): string {
  switch (type) {
    case "agent":
      return "agent";
    case "command":
      return "command";
    case "provider":
      return "provider";
    case "mcp":
      return "mcp";
    default:
      return type;
  }
}
