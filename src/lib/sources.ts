import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SourceRegistry, StoreSource } from "./types.js";

const CONFIG_DIR = path.join(os.homedir(), ".config", "skillful");
const SOURCES_PATH = path.join(CONFIG_DIR, "sources.json");
const CACHE_BASE = path.join(os.homedir(), ".cache", "skillful", "sources");

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function normalizeRegistry(registry: SourceRegistry): SourceRegistry {
  const sorted = [...registry.sources].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.id.localeCompare(b.id);
  });

  const normalized = sorted.map((source, index) => ({
    ...source,
    enabled: source.enabled !== false,
    priority: index,
  }));

  return { sources: normalized };
}

export function getSourceRegistryPath(): string {
  return SOURCES_PATH;
}

export function getSourceCacheBaseDir(): string {
  return CACHE_BASE;
}

export function getSourceCacheDir(sourceId: string): string {
  return path.join(getSourceCacheBaseDir(), sourceId);
}

export function getSourceRepoDir(sourceId: string): string {
  return path.join(getSourceCacheDir(sourceId), "repo");
}

export function getSourceIndexPath(sourceId: string): string {
  return path.join(getSourceCacheDir(sourceId), "index.json");
}

export function ensureSourceDirectories(): void {
  ensureDir(CONFIG_DIR);
  ensureDir(CACHE_BASE);
}

export function loadSourceRegistry(): SourceRegistry {
  if (!fs.existsSync(SOURCES_PATH)) {
    return { sources: [] };
  }

  try {
    const raw = fs.readFileSync(SOURCES_PATH, "utf-8");
    const parsed = JSON.parse(raw) as SourceRegistry;
    if (!parsed || !Array.isArray(parsed.sources)) {
      return { sources: [] };
    }

    return normalizeRegistry({
      sources: parsed.sources.filter((source): source is StoreSource => {
        return Boolean(source && typeof source.id === "string" && typeof source.url === "string");
      }),
    });
  } catch {
    return { sources: [] };
  }
}

export function saveSourceRegistry(registry: SourceRegistry): void {
  ensureSourceDirectories();
  const normalized = normalizeRegistry(registry);
  fs.writeFileSync(SOURCES_PATH, JSON.stringify(normalized, null, 2) + "\n", "utf-8");
}

export function listSources(includeDisabled = true): StoreSource[] {
  const registry = loadSourceRegistry();
  return registry.sources.filter((source) => includeDisabled || source.enabled);
}

export function updateSource(sourceId: string, updater: (source: StoreSource) => StoreSource): StoreSource | null {
  const registry = loadSourceRegistry();
  const idx = registry.sources.findIndex((source) => source.id === sourceId);
  if (idx === -1) return null;

  registry.sources[idx] = updater(registry.sources[idx]);
  saveSourceRegistry(registry);
  return loadSourceRegistry().sources.find((source) => source.id === sourceId) ?? null;
}

export function reorderSource(sourceId: string, direction: "up" | "down"): boolean {
  const registry = loadSourceRegistry();
  const sources = [...registry.sources].sort((a, b) => a.priority - b.priority);
  const idx = sources.findIndex((source) => source.id === sourceId);
  if (idx === -1) return false;

  if (direction === "up" && idx > 0) {
    [sources[idx - 1], sources[idx]] = [sources[idx], sources[idx - 1]];
  } else if (direction === "down" && idx < sources.length - 1) {
    [sources[idx + 1], sources[idx]] = [sources[idx], sources[idx + 1]];
  } else {
    return false;
  }

  const reweighted = sources.map((source, index) => ({ ...source, priority: index }));
  saveSourceRegistry({ sources: reweighted });
  return true;
}

export function toggleSourceEnabled(sourceId: string): StoreSource | null {
  return updateSource(sourceId, (source) => ({ ...source, enabled: !source.enabled }));
}

export function createSourceId(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized.length > 0) {
    return normalized;
  }

  return `source-${Date.now()}`;
}

export function addSource(source: Omit<StoreSource, "priority">): { added: boolean; source: StoreSource } {
  const registry = loadSourceRegistry();
  const existing = registry.sources.find((entry) => entry.id === source.id);
  if (existing) {
    return { added: false, source: existing };
  }

  const created: StoreSource = {
    ...source,
    priority: registry.sources.length,
  };

  registry.sources.push(created);
  saveSourceRegistry(registry);
  return { added: true, source: created };
}

export function removeSource(sourceId: string): boolean {
  const registry = loadSourceRegistry();
  const before = registry.sources.length;
  registry.sources = registry.sources.filter((source) => source.id !== sourceId);
  if (registry.sources.length === before) {
    return false;
  }

  saveSourceRegistry(registry);
  return true;
}
