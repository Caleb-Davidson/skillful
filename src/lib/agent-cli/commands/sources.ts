// Source command family for the Agent CLI.
//
// Each command is a thin handler over the existing source registry / source-sync
// library functions. No new domain logic: resolve args, call a lib function,
// and project the result to the stable envelope `data` shape. Sources are a
// single global registry, so there is no `--scope` or `--target` here.

import {
  addSource,
  createSourceId,
  listSources,
  removeSource,
  reorderSource,
  updateSource,
} from "../../sources.js";
import {
  checkEnabledSourcesForUpdates,
  checkSourceForUpdatesById,
  ensureSourceIndexed,
  fetchSourceById,
} from "../../source-sync.js";
import type { SourceUpdateStatus, StoreSource } from "../../types.js";
import { projectSource } from "../output.js";
import { CliError } from "../types.js";
import type { CommandContext, CommandDef, CommandResult } from "../types.js";

/** Read the first positional as a required source id, else a USAGE error. */
function requireId(ctx: CommandContext, usage: string): string {
  const id = ctx.positionals[0];
  if (!id || id.trim().length === 0) {
    throw new CliError("USAGE", usage);
  }
  return id;
}

/** Look up a source by id from the registry, or null if absent. */
function findSource(id: string): StoreSource | undefined {
  return listSources(true).find((source) => source.id === id);
}

/** Project a source-update status to the stable shape (drops nothing; renamed-safe). */
function projectUpdate(status: SourceUpdateStatus): object {
  return {
    sourceId: status.sourceId,
    sourceName: status.sourceName,
    hasUpdate: status.hasUpdate,
    remoteHead: status.remoteHead ?? null,
    localHead: status.localHead ?? null,
    error: status.error ?? null,
  };
}

const listSourcesCommand: CommandDef = {
  verb: "list",
  noun: "sources",
  summary: "List all configured sources (including disabled).",
  run(): CommandResult {
    const sources = listSources(true);
    return { data: { count: sources.length, sources: sources.map(projectSource) } };
  },
};

const addSourceCommand: CommandDef = {
  verb: "add",
  noun: "source",
  summary: "Add a source by URL, then clone + index it.",
  async run(ctx): Promise<CommandResult> {
    const url = ctx.positionals[0];
    if (!url || url.trim().length === 0) {
      throw new CliError("USAGE", "add source requires a <url>: `add source <url> [--id] [--name] [--branch]`.");
    }

    const name = ctx.flags.getOne("name");
    const explicitId = ctx.flags.getOne("id");
    const branch = ctx.flags.getOne("branch");
    const id = explicitId && explicitId.length > 0 ? explicitId : createSourceId(name ?? url);

    const entry: Omit<StoreSource, "priority"> = {
      id,
      name: name ?? id,
      url,
      enabled: true,
    };
    if (branch && branch.length > 0) {
      entry.branch = branch;
    }

    const { added, source } = addSource(entry);

    // Idempotent: an existing id is a no-op success, no clone/index.
    if (!added) {
      return { data: { source: projectSource(source), changed: false } };
    }

    // New entry: clone + index so items are immediately listable. The lib stores
    // any clone/index failure in `lastError` rather than throwing, so persist the
    // refreshed source either way and surface a warning when it failed.
    const refreshed = await ensureSourceIndexed(source);
    updateSource(refreshed.id, () => refreshed);

    const warnings: string[] = [];
    if (refreshed.lastError) {
      warnings.push(
        `Source '${refreshed.id}' was registered but could not be indexed: ${refreshed.lastError}`,
      );
    }

    const result: CommandResult = { data: { source: projectSource(refreshed), changed: true } };
    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    return result;
  },
};

const removeSourceCommand: CommandDef = {
  verb: "remove",
  noun: "source",
  summary: "Remove a source from the registry by id.",
  run(ctx): CommandResult {
    const id = requireId(ctx, "remove source requires an <id>: `remove source <id>`.");
    const changed = removeSource(id);
    if (!changed) {
      throw new CliError("SOURCE_NOT_FOUND", `No source with id '${id}'.`, { id });
    }
    return { data: { id, changed: true } };
  },
};

const enableSourceCommand: CommandDef = {
  verb: "enable",
  noun: "source",
  summary: "Enable a source by id.",
  run(ctx): CommandResult {
    const id = requireId(ctx, "enable source requires an <id>: `enable source <id>`.");
    let wasEnabled = false;
    const updated = updateSource(id, (source) => {
      wasEnabled = source.enabled;
      return { ...source, enabled: true };
    });
    if (!updated) {
      throw new CliError("SOURCE_NOT_FOUND", `No source with id '${id}'.`, { id });
    }
    return { data: { source: projectSource(updated), changed: !wasEnabled } };
  },
};

const disableSourceCommand: CommandDef = {
  verb: "disable",
  noun: "source",
  summary: "Disable a source by id.",
  run(ctx): CommandResult {
    const id = requireId(ctx, "disable source requires an <id>: `disable source <id>`.");
    let wasEnabled = false;
    const updated = updateSource(id, (source) => {
      wasEnabled = source.enabled;
      return { ...source, enabled: false };
    });
    if (!updated) {
      throw new CliError("SOURCE_NOT_FOUND", `No source with id '${id}'.`, { id });
    }
    return { data: { source: projectSource(updated), changed: wasEnabled } };
  },
};

const reorderSourceCommand: CommandDef = {
  verb: "reorder",
  noun: "source",
  summary: "Move a source up or down in priority.",
  run(ctx): CommandResult {
    const id = requireId(ctx, "reorder source requires an <id>: `reorder source <id> --direction up|down`.");
    const direction = ctx.flags.getOne("direction");
    if (direction !== "up" && direction !== "down") {
      throw new CliError(
        "USAGE",
        "reorder source requires `--direction up|down`.",
        { direction: direction ?? null },
      );
    }

    // reorderSource returns false for both "not found" and "already at boundary";
    // verify existence first so a real not-found surfaces as SOURCE_NOT_FOUND.
    if (!findSource(id)) {
      throw new CliError("SOURCE_NOT_FOUND", `No source with id '${id}'.`, { id });
    }

    const changed = reorderSource(id, direction);
    const source = findSource(id);
    // Source exists (checked above) so this is defined; the cast keeps types honest.
    return { data: { source: projectSource(source as StoreSource), direction, changed } };
  },
};

const updateSourceCommand: CommandDef = {
  verb: "update",
  noun: "source",
  summary: "Git fetch + reindex a single source by id.",
  async run(ctx): Promise<CommandResult> {
    const id = requireId(ctx, "update source requires an <id>: `update source <id>`.");

    // Distinguish a real not-found from a fetch failure: fetchSourceById returns
    // null only when the id is unknown.
    if (!findSource(id)) {
      throw new CliError("SOURCE_NOT_FOUND", `No source with id '${id}'.`, { id });
    }

    const updated = await fetchSourceById(id);
    if (!updated) {
      // Race: removed between the existence check and the fetch.
      throw new CliError("SOURCE_NOT_FOUND", `No source with id '${id}'.`, { id });
    }

    const warnings: string[] = [];
    if (updated.lastError) {
      warnings.push(`Source '${updated.id}' could not be updated: ${updated.lastError}`);
    }

    const result: CommandResult = {
      data: { source: projectSource(updated), changed: !updated.lastError },
    };
    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    return result;
  },
};

const checkSourcesCommand: CommandDef = {
  verb: "check",
  noun: "sources",
  summary: "Read-only remote update check for all enabled sources.",
  async run(): Promise<CommandResult> {
    const statuses = await checkEnabledSourcesForUpdates();
    return { data: { count: statuses.length, updates: statuses.map(projectUpdate) } };
  },
};

const checkSourceCommand: CommandDef = {
  verb: "check",
  noun: "source",
  summary: "Read-only remote update check for a single source by id.",
  async run(ctx): Promise<CommandResult> {
    const id = requireId(ctx, "check source requires an <id>: `check source <id>`.");
    const status = await checkSourceForUpdatesById(id);
    if (!status) {
      throw new CliError("SOURCE_NOT_FOUND", `No source with id '${id}'.`, { id });
    }
    return { data: { update: projectUpdate(status) } };
  },
};

export const sourceCommands: CommandDef[] = [
  listSourcesCommand,
  addSourceCommand,
  removeSourceCommand,
  enableSourceCommand,
  disableSourceCommand,
  reorderSourceCommand,
  updateSourceCommand,
  checkSourcesCommand,
  checkSourceCommand,
];
