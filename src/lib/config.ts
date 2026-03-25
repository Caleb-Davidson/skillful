/**
 * Reads and writes the OpenCode global configuration.
 * Handles JSON config (opencode.json), markdown files in
 * ~/.config/opencode/{agents,commands,skills}/, and JSON blocks
 * for providers and MCP servers.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parse as parseJsonc, modify, applyEdits } from "jsonc-parser";
import type { StoreItemMeta, InstalledState, StoreItemWithState, StoreView } from "./types.js";
import { getStorePath } from "./store.js";

const FORMAT_OPTS = { formattingOptions: { insertSpaces: true, tabSize: 2 } };

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
// File-based item listing
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
// Installed state detection
// ---------------------------------------------------------------------------

/** Determine if a store item is currently installed */
export function getInstalledState(item: StoreItemMeta): InstalledState {
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
// Install
// ---------------------------------------------------------------------------

/** Install a store item into the global config */
export function installItem(item: StoreItemMeta): void {
  const storePath = getStorePath();
  const srcPath = path.join(storePath, item.path);

  if (!fs.existsSync(srcPath)) {
    throw new Error(`Store item not found: ${srcPath}`);
  }

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
    // Set provider.<id> = payload
    raw = applyEdits(raw, modify(raw, ["provider", item.id], payload, FORMAT_OPTS));
    writeGlobalConfig(raw);
  } else if (item.type === "mcp") {
    const payload = readStoreJsonPayload(item);
    let raw = readGlobalConfigRaw();
    // Set mcp.<id> = payload
    raw = applyEdits(raw, modify(raw, ["mcp", item.id], payload, FORMAT_OPTS));
    writeGlobalConfig(raw);
  }
}

// ---------------------------------------------------------------------------
// Uninstall
// ---------------------------------------------------------------------------

/** Uninstall a store item from the global config */
export function uninstallItem(item: StoreItemMeta): void {
  const state = getInstalledState(item);
  if (!state.installed) return;

  if (state.installedVia === "file") {
    // File-based items (agents, commands, skills)
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
    // JSON-based items (agents via json, commands via json, providers, mcps)
    const configKey = getConfigKey(item.type);
    let raw = readGlobalConfigRaw();
    // Remove the item key
    raw = applyEdits(raw, modify(raw, [configKey, item.id], undefined, FORMAT_OPTS));
    // If the section is now empty, remove the section entirely
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
export function toggleItem(item: StoreItemMeta): boolean {
  const state = getInstalledState(item);
  if (state.installed) {
    uninstallItem(item);
    return false;
  } else {
    installItem(item);
    return true;
  }
}

/** Build the full store view with installed states */
export function buildStoreView(items: StoreItemMeta[]): StoreView {
  const withState: StoreItemWithState[] = items.map((item) => ({
    ...item,
    state: getInstalledState(item),
  }));

  return {
    agents: withState.filter((i) => i.type === "agent"),
    commands: withState.filter((i) => i.type === "command"),
    skills: withState.filter((i) => i.type === "skill"),
    providers: withState.filter((i) => i.type === "provider"),
    mcps: withState.filter((i) => i.type === "mcp"),
  };
}
