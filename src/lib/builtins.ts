/**
 * Built-in store items contributed by skillful itself (not scanned from sources).
 *
 * Built-ins are merged into the store index at load time and flow through the
 * same target-visibility pipeline as file-backed items. They are identified by
 * `sourceId: "builtin"` and should declare `targetIds` to opt in to specific
 * target adapters. The corresponding adapter is responsible for the actual
 * install/uninstall side effect (built-ins have no on-disk store payload).
 */
import { hashNormalizedText } from "./hash.js";
import type { StoreItemMeta } from "./types.js";

/** Sentinel sourceId for built-in items (used by adapters to detect them). */
export const BUILTIN_SOURCE_ID = "builtin";

/** Item id for the CLAUDE.md → AGENTS.md redirect built-in. */
export const CLAUDE_MD_REDIRECT_ID = "claude-md-redirect";

/** Exact content the CLAUDE.md redirect writes. */
export const CLAUDE_MD_REDIRECT_CONTENT = "@AGENTS.md\n";

/**
 * Built-in store items contributed by skillful. Per-target visibility is
 * handled through each item's `targetIds` allow-list.
 */
export function getBuiltinStoreItems(): StoreItemMeta[] {
  return [
    {
      id: CLAUDE_MD_REDIRECT_ID,
      type: "config",
      name: "CLAUDE.md Redirect",
      description:
        "Creates a CLAUDE.md in the project root that imports AGENTS.md (content: '@AGENTS.md'). Useful when AGENTS.md is the canonical instruction file.",
      tags: ["claude-code", "redirect", "agents-md", "project"],
      path: `builtin/configs/${CLAUDE_MD_REDIRECT_ID}`,
      sourceId: BUILTIN_SOURCE_ID,
      sourceLabel: "Built-in",
      sourceRoot: "",
      storeHash: hashNormalizedText(CLAUDE_MD_REDIRECT_CONTENT),
      targetIds: ["claude-code"],
    },
  ];
}
