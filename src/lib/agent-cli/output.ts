// Envelope construction, exit-code mapping, stdout emission, and the projection
// functions that map internal types to the stable agent contract shapes.

import type { InstalledState, PerTargetState, StoreItemWithState, StoreSource } from "../types.js";
import type { Envelope, ErrorCode } from "./types.js";

/**
 * Exit code for each error code, per the spec table.
 *   usage/validation        → 1
 *   not found               → 2
 *   operation failed        → 3
 * Success is 0 (not represented here).
 */
export const EXIT_CODES: Record<ErrorCode, number> = {
  USAGE: 1,
  MISSING_SCOPE: 1,
  INVALID_SCOPE: 1,
  MISSING_TARGET: 1,
  INVALID_TARGET: 1,
  NOT_A_PROJECT: 1,
  SOURCE_NOT_FOUND: 2,
  ITEM_NOT_FOUND: 2,
  NOT_ELIGIBLE: 3,
  OPERATION_FAILED: 3,
  PARTIAL_FAILURE: 3,
  UNKNOWN_COMMAND: 1,
};

/** Build a success envelope. `warnings` are included only when non-empty. */
export function buildOk(command: string, data: unknown, warnings?: string[]): Envelope {
  const envelope: Envelope = {
    schemaVersion: "1",
    ok: true,
    command,
    data,
    error: null,
  };
  if (warnings && warnings.length > 0) {
    envelope.warnings = warnings;
  }
  return envelope;
}

/** Build an error envelope. `data` is omitted; `error` carries the detail. */
export function buildError(command: string, code: ErrorCode, message: string, details?: unknown): Envelope {
  return {
    schemaVersion: "1",
    ok: false,
    command,
    error: details === undefined ? { code, message } : { code, message, details },
  };
}

/** Print the envelope as a single pretty-printed JSON object to stdout. */
export function emit(envelope: Envelope): void {
  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
}

/** Flattened per-target entry in the projected item state. */
interface ProjectedPerTarget {
  targetId: string;
  eligible: boolean;
  installed: boolean;
  mismatch: boolean;
  installedVia?: string;
}

function projectPerTarget(entry: PerTargetState): ProjectedPerTarget {
  const projected: ProjectedPerTarget = {
    targetId: entry.targetId,
    eligible: entry.eligible,
    installed: Boolean(entry.state.installed),
    mismatch: Boolean(entry.state.mismatch),
  };
  if (entry.state.installedVia !== undefined) {
    projected.installedVia = entry.state.installedVia;
  }
  return projected;
}

function projectState(state: InstalledState): object {
  return {
    status: state.status ?? null,
    installed: Boolean(state.installed),
    supportMode: state.supportMode ?? null,
    supportReason: state.supportReason ?? null,
    mismatch: Boolean(state.mismatch),
    eligibleTargets: state.eligibleTargets ?? [],
    installedTargets: state.installedTargets ?? [],
    perTarget: (state.perTarget ?? []).map(projectPerTarget),
  };
}

/**
 * Project a store item + state to the documented item shape. `perTarget` is
 * flattened (the internal type nests a full `InstalledState` per target).
 */
export function projectItem(item: StoreItemWithState): object {
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    description: item.description,
    tags: item.tags,
    source: { id: item.sourceId ?? null, label: item.sourceLabel ?? null },
    storeHash: item.storeHash ?? null,
    targetIds: item.targetIds ?? null,
    state: projectState(item.state),
  };
}

/** Project a source to the documented shape, dropping internal head-tracking fields. */
export function projectSource(source: StoreSource): object {
  return {
    id: source.id,
    name: source.name,
    url: source.url,
    branch: source.branch ?? null,
    enabled: source.enabled,
    priority: source.priority,
    lastIndexedAt: source.lastIndexedAt ?? null,
    lastError: source.lastError ?? null,
  };
}
