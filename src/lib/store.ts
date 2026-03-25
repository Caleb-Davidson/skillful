/**
 * Scans the local store/ directory and builds an index of all available items.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { parse as parseJsonc } from "jsonc-parser";
import type {
  StoreIndex,
  StoreItemMeta,
  StoreItemType,
  AgentFrontmatter,
  CommandFrontmatter,
  SkillFrontmatter,
  ProviderStoreFile,
  McpStoreFile,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Root of this package (where store/ lives) */
function getProjectRoot(): string {
  let dir = __dirname;
  while (dir !== "/" && !fs.existsSync(path.join(dir, "store"))) {
    dir = path.dirname(dir);
  }
  return dir;
}

export function getStorePath(): string {
  return path.join(getProjectRoot(), "store");
}

function scanAgents(storePath: string): StoreItemMeta[] {
  const agentsDir = path.join(storePath, "agents");
  if (!fs.existsSync(agentsDir)) return [];

  const results: StoreItemMeta[] = [];
  for (const file of fs.readdirSync(agentsDir)) {
    if (!file.endsWith(".md")) continue;
    const filePath = path.join(agentsDir, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = matter(raw);
    const data = parsed.data as AgentFrontmatter;
    const id = path.basename(file, ".md");
    results.push({
      id,
      type: "agent" as StoreItemType,
      name: id,
      description: data.description ?? `Agent: ${id}`,
      tags: [data.mode ?? "subagent", ...(data.model ? [data.model.split("/")[0]] : [])],
      path: `agents/${file}`,
    });
  }
  return results;
}

function scanCommands(storePath: string): StoreItemMeta[] {
  const commandsDir = path.join(storePath, "commands");
  if (!fs.existsSync(commandsDir)) return [];

  const results: StoreItemMeta[] = [];
  for (const file of fs.readdirSync(commandsDir)) {
    if (!file.endsWith(".md")) continue;
    const filePath = path.join(commandsDir, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = matter(raw);
    const data = parsed.data as CommandFrontmatter;
    const id = path.basename(file, ".md");
    results.push({
      id,
      type: "command" as StoreItemType,
      name: id,
      description: data.description ?? `Command: /${id}`,
      tags: [...(data.agent ? [`agent:${data.agent}`] : [])],
      path: `commands/${file}`,
    });
  }
  return results;
}

function scanSkills(storePath: string): StoreItemMeta[] {
  const skillsDir = path.join(storePath, "skills");
  if (!fs.existsSync(skillsDir)) return [];

  const results: StoreItemMeta[] = [];
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(skillsDir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;

    const raw = fs.readFileSync(skillFile, "utf-8");
    const parsed = matter(raw);
    const data = parsed.data as Partial<SkillFrontmatter>;

    if (!data.name || !data.description) continue;

    results.push({
      id: data.name,
      type: "skill" as StoreItemType,
      name: data.name,
      description: data.description,
      tags: [
        ...(data.license ? [`license:${data.license}`] : []),
        ...(data.compatibility ? [data.compatibility] : []),
        ...(data.metadata
          ? Object.entries(data.metadata).map(([k, v]) => `${k}:${v}`)
          : []),
      ],
      path: `skills/${entry.name}/SKILL.md`,
    });
  }
  return results;
}

function scanProviders(storePath: string): StoreItemMeta[] {
  const providersDir = path.join(storePath, "providers");
  if (!fs.existsSync(providersDir)) return [];

  const results: StoreItemMeta[] = [];
  for (const file of fs.readdirSync(providersDir)) {
    if (!file.endsWith(".json")) continue;
    const filePath = path.join(providersDir, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    try {
      const data = parseJsonc(raw) as ProviderStoreFile;
      const id = path.basename(file, ".json");
      const meta = data._meta;
      if (!meta?.description) continue;
      results.push({
        id,
        type: "provider" as StoreItemType,
        name: id,
        description: meta.description,
        tags: meta.tags ?? [],
        path: `providers/${file}`,
      });
    } catch {
      // Skip malformed JSON
    }
  }
  return results;
}

function scanMcps(storePath: string): StoreItemMeta[] {
  const mcpsDir = path.join(storePath, "mcps");
  if (!fs.existsSync(mcpsDir)) return [];

  const results: StoreItemMeta[] = [];
  for (const file of fs.readdirSync(mcpsDir)) {
    if (!file.endsWith(".json")) continue;
    const filePath = path.join(mcpsDir, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    try {
      const data = parseJsonc(raw) as McpStoreFile;
      const id = path.basename(file, ".json");
      const meta = data._meta;
      if (!meta?.description) continue;
      results.push({
        id,
        type: "mcp" as StoreItemType,
        name: id,
        description: meta.description,
        tags: meta.tags ?? [],
        path: `mcps/${file}`,
      });
    } catch {
      // Skip malformed JSON
    }
  }
  return results;
}

export function buildIndex(): StoreIndex {
  const storePath = getStorePath();
  const items: StoreItemMeta[] = [
    ...scanAgents(storePath),
    ...scanCommands(storePath),
    ...scanSkills(storePath),
    ...scanProviders(storePath),
    ...scanMcps(storePath),
  ];
  return { version: 1, items };
}

export function loadIndex(): StoreIndex {
  const indexPath = path.join(getProjectRoot(), "index.json");
  if (fs.existsSync(indexPath)) {
    const raw = fs.readFileSync(indexPath, "utf-8");
    return JSON.parse(raw) as StoreIndex;
  }
  return buildIndex();
}
