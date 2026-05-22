/**
 * Claude Code CLI–specific storage and install logic.
 *
 * Global (user) config:
 *   ~/.claude/{agents,commands,skills}/
 *   ~/.claude.json                              (mcpServers key)
 *
 * Project config:
 *   <projectRoot>/.claude/{agents,commands,skills}/
 *   <projectRoot>/.mcp.json                     (mcpServers key)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseJsonc, modify, applyEdits } from "jsonc-parser";
import type { InstalledState, ProjectContext, StoreItemMeta } from "../types.js";
import { resolveStoreItemPath } from "../store.js";
import { hashCanonicalJson, hashNormalizedText } from "../hash.js";
import { CLAUDE_MD_REDIRECT_CONTENT, CLAUDE_MD_REDIRECT_ID } from "../builtins.js";

const FORMAT_OPTS = { formattingOptions: { insertSpaces: true, tabSize: 2 } };
const MCP_KEY = "mcpServers";

// ── Per-session cache to avoid repeated filesystem reads during buildStoreView ──
// Call invalidateCache() after any install/uninstall to ensure fresh data.
let _globalMcpConfigCache: Record<string, unknown> | null = null;
let _projectMcpConfigCache: { key: string; data: Record<string, unknown> } | null = null;
let _globalFilesCache: { agents: string[]; commands: string[]; skills: string[] } | null = null;
let _projectFilesCache: { key: string; agents: string[]; commands: string[]; skills: string[] } | null = null;

/** Invalidate all caches. Call after install/uninstall operations. */
export function invalidateCache(): void {
  _globalMcpConfigCache = null;
  _projectMcpConfigCache = null;
  _globalFilesCache = null;
  _projectFilesCache = null;
}

// ── Path helpers ────────────────────────────────────────────────────────────

/** User-scope `.claude` directory (~/.claude). */
function getGlobalClaudeDir(): string {
  return path.join(os.homedir(), ".claude");
}

/** Project-scope `.claude` directory (<projectRoot>/.claude). */
function getProjectClaudeDir(ctx: ProjectContext): string {
  return path.join(ctx.projectDir!, ".claude");
}

/** User-scope MCP config: ~/.claude.json (contains `mcpServers` at root). */
function getGlobalMcpConfigPath(): string {
  return path.join(os.homedir(), ".claude.json");
}

/** Project-scope MCP config: <projectRoot>/.mcp.json (contains `mcpServers` at root). */
function getProjectMcpConfigPath(ctx: ProjectContext): string {
  return path.join(ctx.projectDir!, ".mcp.json");
}

function getFileInstallPath(item: StoreItemMeta, ctx?: ProjectContext): string | null {
  if (item.type === "config" && item.id === CLAUDE_MD_REDIRECT_ID) {
    return ctx?.projectDir ? path.join(ctx.projectDir, "CLAUDE.md") : null;
  }
  const baseDir = !ctx || ctx.mode === "global" ? getGlobalClaudeDir() : getProjectClaudeDir(ctx);
  if (item.type === "agent") return path.join(baseDir, "agents", `${item.id}.md`);
  if (item.type === "command") return path.join(baseDir, "commands", `${item.id}.md`);
  if (item.type === "skill") return path.join(baseDir, "skills", item.id, "SKILL.md");
  return null;
}

// ── JSONC config readers / writers ──────────────────────────────────────────

function readGlobalMcpConfig(): Record<string, unknown> {
  if (_globalMcpConfigCache !== null) return _globalMcpConfigCache;
  const configPath = getGlobalMcpConfigPath();
  if (!fs.existsSync(configPath)) {
    _globalMcpConfigCache = {};
    return _globalMcpConfigCache;
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  try {
    _globalMcpConfigCache = (parseJsonc(raw) as Record<string, unknown> | null) ?? {};
  } catch {
    _globalMcpConfigCache = {};
  }
  return _globalMcpConfigCache!;
}

function readGlobalMcpConfigRaw(): string {
  const configPath = getGlobalMcpConfigPath();
  if (!fs.existsSync(configPath)) return "{}";
  return fs.readFileSync(configPath, "utf-8");
}

function writeGlobalMcpConfig(content: string): void {
  const configPath = getGlobalMcpConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, content, "utf-8");
}

function readProjectMcpConfig(ctx: ProjectContext): Record<string, unknown> {
  const cacheKey = ctx.projectDir!;
  if (_projectMcpConfigCache !== null && _projectMcpConfigCache.key === cacheKey) {
    return _projectMcpConfigCache.data;
  }
  const configPath = getProjectMcpConfigPath(ctx);
  if (!fs.existsSync(configPath)) {
    _projectMcpConfigCache = { key: cacheKey, data: {} };
    return _projectMcpConfigCache.data;
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  try {
    _projectMcpConfigCache = { key: cacheKey, data: (parseJsonc(raw) as Record<string, unknown> | null) ?? {} };
  } catch {
    _projectMcpConfigCache = { key: cacheKey, data: {} };
  }
  return _projectMcpConfigCache.data;
}

function readProjectMcpConfigRaw(ctx: ProjectContext): string {
  const configPath = getProjectMcpConfigPath(ctx);
  if (!fs.existsSync(configPath)) return "{}";
  return fs.readFileSync(configPath, "utf-8");
}

function writeProjectMcpConfig(ctx: ProjectContext, content: string): void {
  const configPath = getProjectMcpConfigPath(ctx);
  fs.writeFileSync(configPath, content, "utf-8");
}

// ── File listings (cached) ──────────────────────────────────────────────────

function listFiles(baseDir: string): { agents: string[]; commands: string[]; skills: string[] } {
  const agentsDir = path.join(baseDir, "agents");
  const agents = fs.existsSync(agentsDir)
    ? fs.readdirSync(agentsDir).filter((f: string) => f.endsWith(".md")).map((f: string) => path.basename(f, ".md"))
    : [];

  const commandsDir = path.join(baseDir, "commands");
  const commands = fs.existsSync(commandsDir)
    ? fs.readdirSync(commandsDir).filter((f: string) => f.endsWith(".md")).map((f: string) => path.basename(f, ".md"))
    : [];

  const skillsDir = path.join(baseDir, "skills");
  const skills = fs.existsSync(skillsDir)
    ? fs
        .readdirSync(skillsDir, { withFileTypes: true })
        .filter((d: fs.Dirent) => d.isDirectory())
        .filter((d: fs.Dirent) => fs.existsSync(path.join(skillsDir, d.name, "SKILL.md")))
        .map((d: fs.Dirent) => d.name)
    : [];

  return { agents, commands, skills };
}

function getGlobalFiles(): { agents: string[]; commands: string[]; skills: string[] } {
  if (_globalFilesCache !== null) return _globalFilesCache;
  _globalFilesCache = listFiles(getGlobalClaudeDir());
  return _globalFilesCache;
}

function getProjectFiles(ctx: ProjectContext): { agents: string[]; commands: string[]; skills: string[] } {
  const cacheKey = ctx.projectDir!;
  if (_projectFilesCache !== null && _projectFilesCache.key === cacheKey) {
    return _projectFilesCache;
  }
  _projectFilesCache = { key: cacheKey, ...listFiles(getProjectClaudeDir(ctx)) };
  return _projectFilesCache;
}

// ── MCP payload normalization ───────────────────────────────────────────────

/** Read a store JSON file and return the config payload (without _meta). */
function readStoreJsonPayload(item: StoreItemMeta): Record<string, unknown> {
  const srcPath = resolveStoreItemPath(item);
  const raw = fs.readFileSync(srcPath, "utf-8");
  const parsed = parseJsonc(raw) as Record<string, unknown>;
  const { _meta: _, ...payload } = parsed;
  return payload;
}

/**
 * Convert array-form `command: ["npx", "-y", "x"]` to `command: "npx", args: ["-y", "x"]`.
 * Ported from the Codex adapter — some store payloads use the array shape.
 */
function normalizeCommandArray(payload: Record<string, unknown>): Record<string, unknown> {
  const rawCommand = payload.command;
  if (!Array.isArray(rawCommand) || rawCommand.length === 0) return payload;

  const [first, ...rest] = rawCommand;
  if (typeof first !== "string") return payload;

  const next: Record<string, unknown> = { ...payload, command: first };
  if (rest.length > 0 && next.args === undefined) next.args = rest;
  return next;
}

/**
 * Normalize a store MCP payload into Claude's `mcpServers.<id>` shape.
 *
 * Claude formats:
 *   stdio: { command, args?, env? }
 *   http:  { type: "http", url, headers? }
 *   sse:   { type: "sse",  url, headers? }
 *
 * Store formats:
 *   local:  { type: "local",  command (string or array), args?, env? }
 *   remote: { type: "remote", url, headers?, enabled? }
 *
 * Heuristic: remote URLs ending in `/sse` default to `sse`, otherwise `http`.
 * An explicit `transport: "sse" | "http"` field overrides the heuristic.
 * The OpenCode-specific `enabled` field is stripped.
 */
function normalizeMcpPayload(item: StoreItemMeta, payload: Record<string, unknown>): Record<string, unknown> {
  const withCommand = normalizeCommandArray(payload);
  // Strip fields that don't belong in Claude's MCP entry.
  const { type, enabled: _enabled, transport, ...rest } = withCommand as Record<string, unknown> & {
    type?: unknown;
    enabled?: unknown;
    transport?: unknown;
  };

  const hasCommand = typeof rest.command === "string";
  const hasUrl = typeof rest.url === "string";

  // stdio: triggered by `type: "local"` or by the mere presence of a command.
  if (type === "local" || (hasCommand && !hasUrl)) {
    if (!hasCommand) {
      throw new Error(`MCP '${item.id}' has type 'local' but no 'command' string.`);
    }
    // Drop `type` — stdio entries in Claude have no type field.
    return rest;
  }

  // remote (sse or http): triggered by `type: "remote"` or by presence of a URL.
  if (type === "remote" || (hasUrl && !hasCommand)) {
    if (!hasUrl) {
      throw new Error(`MCP '${item.id}' has type 'remote' but no 'url' string.`);
    }
    const url = rest.url as string;
    let chosen: "sse" | "http";
    if (transport === "sse" || transport === "http") {
      chosen = transport;
    } else {
      // Heuristic on URL path.
      chosen = /\/sse(?:[/?#]|$)/i.test(url) ? "sse" : "http";
    }
    return { type: chosen, ...rest };
  }

  // Unknown shape — pass through with `type` preserved if it was a string.
  if (typeof type === "string") {
    return { type, ...rest };
  }
  return rest;
}

function validateMcpPayload(item: StoreItemMeta, payload: Record<string, unknown>): void {
  const hasCommand = typeof payload.command === "string";
  const hasUrl = typeof payload.url === "string";
  if (!hasCommand && !hasUrl) {
    throw new Error(`MCP '${item.id}' must define either 'command' (stdio) or 'url' (remote).`);
  }
}

// ── Install state detection ─────────────────────────────────────────────────

function getInstalledMcpPayload(item: StoreItemMeta, ctx?: ProjectContext): unknown {
  const config = !ctx || ctx.mode === "global" ? readGlobalMcpConfig() : readProjectMcpConfig(ctx);
  const section = config[MCP_KEY] as Record<string, unknown> | undefined;
  return section?.[item.id];
}

function isClaudeMdRedirect(item: StoreItemMeta): boolean {
  return item.type === "config" && item.id === CLAUDE_MD_REDIRECT_ID;
}

function getGlobalInstalledState(item: StoreItemMeta): InstalledState {
  // Config items are project-scoped; never installed at the user/global level.
  if (item.type === "config") {
    return { installed: false };
  }
  const files = getGlobalFiles();

  if (item.type === "agent") {
    if (files.agents.includes(item.id)) {
      return { installed: true, installedVia: "file", mismatchChecked: false };
    }
  }

  if (item.type === "command") {
    if (files.commands.includes(item.id)) {
      return { installed: true, installedVia: "file", mismatchChecked: false };
    }
  }

  if (item.type === "skill") {
    if (files.skills.includes(item.id)) {
      return { installed: true, installedVia: "file", mismatchChecked: false };
    }
  }

  if (item.type === "mcp") {
    const config = readGlobalMcpConfig();
    const servers = config[MCP_KEY] as Record<string, unknown> | undefined;
    if (servers && item.id in servers) {
      return { installed: true, installedVia: "json", mismatchChecked: false };
    }
  }

  return { installed: false };
}

function getProjectInstalledState(item: StoreItemMeta, ctx: ProjectContext): InstalledState {
  if (isClaudeMdRedirect(item)) {
    const filePath = path.join(ctx.projectDir!, "CLAUDE.md");
    if (!fs.existsSync(filePath)) {
      return { installed: false };
    }
    return { installed: true, installedVia: "file", mismatchChecked: false };
  }

  const files = getProjectFiles(ctx);

  if (item.type === "agent") {
    if (files.agents.includes(item.id)) {
      return { installed: true, installedVia: "file", mismatchChecked: false };
    }
  }

  if (item.type === "command") {
    if (files.commands.includes(item.id)) {
      return { installed: true, installedVia: "file", mismatchChecked: false };
    }
  }

  if (item.type === "skill") {
    if (files.skills.includes(item.id)) {
      return { installed: true, installedVia: "file", mismatchChecked: false };
    }
  }

  if (item.type === "mcp") {
    const config = readProjectMcpConfig(ctx);
    const servers = config[MCP_KEY] as Record<string, unknown> | undefined;
    if (servers && item.id in servers) {
      return { installed: true, installedVia: "json", mismatchChecked: false };
    }
  }

  return { installed: false };
}

/** Determine if a store item is installed in the active Claude Code scope. */
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

export async function getMismatchState(
  item: StoreItemMeta,
  ctx?: ProjectContext
): Promise<Pick<InstalledState, "mismatch" | "mismatchChecked">> {
  if (!item.storeHash) {
    return { mismatch: false, mismatchChecked: true };
  }

  const state = !ctx || ctx.mode === "global" ? getGlobalInstalledState(item) : getProjectInstalledState(item, ctx);
  if (!state.installed) {
    return { mismatch: false, mismatchChecked: true };
  }

  if (state.installedVia === "file") {
    const filePath = getFileInstallPath(item, ctx);
    if (!filePath) {
      return { mismatch: false, mismatchChecked: true };
    }
    try {
      const raw = await fs.promises.readFile(filePath, "utf-8");
      const installedHash = hashNormalizedText(raw);
      return { mismatch: installedHash !== item.storeHash, mismatchChecked: true };
    } catch {
      return { mismatch: true, mismatchChecked: true };
    }
  }

  if (state.installedVia === "json") {
    if (item.type !== "mcp") {
      return { mismatch: false, mismatchChecked: true };
    }
    const payload = getInstalledMcpPayload(item, ctx);
    if (payload === undefined) {
      return { mismatch: true, mismatchChecked: true };
    }
    const installedHash = hashCanonicalJson(payload);
    return { mismatch: installedHash !== item.storeHash, mismatchChecked: true };
  }

  return { mismatch: false, mismatchChecked: true };
}

// ── Install / uninstall ─────────────────────────────────────────────────────

/** Install a store item into Claude's active config scope. */
export function installItem(item: StoreItemMeta, ctx?: ProjectContext): void {
  if (item.type === "config") {
    installConfigItem(item, ctx);
    invalidateCache();
    return;
  }

  const srcPath = resolveStoreItemPath(item);
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

/**
 * Install a built-in config item. Config items have no on-disk store payload —
 * the install action is fully described by the adapter.
 */
function installConfigItem(item: StoreItemMeta, ctx?: ProjectContext): void {
  if (isClaudeMdRedirect(item)) {
    if (!ctx || ctx.mode !== "project" || !ctx.projectDir) {
      throw new Error("CLAUDE.md Redirect requires a project context; switch to a project to install.");
    }
    const filePath = path.join(ctx.projectDir, "CLAUDE.md");
    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, "utf-8");
      if (existing !== CLAUDE_MD_REDIRECT_CONTENT) {
        throw new Error(
          `CLAUDE.md already exists at ${filePath} with different content. Remove or back it up before installing the redirect.`
        );
      }
      return; // already the redirect — nothing to do
    }
    fs.writeFileSync(filePath, CLAUDE_MD_REDIRECT_CONTENT, "utf-8");
    return;
  }

  throw new Error(`Claude Code does not know how to install config item '${item.id}'.`);
}

function installItemGlobal(item: StoreItemMeta, srcPath: string): void {
  const baseDir = getGlobalClaudeDir();

  if (item.type === "agent") {
    if (!item.path.endsWith(".md")) {
      throw new Error(`Claude Code supports only .md agents. Received: ${item.path}`);
    }
    const destDir = path.join(baseDir, "agents");
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, path.join(destDir, `${item.id}.md`));
    return;
  }

  if (item.type === "command") {
    const destDir = path.join(baseDir, "commands");
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, path.join(destDir, `${item.id}.md`));
    return;
  }

  if (item.type === "skill") {
    const srcDir = path.dirname(srcPath);
    if (!fs.existsSync(path.join(srcDir, "SKILL.md"))) {
      throw new Error(`Skill '${item.id}' is missing SKILL.md and cannot be installed.`);
    }
    const destDir = path.join(baseDir, "skills", item.id);
    fs.mkdirSync(destDir, { recursive: true });
    fs.cpSync(srcDir, destDir, { recursive: true });
    return;
  }

  if (item.type === "mcp") {
    const rawPayload = readStoreJsonPayload(item);
    const payload = normalizeMcpPayload(item, rawPayload);
    validateMcpPayload(item, payload);
    let raw = readGlobalMcpConfigRaw();
    raw = applyEdits(raw, modify(raw, [MCP_KEY, item.id], payload, FORMAT_OPTS));
    writeGlobalMcpConfig(raw);
    return;
  }

  throw new Error(`Claude Code does not support installing items of type '${item.type}'.`);
}

function installItemProject(item: StoreItemMeta, ctx: ProjectContext, srcPath: string): void {
  const baseDir = getProjectClaudeDir(ctx);

  if (item.type === "agent") {
    if (!item.path.endsWith(".md")) {
      throw new Error(`Claude Code supports only .md agents. Received: ${item.path}`);
    }
    const destDir = path.join(baseDir, "agents");
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, path.join(destDir, `${item.id}.md`));
    return;
  }

  if (item.type === "command") {
    const destDir = path.join(baseDir, "commands");
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, path.join(destDir, `${item.id}.md`));
    return;
  }

  if (item.type === "skill") {
    const srcDir = path.dirname(srcPath);
    if (!fs.existsSync(path.join(srcDir, "SKILL.md"))) {
      throw new Error(`Skill '${item.id}' is missing SKILL.md and cannot be installed.`);
    }
    const destDir = path.join(baseDir, "skills", item.id);
    fs.mkdirSync(destDir, { recursive: true });
    fs.cpSync(srcDir, destDir, { recursive: true });
    return;
  }

  if (item.type === "mcp") {
    const rawPayload = readStoreJsonPayload(item);
    const payload = normalizeMcpPayload(item, rawPayload);
    validateMcpPayload(item, payload);
    let raw = readProjectMcpConfigRaw(ctx);
    raw = applyEdits(raw, modify(raw, [MCP_KEY, item.id], payload, FORMAT_OPTS));
    writeProjectMcpConfig(ctx, raw);
    return;
  }

  throw new Error(`Claude Code does not support installing items of type '${item.type}'.`);
}

/** Uninstall a store item from Claude's active config scope. */
export function uninstallItem(item: StoreItemMeta, ctx?: ProjectContext): void {
  if (item.type === "config") {
    uninstallConfigItem(item, ctx);
    invalidateCache();
    return;
  }

  if (!ctx || ctx.mode === "global") {
    uninstallItemGlobal(item);
  } else {
    uninstallItemProject(item, ctx);
  }

  invalidateCache();
}

function uninstallConfigItem(item: StoreItemMeta, ctx?: ProjectContext): void {
  if (isClaudeMdRedirect(item)) {
    if (!ctx || ctx.mode !== "project" || !ctx.projectDir) return;
    const filePath = path.join(ctx.projectDir, "CLAUDE.md");
    if (!fs.existsSync(filePath)) return;
    const existing = fs.readFileSync(filePath, "utf-8");
    if (existing === CLAUDE_MD_REDIRECT_CONTENT) {
      fs.unlinkSync(filePath);
    }
    // If content differs, leave the user's CLAUDE.md alone.
  }
}

function uninstallItemGlobal(item: StoreItemMeta): void {
  const state = getGlobalInstalledState(item);
  if (!state.installed) return;
  const baseDir = getGlobalClaudeDir();

  if (state.installedVia === "file") {
    if (item.type === "agent") {
      const filePath = path.join(baseDir, "agents", `${item.id}.md`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } else if (item.type === "command") {
      const filePath = path.join(baseDir, "commands", `${item.id}.md`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } else if (item.type === "skill") {
      const dirPath = path.join(baseDir, "skills", item.id);
      if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
    }
    return;
  }

  if (state.installedVia === "json" && item.type === "mcp") {
    let raw = readGlobalMcpConfigRaw();
    raw = applyEdits(raw, modify(raw, [MCP_KEY, item.id], undefined, FORMAT_OPTS));
    const parsed = parseJsonc(raw) as Record<string, unknown> | null;
    if (parsed) {
      const section = parsed[MCP_KEY];
      if (section && typeof section === "object" && Object.keys(section as object).length === 0) {
        raw = applyEdits(raw, modify(raw, [MCP_KEY], undefined, FORMAT_OPTS));
      }
    }
    writeGlobalMcpConfig(raw);
  }
}

function uninstallItemProject(item: StoreItemMeta, ctx: ProjectContext): void {
  const state = getProjectInstalledState(item, ctx);
  if (!state.installed) return;
  const baseDir = getProjectClaudeDir(ctx);

  if (state.installedVia === "file") {
    if (item.type === "agent") {
      const filePath = path.join(baseDir, "agents", `${item.id}.md`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } else if (item.type === "command") {
      const filePath = path.join(baseDir, "commands", `${item.id}.md`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } else if (item.type === "skill") {
      const dirPath = path.join(baseDir, "skills", item.id);
      if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
    }
    return;
  }

  if (state.installedVia === "json" && item.type === "mcp") {
    let raw = readProjectMcpConfigRaw(ctx);
    raw = applyEdits(raw, modify(raw, [MCP_KEY, item.id], undefined, FORMAT_OPTS));
    const parsed = parseJsonc(raw) as Record<string, unknown> | null;
    if (parsed) {
      const section = parsed[MCP_KEY];
      if (section && typeof section === "object" && Object.keys(section as object).length === 0) {
        raw = applyEdits(raw, modify(raw, [MCP_KEY], undefined, FORMAT_OPTS));
      }
    }
    writeProjectMcpConfig(ctx, raw);
  }
}
