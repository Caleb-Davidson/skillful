// Types for the opencode-manager store

export type StoreItemType = "agent" | "command" | "skill" | "provider" | "mcp";

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
  [key: string]: unknown;
}

/** Parsed frontmatter from a command markdown file */
export interface CommandFrontmatter {
  description?: string;
  agent?: string;
  model?: string;
  subtask?: boolean;
  [key: string]: unknown;
}

/** Parsed frontmatter from a SKILL.md file */
export interface SkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
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

/** Represents an item's install state */
export interface InstalledState {
  /** Whether this item is currently installed in the global config */
  installed: boolean;
  /** Where it's installed: 'json' means opencode.json config, 'file' means markdown file */
  installedVia?: "json" | "file";
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
}
