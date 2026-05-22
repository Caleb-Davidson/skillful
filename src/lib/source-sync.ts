import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getBuiltinStoreItems } from "./builtins.js";
import { buildIndexFromStorePath, mergeIndexesBySourcePriority } from "./store.js";
import {
  ensureSourceDirectories,
  getSourceCacheDir,
  getSourceIndexPath,
  getSourceRepoDir,
  loadSourceRegistry,
  saveSourceRegistry,
} from "./sources.js";
import type { SourceUpdateStatus, StoreIndex, StoreSource } from "./types.js";

const execFileAsync = promisify(execFile);

async function runGit(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

async function cloneSource(source: StoreSource, repoDir: string): Promise<void> {
  const cloneArgs = ["clone", "--depth", "1"];
  if (source.branch) {
    cloneArgs.push("--branch", source.branch);
  }
  cloneArgs.push(source.url, repoDir);
  await runGit(cloneArgs);
}

async function ensureRepository(source: StoreSource): Promise<void> {
  ensureSourceDirectories();
  const cacheDir = getSourceCacheDir(source.id);
  const repoDir = getSourceRepoDir(source.id);
  fs.mkdirSync(cacheDir, { recursive: true });

  if (!fs.existsSync(repoDir)) {
    await cloneSource(source, repoDir);
    return;
  }

  try {
    const remoteUrl = await runGit(["remote", "get-url", "origin"], repoDir);
    if (remoteUrl !== source.url) {
      fs.rmSync(repoDir, { recursive: true, force: true });
      await cloneSource(source, repoDir);
    }
  } catch {
    fs.rmSync(repoDir, { recursive: true, force: true });
    await cloneSource(source, repoDir);
  }
}

async function getLocalHead(repoDir: string): Promise<string | undefined> {
  try {
    const head = await runGit(["rev-parse", "HEAD"], repoDir);
    return head || undefined;
  } catch {
    return undefined;
  }
}

async function resolveTrackedBranch(source: StoreSource, repoDir: string): Promise<string> {
  if (source.branch) return source.branch;

  try {
    const remoteHead = await runGit(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], repoDir);
    if (remoteHead.startsWith("origin/")) {
      return remoteHead.slice("origin/".length);
    }
    if (remoteHead.length > 0) {
      return remoteHead;
    }
  } catch {
    // Fallback below.
  }

  try {
    const localBranch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoDir);
    if (localBranch.length > 0 && localBranch !== "HEAD") {
      return localBranch;
    }
  } catch {
    // Fallback below.
  }

  return "main";
}

async function getRemoteHead(source: StoreSource, branchHint?: string): Promise<{ branch?: string; head?: string }> {
  const branch = branchHint ?? source.branch;

  if (branch) {
    const output = await runGit(["ls-remote", "--heads", source.url, `refs/heads/${branch}`]);
    const line = output.split("\n").find((candidate) => candidate.trim().length > 0);
    if (!line) return { branch };
    const head = line.split(/\s+/)[0];
    return { branch, head };
  }

  const symrefOutput = await runGit(["ls-remote", "--symref", source.url, "HEAD"]);
  const lines = symrefOutput.split("\n").map((line) => line.trim()).filter(Boolean);
  const refLine = lines.find((line) => line.startsWith("ref:"));
  const shaLine = lines.find((line) => !line.startsWith("ref:") && line.endsWith("HEAD"));

  const resolvedBranchMatch = refLine?.match(/^ref:\s+refs\/heads\/([^\s]+)\s+HEAD$/);
  const resolvedBranch = resolvedBranchMatch?.[1];
  const resolvedHead = shaLine ? shaLine.split(/\s+/)[0] : undefined;

  return { branch: resolvedBranch, head: resolvedHead };
}

async function fetchBranch(repoDir: string, branch: string): Promise<string> {
  await runGit(["fetch", "--depth", "1", "origin", branch], repoDir);
  await runGit(["checkout", "--force", "-B", branch, "FETCH_HEAD"], repoDir);
  const head = await runGit(["rev-parse", "HEAD"], repoDir);
  return head;
}

function readSourceIndex(sourceId: string): StoreIndex | null {
  const indexPath = getSourceIndexPath(sourceId);
  if (!fs.existsSync(indexPath)) return null;

  try {
    const raw = fs.readFileSync(indexPath, "utf-8");
    const parsed = JSON.parse(raw) as StoreIndex;
    if (!Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSourceIndex(sourceId: string, index: StoreIndex): void {
  const indexPath = getSourceIndexPath(sourceId);
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n", "utf-8");
}

function reindexSource(source: StoreSource): StoreSource {
  const repoDir = getSourceRepoDir(source.id);
  const storeDir = path.join(repoDir, "store");
  if (!fs.existsSync(storeDir)) {
    throw new Error(`Source '${source.id}' does not contain a store/ directory.`);
  }

  const index = buildIndexFromStorePath(storeDir, {
    id: source.id,
    name: source.name,
    root: repoDir,
  });
  writeSourceIndex(source.id, index);

  const now = new Date().toISOString();
  return {
    ...source,
    indexedHead: source.lastFetchedHead,
    lastIndexedAt: now,
    lastError: undefined,
  };
}

function saveSources(updatedSources: StoreSource[]): void {
  saveSourceRegistry({ sources: updatedSources });
}

export async function ensureSourceIndexed(source: StoreSource): Promise<StoreSource> {
  try {
    await ensureRepository(source);
    const repoDir = getSourceRepoDir(source.id);
    const branch = await resolveTrackedBranch(source, repoDir);
    const head = await getLocalHead(repoDir);
    const cachedIndex = readSourceIndex(source.id);
    const now = new Date().toISOString();

    let next: StoreSource = {
      ...source,
      branch,
      lastFetchedHead: head,
      lastError: undefined,
    };

    const needsReindex = !cachedIndex || !head || next.indexedHead !== head;
    if (needsReindex) {
      next = reindexSource(next);
    }

    next.lastCheckedAt = source.lastCheckedAt ?? now;
    return next;
  } catch (err) {
    return {
      ...source,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function fetchSourceAndReindex(source: StoreSource): Promise<StoreSource> {
  try {
    await ensureRepository(source);
    const repoDir = getSourceRepoDir(source.id);
    const branch = await resolveTrackedBranch(source, repoDir);
    const fetchedHead = await fetchBranch(repoDir, branch);

    let next: StoreSource = {
      ...source,
      branch,
      lastFetchedHead: fetchedHead,
      lastError: undefined,
    };

    next = reindexSource(next);
    return next;
  } catch (err) {
    return {
      ...source,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function loadMergedIndexFromConfiguredSources(): Promise<{ index: StoreIndex; sources: StoreSource[] }> {
  const registry = loadSourceRegistry();
  const enabled = registry.sources.filter((source) => source.enabled).sort((a, b) => a.priority - b.priority);
  const builtinItems = getBuiltinStoreItems();

  if (enabled.length === 0) {
    return { index: { version: 3, items: [...builtinItems] }, sources: registry.sources };
  }

  const refreshedSources: StoreSource[] = [];
  const indexEntries: Array<{ source: StoreSource; index: StoreIndex }> = [];

  for (const source of enabled) {
    const refreshed = await ensureSourceIndexed(source);
    refreshedSources.push(refreshed);
    const index = readSourceIndex(refreshed.id);
    if (index) {
      indexEntries.push({ source: refreshed, index });
    }
  }

  const mergedSources = registry.sources.map((source) => {
    const refreshed = refreshedSources.find((entry) => entry.id === source.id);
    return refreshed ?? source;
  });
  saveSources(mergedSources);

  const mergedIndex = mergeIndexesBySourcePriority(indexEntries);
  return {
    index: { ...mergedIndex, items: [...builtinItems, ...mergedIndex.items] },
    sources: mergedSources,
  };
}

export async function checkSourceForUpdate(source: StoreSource): Promise<{ source: StoreSource; status: SourceUpdateStatus }> {
  let next = { ...source };

  try {
    const remote = await getRemoteHead(source, source.branch);
    if (remote.branch) {
      next.branch = remote.branch;
    }
    next.lastKnownRemoteHead = remote.head;
    next.lastCheckedAt = new Date().toISOString();
    next.lastError = undefined;

    const localHead = source.indexedHead ?? source.lastFetchedHead;
    const hasUpdate = Boolean(remote.head && localHead && remote.head !== localHead);

    return {
      source: next,
      status: {
        sourceId: source.id,
        sourceName: source.name,
        hasUpdate,
        remoteHead: remote.head,
        localHead,
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    next = {
      ...next,
      lastCheckedAt: new Date().toISOString(),
      lastError: error,
    };
    return {
      source: next,
      status: {
        sourceId: source.id,
        sourceName: source.name,
        hasUpdate: false,
        localHead: source.indexedHead ?? source.lastFetchedHead,
        error,
      },
    };
  }
}

export async function checkEnabledSourcesForUpdates(): Promise<SourceUpdateStatus[]> {
  const registry = loadSourceRegistry();
  const enabled = registry.sources.filter((source) => source.enabled).sort((a, b) => a.priority - b.priority);
  if (enabled.length === 0) return [];

  const results: Array<{ source: StoreSource; status: SourceUpdateStatus }> = [];
  for (const source of enabled) {
    results.push(await checkSourceForUpdate(source));
  }

  const mergedSources = registry.sources.map((source) => {
    const updated = results.find((result) => result.source.id === source.id);
    return updated ? updated.source : source;
  });
  saveSources(mergedSources);

  return results.map((result) => result.status);
}

export async function checkSourceForUpdatesById(sourceId: string): Promise<SourceUpdateStatus | null> {
  const registry = loadSourceRegistry();
  const source = registry.sources.find((entry) => entry.id === sourceId);
  if (!source) return null;

  const result = await checkSourceForUpdate(source);
  const mergedSources = registry.sources.map((entry) => (entry.id === source.id ? result.source : entry));
  saveSources(mergedSources);
  return result.status;
}

export async function fetchSourceById(sourceId: string): Promise<StoreSource | null> {
  const registry = loadSourceRegistry();
  const source = registry.sources.find((entry) => entry.id === sourceId);
  if (!source) return null;

  const updated = await fetchSourceAndReindex(source);
  const mergedSources = registry.sources.map((entry) => (entry.id === source.id ? updated : entry));
  saveSources(mergedSources);
  return updated;
}
