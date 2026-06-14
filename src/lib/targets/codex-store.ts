import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import type { InstalledState, ProjectContext, StoreItemMeta } from "../types.js";
import { resolveStoreItemPath } from "../store.js";

const CODEX_DIR = path.join(os.homedir(), ".codex");
const CODEX_CONFIG_PATH = path.join(CODEX_DIR, "config.toml");

function getGlobalCodexDir(): string {
  return CODEX_DIR;
}

function getProjectCodexDir(ctx: ProjectContext): string {
  return path.join(ctx.projectDir!, ".codex");
}

function getConfigPath(): string {
  return CODEX_CONFIG_PATH;
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readTomlRaw(): string {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return "";
  return fs.readFileSync(configPath, "utf-8");
}

function writeTomlRaw(content: string): void {
  const configPath = getConfigPath();
  ensureParentDir(configPath);
  fs.writeFileSync(configPath, content, "utf-8");
}

function tomlPrimitive(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null) return JSON.stringify("");
  return JSON.stringify(String(value));
}

function toTomlLines(prefix: string, value: unknown): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [`${prefix} = ${tomlValue(value)}`];
  }

  const obj = value as Record<string, unknown>;
  const lines: string[] = [];
  for (const [key, subValue] of Object.entries(obj)) {
    const subPrefix = `${prefix}.${key}`;
    if (subValue && typeof subValue === "object" && !Array.isArray(subValue)) {
      lines.push(...toTomlLines(subPrefix, subValue));
      continue;
    }
    lines.push(`${subPrefix} = ${tomlValue(subValue)}`);
  }
  return lines;
}

function tomlValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => tomlPrimitive(v)).join(", ")}]`;
  }
  return tomlPrimitive(value);
}

function sectionHeader(section: string, id: string): string {
  return `[${section}.${id}]`;
}

function hasTomlSection(raw: string, section: string, id: string): boolean {
  const escaped = sectionHeader(section, id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped}\\s*$`, "m");
  return regex.test(raw);
}

function removeTomlSection(raw: string, section: string, id: string): string {
  const escapedHeader = sectionHeader(section, id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(^${escapedHeader}\\s*$[\\s\\S]*?)(?=^\\[[^\\]]+\\]\\s*$|\\Z)`, "m");
  const next = raw.replace(regex, "").replace(/\n{3,}/g, "\n\n");
  return next.trimEnd();
}

function upsertTomlSection(raw: string, section: string, id: string, payload: Record<string, unknown>): string {
  const withoutSection = removeTomlSection(raw, section, id);
  const lines = [sectionHeader(section, id), ...toTomlLines("", payload).map((line) => line.replace(/^\./, ""))];
  const block = `${lines.join("\n")}\n`;
  if (!withoutSection.trim()) return block;
  return `${withoutSection}\n\n${block}`;
}

function copyDirectoryRecursive(srcDir: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(srcDir, destDir, { recursive: true });
}

function readStoreJsonPayload(item: StoreItemMeta): Record<string, unknown> {
  const srcPath = resolveStoreItemPath(item);
  const raw = fs.readFileSync(srcPath, "utf-8");
  const parsed = parseJsonc(raw) as Record<string, unknown>;
  const { _meta: _, ...payload } = parsed;
  return payload;
}

function validateProviderPayload(item: StoreItemMeta, payload: Record<string, unknown>): void {
  if (Object.keys(payload).length === 0) {
    throw new Error(`Provider '${item.id}' is empty. Expected a provider configuration payload.`);
  }
}

function validateMcpPayload(item: StoreItemMeta, payload: Record<string, unknown>): void {
  const hasCommand = typeof payload.command === "string";
  const hasUrl = typeof payload.url === "string";
  if (!hasCommand && !hasUrl) {
    throw new Error(`MCP '${item.id}' must define either 'command' (stdio) or 'url' (remote).`);
  }
}

function normalizeMcpPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const rawCommand = payload.command;
  if (!Array.isArray(rawCommand) || rawCommand.length === 0) {
    return payload;
  }

  const [first, ...rest] = rawCommand;
  if (typeof first !== "string") {
    return payload;
  }

  const next: Record<string, unknown> = {
    ...payload,
    command: first,
  };

  if (rest.length > 0 && next.args === undefined) {
    next.args = rest;
  }

  return next;
}

function getAgentDestPath(item: StoreItemMeta, ctx?: ProjectContext): string {
  const baseDir = !ctx || ctx.mode === "global" ? getGlobalCodexDir() : getProjectCodexDir(ctx);
  return path.join(baseDir, "agents", `${item.id}.toml`);
}

function getSkillDestDir(item: StoreItemMeta): string {
  return path.join(getGlobalCodexDir(), "skills", item.id);
}

function supportFor(item: StoreItemMeta): Pick<InstalledState, "supported" | "supportMode" | "supportReason"> {
  if (item.type === "command") {
    return {
      supported: false,
      supportMode: "no",
      supportReason: "Codex does not support custom command installs; use Skills instead.",
    };
  }

  if (item.type === "agent" && !item.path.endsWith(".toml")) {
    return {
      supported: true,
      supportMode: "partial",
      supportReason: "Codex agent installs support only store/agents/*.toml artifacts.",
    };
  }

  return { supported: true, supportMode: "yes", supportReason: undefined };
}

export function getInstalledState(item: StoreItemMeta, ctx?: ProjectContext): InstalledState {
  const support = supportFor(item);

  if (item.type === "provider") {
    const raw = readTomlRaw();
    return { installed: hasTomlSection(raw, "model_providers", item.id), installedVia: "json", ...support };
  }

  if (item.type === "mcp") {
    const raw = readTomlRaw();
    return { installed: hasTomlSection(raw, "mcp_servers", item.id), installedVia: "json", ...support };
  }

  if (item.type === "skill") {
    const skillDir = getSkillDestDir(item);
    const installed = fs.existsSync(path.join(skillDir, "SKILL.md"));
    return { installed, installedVia: "file", ...support };
  }

  if (item.type === "agent") {
    const agentPath = getAgentDestPath(item, ctx);
    const installed = item.path.endsWith(".toml") && fs.existsSync(agentPath);
    return { installed, installedVia: "file", ...support };
  }

  return { installed: false, ...support };
}

export function installItem(item: StoreItemMeta, ctx?: ProjectContext): string {
  const srcPath = resolveStoreItemPath(item);
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Store item not found: ${srcPath}`);
  }

  if (item.type === "command") {
    throw new Error("Codex command installs are not supported yet.");
  }

  if (item.type === "agent") {
    if (!item.path.endsWith(".toml")) {
      throw new Error(`Codex supports only .toml agents. Received: ${item.path}`);
    }
    const destPath = getAgentDestPath(item, ctx);
    ensureParentDir(destPath);
    fs.copyFileSync(srcPath, destPath);
    return destPath;
  }

  if (item.type === "skill") {
    const srcDir = path.dirname(srcPath);
    const destDir = getSkillDestDir(item);
    if (!fs.existsSync(path.join(srcDir, "SKILL.md"))) {
      throw new Error(`Skill '${item.id}' is missing SKILL.md and cannot be installed.`);
    }
    copyDirectoryRecursive(srcDir, destDir);
    return destDir;
  }

  if (item.type === "provider" || item.type === "mcp") {
    const rawPayload = readStoreJsonPayload(item);
    const payload = item.type === "mcp" ? normalizeMcpPayload(rawPayload) : rawPayload;
    if (item.type === "provider") validateProviderPayload(item, payload);
    if (item.type === "mcp") validateMcpPayload(item, payload);
    const section = item.type === "provider" ? "model_providers" : "mcp_servers";
    const raw = readTomlRaw();
    const next = upsertTomlSection(raw, section, item.id, payload);
    writeTomlRaw(next);
    return getConfigPath();
  }

  throw new Error(`Unsupported Codex item type: ${item.type}`);
}

// ── Sync primitives ─────────────────────────────────────────────────────────

export function listInstalledArtifactsByCategory(
  category: "agent" | "command" | "skill",
  ctx?: ProjectContext
): { id: string; path: string; format?: "md" | "toml" }[] {
  if (category === "command") return [];
  if (category === "agent") {
    const baseDir = !ctx || ctx.mode === "global" ? getGlobalCodexDir() : getProjectCodexDir(ctx);
    const dir = path.join(baseDir, "agents");
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".toml"))
      .map((f) => ({ id: path.basename(f, ".toml"), path: path.join(dir, f), format: "toml" as const }));
  }
  // skill — global-only.
  const dir = path.join(getGlobalCodexDir(), "skills");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => fs.existsSync(path.join(dir, d.name, "SKILL.md")))
    .map((d) => ({ id: d.name, path: path.join(dir, d.name) }));
}

export function installArtifactFromContent(
  input: {
    id: string;
    type: "agent" | "command" | "skill";
    content?: string;
    srcDir?: string;
  },
  ctx?: ProjectContext
): void {
  if (input.type === "command") {
    throw new Error("Codex does not support custom commands.");
  }
  if (input.type === "agent") {
    if (input.content === undefined) throw new Error(`Agent '${input.id}' missing content.`);
    const baseDir = !ctx || ctx.mode === "global" ? getGlobalCodexDir() : getProjectCodexDir(ctx);
    const destPath = path.join(baseDir, "agents", `${input.id}.toml`);
    ensureParentDir(destPath);
    fs.writeFileSync(destPath, input.content, "utf-8");
    return;
  }
  if (input.type === "skill") {
    if (!input.srcDir) throw new Error(`Skill '${input.id}' missing srcDir.`);
    const destDir = getSkillDestDir({ id: input.id } as StoreItemMeta);
    fs.mkdirSync(destDir, { recursive: true });
    fs.cpSync(input.srcDir, destDir, { recursive: true });
    return;
  }
}

export function uninstallItem(item: StoreItemMeta, ctx?: ProjectContext): void {
  if (item.type === "command") return;

  if (item.type === "agent") {
    if (!item.path.endsWith(".toml")) return;
    const destPath = getAgentDestPath(item, ctx);
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    return;
  }

  if (item.type === "skill") {
    const destDir = getSkillDestDir(item);
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
    return;
  }

  if (item.type === "provider" || item.type === "mcp") {
    const section = item.type === "provider" ? "model_providers" : "mcp_servers";
    const raw = readTomlRaw();
    const next = removeTomlSection(raw, section, item.id);
    writeTomlRaw(next ? `${next}\n` : "");
  }
}
