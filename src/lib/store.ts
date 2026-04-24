/**
 * Scans one or more store/ directories and builds an index of available items.
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { parse as parseJsonc } from "jsonc-parser";
import { hashCanonicalJson, hashNormalizedText } from "./hash.js";
import type {
  StoreIndex,
  StoreItemMeta,
  StoreItemType,
  TargetId,
  AgentFrontmatter,
  CommandFrontmatter,
  SkillFrontmatter,
  ProviderStoreFile,
  McpStoreFile,
  StoreSource,
} from "./types.js";

export interface ScanSourceMeta {
  id: string;
  name: string;
  root: string;
}

const VALID_TARGET_IDS: readonly TargetId[] = ["opencode", "claude-code", "codex-cli", "codex-app"];

function parseTargetIds(raw: unknown): TargetId[] | undefined {
  if (raw === undefined || raw === null) return undefined;

  const values = Array.isArray(raw) ? raw : [raw];
  const parsed = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value): value is TargetId => VALID_TARGET_IDS.includes(value as TargetId));

  if (parsed.length === 0) return undefined;
  return [...new Set(parsed)];
}

function withTargetTags(tags: string[], targetIds?: TargetId[]): string[] {
  if (!targetIds || targetIds.length === 0) return tags;
  return [...tags, ...targetIds.map((targetId) => `target:${targetId}`)];
}

function attachSource(item: StoreItemMeta, source?: ScanSourceMeta): StoreItemMeta {
  if (!source) return item;
  return {
    ...item,
    sourceId: source.id,
    sourceLabel: source.name,
    sourceRoot: source.root,
  };
}

function scanAgents(storePath: string, source?: ScanSourceMeta): StoreItemMeta[] {
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
    const targetIds = parseTargetIds(data.targets);
    results.push(
      attachSource(
        {
          id,
          type: "agent" as StoreItemType,
          name: id,
          description: data.description ?? `Agent: ${id}`,
          tags: withTargetTags([data.mode ?? "subagent", ...(data.model ? [data.model.split("/")[0]] : [])], targetIds),
          path: `agents/${file}`,
          storeHash: hashNormalizedText(raw),
          targetIds,
        },
        source
      )
    );
  }
  return results;
}

function scanCommands(storePath: string, source?: ScanSourceMeta): StoreItemMeta[] {
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
    const targetIds = parseTargetIds(data.targets);
    results.push(
      attachSource(
        {
          id,
          type: "command" as StoreItemType,
          name: id,
          description: data.description ?? `Command: /${id}`,
          tags: withTargetTags([...(data.agent ? [`agent:${data.agent}`] : [])], targetIds),
          path: `commands/${file}`,
          storeHash: hashNormalizedText(raw),
          targetIds,
        },
        source
      )
    );
  }
  return results;
}

function scanSkills(storePath: string, source?: ScanSourceMeta): StoreItemMeta[] {
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

    const targetIds = parseTargetIds(data.targets);

    results.push(
      attachSource(
        {
          id: data.name,
          type: "skill" as StoreItemType,
          name: data.name,
          description: data.description,
          tags: withTargetTags(
            [
              ...(data.license ? [`license:${data.license}`] : []),
              ...(data.compatibility ? [data.compatibility] : []),
              ...(data.metadata ? Object.entries(data.metadata).map(([k, v]) => `${k}:${v}`) : []),
            ],
            targetIds
          ),
          path: `skills/${entry.name}/SKILL.md`,
          storeHash: hashNormalizedText(raw),
          targetIds,
        },
        source
      )
    );
  }
  return results;
}

function scanProviders(storePath: string, source?: ScanSourceMeta): StoreItemMeta[] {
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
      const { _meta: _, ...payload } = data;
      results.push(
        attachSource(
          {
            id,
            type: "provider" as StoreItemType,
            name: id,
            description: meta.description,
            tags: meta.tags ?? [],
            path: `providers/${file}`,
            storeHash: hashCanonicalJson(payload),
          },
          source
        )
      );
    } catch {
      // Skip malformed JSON
    }
  }
  return results;
}

function scanMcps(storePath: string, source?: ScanSourceMeta): StoreItemMeta[] {
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
      const { _meta: _, ...payload } = data;
      results.push(
        attachSource(
          {
            id,
            type: "mcp" as StoreItemType,
            name: id,
            description: meta.description,
            tags: meta.tags ?? [],
            path: `mcps/${file}`,
            storeHash: hashCanonicalJson(payload),
          },
          source
        )
      );
    } catch {
      // Skip malformed JSON
    }
  }
  return results;
}

export function buildIndexFromStorePath(storePath: string, source?: ScanSourceMeta): StoreIndex {
  const items: StoreItemMeta[] = [
    ...scanAgents(storePath, source),
    ...scanCommands(storePath, source),
    ...scanSkills(storePath, source),
    ...scanProviders(storePath, source),
    ...scanMcps(storePath, source),
  ];
  return { version: 3, items };
}

export function resolveStoreItemPath(item: StoreItemMeta): string {
  if (!item.sourceRoot) {
    throw new Error(`Store item '${item.type}:${item.id}' has no source root metadata.`);
  }
  return path.join(item.sourceRoot, "store", item.path);
}

export function mergeIndexesBySourcePriority(sources: Array<{ source: StoreSource; index: StoreIndex }>): StoreIndex {
  const winners = new Map<string, StoreItemMeta>();

  for (const entry of [...sources].sort((a, b) => a.source.priority - b.source.priority)) {
    for (const item of entry.index.items) {
      const key = `${item.type}:${item.id}`;
      if (winners.has(key)) continue;
      winners.set(key, {
        ...item,
        sourceId: item.sourceId ?? entry.source.id,
        sourceLabel: item.sourceLabel ?? entry.source.name,
        sourceRoot: item.sourceRoot,
      });
    }
  }

  return {
    version: 3,
    items: [...winners.values()],
  };
}
