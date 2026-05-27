// Types for the skillful store

export type StoreItemType = "agent" | "command" | "skill" | "provider" | "mcp" | "config";

export type TargetId = "opencode" | "claude-code" | "codex";
export type SupportMode = "yes" | "partial" | "no";

/** Whether the manager is operating at global or project level */
export type ConfigMode = "global" | "project";

/**
 * Detected project context when running inside a project directory.
 * When mode is "global", projectDir and projectName are undefined.
 */
export interface ProjectContext {
  mode: ConfigMode;
  /** Absolute path to the project root (contains .git or .opencode) */
  projectDir?: string;
  /** Human-readable project name (from git or directory name) */
  projectName?: string;
}

export interface StoreItemMeta {
  /** Unique identifier (filename without extension, or skill folder name) */
  id: string;
  /** Type of item */
  type: StoreItemType;
  /** Human-readable name */
  name: string;
  /** Description of what this item does */
  description: string;
  /** Tags for filtering */
  tags: string[];
  /** Relative path within the store */
  path: string;
  /** Source identifier this item came from */
  sourceId?: string;
  /** Human-readable source label */
  sourceLabel?: string;
  /** Absolute path to the source repository root */
  sourceRoot?: string;
  /** Build-time hash of normalized store content */
  storeHash?: string;
  /** Optional target allow-list; if set, item is only shown for these targets */
  targetIds?: TargetId[];
}

export interface StoreIndex {
  version: number;
  items: StoreItemMeta[];
}

/** Parsed frontmatter from an agent markdown file */
export interface AgentFrontmatter {
  description?: string;
  mode?: "primary" | "subagent" | "all";
  model?: string;
  temperature?: number;
  steps?: number;
  hidden?: boolean;
  color?: string;
  tools?: Record<string, boolean>;
  permission?: Record<string, unknown>;
  top_p?: number;
  disable?: boolean;
  targets?: TargetId | TargetId[];
  [key: string]: unknown;
}

/** Parsed frontmatter from a command markdown file */
export interface CommandFrontmatter {
  description?: string;
  agent?: string;
  model?: string;
  subtask?: boolean;
  targets?: TargetId | TargetId[];
  [key: string]: unknown;
}

/** Parsed frontmatter from a SKILL.md file */
export interface SkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  targets?: TargetId | TargetId[];
}

/**
 * Wrapper for a provider JSON file in the store.
 * The file contains the provider config value (what goes under provider.<id>),
 * plus a _meta block for store display purposes.
 */
export interface ProviderStoreFile {
  _meta: {
    description: string;
    tags?: string[];
  };
  /** The actual provider config block (everything except _meta) */
  [key: string]: unknown;
}

/**
 * Wrapper for an MCP JSON file in the store.
 * The file contains the MCP server config value (what goes under mcp.<id>),
 * plus a _meta block for store display purposes.
 */
export interface McpStoreFile {
  _meta: {
    description: string;
    tags?: string[];
  };
  /** The actual MCP config block (everything except _meta) */
  [key: string]: unknown;
}

/**
 * Rollup status across one or more configured targets.
 * In single-target mode the values collapse to: installed, older-version, not-installed, unsupported.
 * "missing-in-some" only appears in multi-target mode.
 */
export type MultiInstalledStatus =
  | "installed"
  | "missing-in-some"
  | "older-version"
  | "not-installed"
  | "unsupported";

/** Per-target view used by the multi-target rollup. */
export interface PerTargetState {
  targetId: TargetId;
  /** True when the target supports installing this item (visibility + capability). */
  eligible: boolean;
  /** Raw per-target install state (only meaningful when eligible). */
  state: InstalledState;
}

/** Represents an item's install state */
export interface InstalledState {
  /** Whether this item is installed in the active scope (project if in project mode, global otherwise) */
  installed: boolean;
  /** Where it's installed: 'json' means opencode.json config, 'file' means markdown/skill file */
  installedVia?: "json" | "file";
  /** Whether this item is installed globally (only set when in project mode) */
  globalInstalled?: boolean;
  /** Whether the active target supports this category */
  supported?: boolean;
  /** Support level for the active target/category */
  supportMode?: SupportMode;
  /** Optional explanation for partial/unsupported behavior */
  supportReason?: string;
  /** Whether installed content differs from the store item */
  mismatch?: boolean;
  /** Whether mismatch detection has completed */
  mismatchChecked?: boolean;
  /** Multi-target rollup status. Always populated when produced by buildStoreViewForTargets. */
  status?: MultiInstalledStatus;
  /** Per-target breakdown. Populated for multi-target views only. */
  perTarget?: PerTargetState[];
  /** Configured targets that support this item (subset of view targetIds). */
  eligibleTargets?: TargetId[];
  /** Configured targets that report this item as installed. Subset of eligibleTargets. */
  installedTargets?: TargetId[];
}

/** A store item combined with its installed state */
export interface StoreItemWithState extends StoreItemMeta {
  state: InstalledState;
}

/** The resolved view for the TUI */
export interface StoreView {
  agents: StoreItemWithState[];
  commands: StoreItemWithState[];
  skills: StoreItemWithState[];
  providers: StoreItemWithState[];
  mcps: StoreItemWithState[];
  /** Built-in or target-specific configuration utilities (e.g. CLAUDE.md redirect) */
  configs: StoreItemWithState[];
  /** The active project/global context */
  context: ProjectContext;
  /**
   * Active target adapter.
   * Kept for back-compat; mirrors targetIds[0]. Prefer `targetIds`.
   */
  targetId?: TargetId;
  /**
   * Active target adapters in priority order (1+ entries).
   * length > 1 indicates multi-target mode (driven by skillful.targets.json).
   */
  targetIds?: TargetId[];
}

// ── Multi-view app types ──

/** Top-level views in the TUI */
export type AppView = "manage" | "projects" | "settings";

/** A registered project in the project registry */
export interface ProjectEntry {
  /** Absolute path to the project root */
  path: string;
  /** Human-readable name (from git or directory) */
  name: string;
  /** Per-project default target override (null = use global default) */
  defaultTarget?: TargetId;
  /** When the project was registered */
  addedAt: string;
}

/** The project registry stored in ~/.config/skillful/projects.json */
export interface ProjectRegistry {
  projects: ProjectEntry[];
}

/** User settings stored in ~/.config/skillful/settings.json */
export interface UserSettings {
  /** Default target adapter to use when --target is not specified */
  defaultTarget?: TargetId;
  /** Which view to open on startup: manage, projects, or auto (detect from cwd) */
  defaultView?: AppView | "auto";
}

/** Configured external content source (git repository). */
export interface StoreSource {
  /** Stable identifier used for cache paths and item source IDs. */
  id: string;
  /** Human-readable label for display in the UI. */
  name: string;
  /** Git repository URL (https or ssh). */
  url: string;
  /** Branch to track. Defaults to remote HEAD if omitted. */
  branch?: string;
  /** Whether this source participates in merged store results. */
  enabled: boolean;
  /** 0 is highest priority, larger numbers are lower priority. */
  priority: number;
  /** Last successful remote check timestamp (ISO string). */
  lastCheckedAt?: string;
  /** Last observed remote head commit. */
  lastKnownRemoteHead?: string;
  /** Local fetched/checked-out head commit in cache. */
  lastFetchedHead?: string;
  /** Commit hash the cached source index was built from. */
  indexedHead?: string;
  /** Last index build timestamp (ISO string). */
  lastIndexedAt?: string;
  /** Last check/fetch error message, if any. */
  lastError?: string;
}

/** Source registry stored in ~/.config/skillful/sources.json. */
export interface SourceRegistry {
  sources: StoreSource[];
}

/** Source check status used in UI messaging. */
export interface SourceUpdateStatus {
  sourceId: string;
  sourceName: string;
  hasUpdate: boolean;
  remoteHead?: string;
  localHead?: string;
  error?: string;
}
