# AGENTS.md

This document describes the architecture, codebase layout, and development patterns of `opencode-manager`. Read this to understand how the project works and how to maintain or extend it.

## Purpose

opencode-manager is a Node.js CLI tool that maintains a local "store" of OpenCode configuration items (agents, commands, skills, providers, MCP servers), detects which ones are installed, and provides a TUI to install/uninstall them.

The tool supports two modes of operation:

- **Global mode**: When run outside a project directory, it targets `~/.config/opencode/` (the global OpenCode config).
- **Project mode**: When run inside a project directory (detected by `.git` or `.opencode`), it targets the project-level config (`opencode.json` in the project root and `.opencode/` subdirectories). Global install state is shown as read-only context — adding/removing items only affects the project level.

## Multi-view TUI

The TUI has three views, switchable via Tab and keyboard shortcuts:

- **Store (manage)**: Browse and install/uninstall store items for the active project or global config. This is the original store management interface.
- **Projects**: View, add, remove, and switch between registered projects. Each project can have its own default target adapter.
- **Settings**: Configure global defaults (default target adapter, default startup view).

### Startup modes

The tool supports subcommands to specify which view to start in:

```bash
opencode-manager              # Auto-detect (uses defaultView setting)
opencode-manager manage       # Jump to store management view
opencode-manager projects     # Jump to projects view
opencode-manager settings     # Jump to settings view
```

When no subcommand is given, the `defaultView` setting controls behavior:
- `auto` (default): Opens the manage view if inside a project, projects view otherwise.
- `manage` / `projects` / `settings`: Always opens that view.

## Technology stack

- **Runtime**: Node.js 22+ (ESM modules)
- **Language**: TypeScript 6, compiled with `tsc` for production
- **TUI framework**: [Ink](https://github.com/vadimdemedes/ink) (React for the terminal)
- **Config parsing**: `jsonc-parser` for reading/writing `opencode.json` with comment preservation
- **Frontmatter parsing**: `gray-matter` for parsing YAML frontmatter from markdown files

## Project structure

```
opencode-manager/
├── bin/
│   └── cli.js              # Global CLI entry point (runs dist/ or falls back to tsx)
├── scripts/
│   └── setup.js            # Setup script (npm run setup)
├── src/
│   ├── cli.tsx              # App bootstrap — parses args, loads index, renders TUI
│   ├── build-index.ts       # Script to pre-generate index.json from store/
│   ├── lib/
│   │   ├── types.ts         # All TypeScript types and interfaces
│   │   ├── store.ts         # Store scanner — reads store/ directory, builds index
│   │   ├── project-context.ts # Detects project root from cwd
│   │   ├── target-manager.ts  # Target adapter registry with lazy loading
│   │   ├── settings.ts       # User settings persistence (~/.config/opencode-manager/settings.json)
│   │   ├── projects.ts       # Project registry persistence (~/.config/opencode-manager/projects.json)
│   │   └── targets/
│   │       ├── shared.ts      # TargetAdapter interface and stub factory
│   │       ├── opencode.ts    # OpenCode adapter (delegates to opencode-store.ts)
│   │       ├── opencode-store.ts # Core install/uninstall/detection logic for OpenCode
│   │       ├── claude-code.ts # Claude Code adapter stub
│   │       ├── codex-cli.ts   # Codex CLI adapter stub
│   │       └── codex-app.ts   # Codex App adapter stub
│   └── components/
│       ├── StoreApp.tsx     # Multi-view app shell + ManageView (store browsing)
│       ├── ProjectsView.tsx # Projects list, add/remove/switch projects
│       └── SettingsView.tsx # Settings editor (default target, default view)
├── store/                   # The store — all items available for installation
│   ├── agents/              # Agent markdown files (.md)
│   ├── commands/            # Command markdown files (.md)
│   ├── skills/              # Skill directories, each containing SKILL.md
│   ├── providers/           # Provider JSON config files (.json)
│   └── mcps/                # MCP server JSON config files (.json)
├── dist/                    # Compiled JS output (npm run build)
├── index.json               # Generated store index (npm run index)
├── package.json
└── tsconfig.json
```

## Data flow

```
store/ directory
      │
      ▼
  store.ts (scanAgents, scanCommands, scanSkills, scanProviders, scanMcps)
      │
      ▼
  StoreIndex { items: StoreItemMeta[] }
      │
      ▼
  cli.tsx — resolves target, detects project context, parses subcommand
      │     loads settings to determine default view
      ▼
  target-manager.ts (initAdapter → lazy-loads selected adapter)
      │
      ▼
  opencode-store.ts (getInstalledState) — cached config reads + dir listings
      │
      ▼
  StoreView { agents, commands, skills, providers, mcps, context }
      │
      ▼
  StoreApp.tsx — multi-view shell routes to ManageView / ProjectsView / SettingsView
```

## Key files in detail

### `src/lib/types.ts`

All shared types. The important ones:

- **`StoreItemType`**: Union of `"agent" | "command" | "skill" | "provider" | "mcp"`
- **`ConfigMode`**: `"global" | "project"` — which scope the tool is operating in
- **`ProjectContext`**: Contains `mode`, `projectDir`, and `projectName` — detected at startup
- **`StoreItemMeta`**: The index entry for a store item — `id`, `type`, `name`, `description`, `tags`, `path`
- **`InstalledState`**: Whether an item is installed, via what mechanism (`"json"` or `"file"`), and whether it's installed globally (`globalInstalled` — only set in project mode)
- **`StoreItemWithState`**: `StoreItemMeta` + `InstalledState` — what the TUI works with
- **`StoreView`**: The full TUI model — arrays of `StoreItemWithState` grouped by category, plus the `ProjectContext`
- **`AppView`**: Union of `"manage" | "projects" | "settings"` — which top-level view is active
- **`ProjectEntry`**: A registered project — path, name, optional default target, addedAt timestamp
- **`ProjectRegistry`**: The list of registered projects
- **`UserSettings`**: Global settings — defaultTarget, defaultView
- **`ProviderStoreFile` / `McpStoreFile`**: Shape of the JSON files in `store/providers/` and `store/mcps/`.

### `src/lib/store.ts`

Scans the `store/` directory and builds a `StoreIndex`. Each item type has its own scan function:

- **`scanAgents()`**: Reads `store/agents/*.md`, parses frontmatter with `gray-matter`, extracts `description` and `mode` for tags.
- **`scanCommands()`**: Reads `store/commands/*.md`, parses frontmatter, extracts `description` and `agent` for tags.
- **`scanSkills()`**: Reads `store/skills/*/SKILL.md`, parses frontmatter, extracts `name`, `description`, `license`, `compatibility`, `metadata` for tags.
- **`scanProviders()`**: Reads `store/providers/*.json`, parses with `jsonc-parser`, extracts `_meta.description` and `_meta.tags`.
- **`scanMcps()`**: Reads `store/mcps/*.json`, same pattern as providers.

`getStorePath()` walks up from the current file to find the project root (the directory containing `store/`).

`loadIndex()` returns the cached `index.json` if it exists, otherwise calls `buildIndex()` on the fly.

### `src/lib/target-manager.ts`

Registry of target adapters with **lazy loading**. Only the selected adapter is imported at startup (via dynamic `import()`), rather than eagerly importing all four.

Key exports:
- **`initAdapter(id)`**: Async — pre-loads the adapter for the given target. Must be called once at startup.
- **`resolveTargetId()`**: Parses `--target` from argv. Returns the resolved `TargetId`.
- **`buildStoreViewForTarget()`**: Maps over all store items, attaches their installed state for the active adapter.
- **`toggleItemForTarget()`**: Install or uninstall a store item via the active adapter.

### `src/lib/targets/opencode-store.ts`

Core install/uninstall/detection logic for the OpenCode target. Includes **per-session caching** of:

- Global config reads (`readGlobalConfig()`)
- Project config reads (`readProjectConfig()`)
- Global filesystem listings (agents, commands, skills directories)
- Project filesystem listings

Cache is invalidated automatically after install/uninstall operations via `invalidateCache()`.

### `src/lib/settings.ts`

User settings persistence at `~/.config/opencode-manager/settings.json`.

- **`loadSettings()`**: Returns `UserSettings` (defaultTarget, defaultView). Falls back to empty defaults.
- **`saveSettings()`**: Writes settings to disk.

### `src/lib/projects.ts`

Project registry persistence at `~/.config/opencode-manager/projects.json`.

- **`loadRegistry()` / `saveRegistry()`**: Read/write the project list.
- **`addProject(path)`**: Register a project. Auto-resolves the project name from git.
- **`removeProject(path)`**: Unregister a project.
- **`setProjectTarget(path, target)`**: Set the default target for a specific project.
- **`isValidProjectDir(path)`**: Check if a path looks like a valid project directory.

### `src/components/StoreApp.tsx`

Multi-view app shell plus the ManageView (store browsing). Key parts:

**App Shell (`StoreApp`)**:
- Routes between ManageView, ProjectsView, and SettingsView based on `appView` state.
- Handles global quit (q, Ctrl+C).
- Renders the `[Store] | Projects | Settings` tab bar at the top.
- `handleSwitchToProject()` builds a new StoreView for the selected project and switches to the ManageView.

**ManageView** (previously the entire StoreApp):
- **State**: `categoryIndex`, `itemIndex`, `message`
- **`CATEGORIES`** array defines the 5 tabs and maps each to a `StoreView` key
- **`useInput()`** handles keyboard — arrows for navigation, Enter/Space for toggle, Tab to switch to projects view
- **Sub-components**: `CategoryTab`, `ItemRow`, `DetailPanel`

### `src/components/ProjectsView.tsx`

Projects list view. Features:
- Lists all registered projects with their name, path, target, and active status.
- **a**: Add a project by typing its path.
- **d**: Remove the selected project.
- **t**: Cycle the default target for the selected project.
- **Enter**: Switch to the selected project (opens ManageView for it).
- **Tab**: Switch to ManageView.
- **s**: Switch to SettingsView.

### `src/components/SettingsView.tsx`

Settings editor. Features:
- Lists configurable settings with their current values.
- **Enter/Space**: Cycle through available values for the selected setting.
- Settings are persisted immediately to `~/.config/opencode-manager/settings.json`.

### `src/cli.tsx`

Bootstrap:
1. Loads user settings.
2. Resolves target adapter (from `--target` flag or settings default).
3. Detects project context from cwd.
4. Determines startup view (from subcommand, settings, or auto-detect).
5. Lazy-loads the required target adapter via `initAdapter()`.
6. Loads the store index and builds the view.
7. Renders the TUI.

### `src/build-index.ts`

Standalone script (`npm run index`) that calls `buildIndex()` and writes `index.json` to the project root. Run this after adding or modifying store items.

### `bin/cli.js`

The global CLI entry point. Prefers the pre-compiled `dist/cli.js` for fast startup (~300ms). Falls back to `npx tsx src/cli.tsx` only when `dist/` doesn't exist (development mode).

## Store item formats

### Agents (`store/agents/<name>.md`)

Standard OpenCode agent markdown. The filename (minus `.md`) becomes the agent ID.

```markdown
---
description: Required — shown in TUI and used by OpenCode
mode: subagent           # or "primary" or "all"
model: anthropic/...     # optional
temperature: 0.2         # optional
tools:                   # optional
  write: false
  bash: false
---

System prompt content here.
```

Tags are derived from `mode` and the provider prefix of `model`.

### Commands (`store/commands/<name>.md`)

Standard OpenCode command markdown. The filename becomes the command name (invoked as `/<name>`).

```markdown
---
description: Required — shown in TUI
agent: build             # optional — which agent runs this
model: anthropic/...     # optional
---

Prompt template. Use $ARGUMENTS for user input.
Use !`command` for shell output injection.
```

Tags are derived from the `agent` field.

### Skills (`store/skills/<name>/SKILL.md`)

Standard OpenCode skill format. The directory name must match the `name` field in frontmatter.

```markdown
---
name: my-skill           # required, must match directory name
description: Required    # required
license: MIT             # optional
compatibility: opencode  # optional
metadata:                # optional
  audience: developers
---

Skill content.
```

Tags are derived from `license`, `compatibility`, and `metadata` key-value pairs.

### Providers (`store/providers/<name>.json`)

JSON file where `_meta` is store metadata and everything else is the config payload:

```json
{
  "_meta": {
    "description": "Required — shown in TUI",
    "tags": ["optional", "tags"]
  },
  "options": { ... },
  "models": { ... }
}
```

On install, `_meta` is stripped and the rest is written to `provider.<filename>` in `opencode.json`.

### MCP Servers (`store/mcps/<name>.json`)

Same pattern as providers:

```json
{
  "_meta": {
    "description": "Required — shown in TUI",
    "tags": ["remote", "search"]
  },
  "type": "remote",
  "url": "https://..."
}
```

On install, `_meta` is stripped and the rest is written to `mcp.<filename>` in `opencode.json`.

## Adding a new store category

If you need to add a new type of store item (e.g. themes, plugins):

1. **`types.ts`**: Add to the `StoreItemType` union. Add any frontmatter/file interfaces. Add the new array to `StoreView`.
2. **`store.ts`**: Write a `scanXxx()` function. Add its output to `buildIndex()`.
3. **`opencode-store.ts`**: Add detection logic in `getGlobalInstalledState()` / `getProjectInstalledState()`. Add install logic in `installItemGlobal()` / `installItemProject()`. Add uninstall logic in `uninstallItemGlobal()` / `uninstallItemProject()`. If it maps to a JSON config key, add to `getConfigKey()`.
4. **`StoreApp.tsx`**: Add an entry to the `CATEGORIES` array in ManageView. Update the `typeLabel` map in `DetailPanel` if you want a custom display name.
5. **`store/`**: Create the new directory and add items.
6. Run `npm run index` to rebuild.

## Development workflow

```bash
npm run dev       # Run the TUI directly via tsx (no build step)
npm run build     # Compile to dist/ (for fast production startup)
npm run start     # Run the compiled dist/cli.js directly
npm run index     # Rebuild index.json after changing store items
npm run setup     # Install deps, compile, and link CLI globally
```

For development, `npm run dev` uses tsx to transpile on the fly. For production use (including the global `opencode-manager` command), run `npm run build` first — `bin/cli.js` will automatically use the compiled output for fast startup (~300ms vs ~1-2s with tsx).

## Important paths

| Path | Purpose |
|------|---------|
| `~/.config/opencode/opencode.json` | Global OpenCode config (providers, MCPs, agents, commands via JSON) |
| `~/.config/opencode/agents/` | Global agent markdown files |
| `~/.config/opencode/commands/` | Global command markdown files |
| `~/.config/opencode/skills/` | Global skill directories |
| `~/.config/opencode-manager/settings.json` | User settings (default target, default view) |
| `~/.config/opencode-manager/projects.json` | Project registry (tracked projects and their targets) |
| `./opencode.json` | Project-level OpenCode config (providers, MCPs, agents, commands via JSON) |
| `./.opencode/agents/` | Project-level agent markdown files |
| `./.opencode/commands/` | Project-level command markdown files |
| `./.opencode/skills/` | Project-level skill directories |
| `./store/` | The local store this tool manages |
| `./index.json` | Generated index of all store items |

## Conventions

- All source code is in `src/`, TypeScript with ESM imports (`.js` extensions in import paths).
- The TUI is split into view components in `src/components/`. `StoreApp.tsx` is the top-level shell that routes between views.
- Store items are the source of truth. `index.json` is derived and can be regenerated at any time.
- Provider and MCP JSON files use `_meta` as the reserved key for store metadata. This key is always stripped before writing to `opencode.json`.
- `jsonc-parser` is used instead of `JSON.parse`/`JSON.stringify` to preserve comments and formatting in user config files.
- File-based items (agents, commands, skills) are installed by copying files. JSON-based items (providers, MCPs) are installed by merging into `opencode.json`.
- Target adapters are lazy-loaded — only the selected adapter is imported at startup.
- Config reads and directory listings in `opencode-store.ts` are cached per session and invalidated on install/uninstall.
- User data (settings, project registry) lives in `~/.config/opencode-manager/`, separate from OpenCode's own config in `~/.config/opencode/`.
