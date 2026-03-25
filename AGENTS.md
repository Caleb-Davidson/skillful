# AGENTS.md

This document describes the architecture, codebase layout, and development patterns of `opencode-manager`. Read this to understand how the project works and how to maintain or extend it.

## Purpose

opencode-manager is a Node.js CLI tool that maintains a local "store" of OpenCode configuration items (agents, commands, skills, providers, MCP servers), detects which ones are installed in the user's global OpenCode config, and provides a TUI to install/uninstall them.

The tool targets the **global** OpenCode configuration at `~/.config/opencode/`. It does not modify per-project configs.

## Technology stack

- **Runtime**: Node.js 22+ (ESM modules)
- **Language**: TypeScript 6, compiled with `tsx` for development
- **TUI framework**: [Ink](https://github.com/vadimdemedes/ink) (React for the terminal)
- **Config parsing**: `jsonc-parser` for reading/writing `opencode.json` with comment preservation
- **Frontmatter parsing**: `gray-matter` for parsing YAML frontmatter from markdown files

## Project structure

```
opencode-manager/
├── bin/
│   └── cli.js              # Global CLI entry point (shebang uses tsx)
├── src/
│   ├── cli.tsx              # App bootstrap — loads index, builds view, renders TUI
│   ├── build-index.ts       # Script to pre-generate index.json from store/
│   ├── lib/
│   │   ├── types.ts         # All TypeScript types and interfaces
│   │   ├── store.ts         # Store scanner — reads store/ directory, builds index
│   │   └── config.ts        # Config manager — reads/writes ~/.config/opencode/
│   └── components/
│       └── StoreApp.tsx     # The Ink TUI component (full app in one file)
├── store/                   # The store — all items available for installation
│   ├── agents/              # Agent markdown files (.md)
│   ├── commands/            # Command markdown files (.md)
│   ├── skills/              # Skill directories, each containing SKILL.md
│   ├── providers/           # Provider JSON config files (.json)
│   └── mcps/                # MCP server JSON config files (.json)
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
  config.ts (buildStoreView) — checks each item against ~/.config/opencode/
      │
      ▼
  StoreView { agents, commands, skills, providers, mcps } (each with InstalledState)
      │
      ▼
  StoreApp.tsx — renders TUI, calls toggleItem() on Enter/Space
      │
      ▼
  config.ts (installItem / uninstallItem) — writes to ~/.config/opencode/
```

## Key files in detail

### `src/lib/types.ts`

All shared types. The important ones:

- **`StoreItemType`**: Union of `"agent" | "command" | "skill" | "provider" | "mcp"`
- **`StoreItemMeta`**: The index entry for a store item — `id`, `type`, `name`, `description`, `tags`, `path`
- **`InstalledState`**: Whether an item is installed, and via what mechanism (`"json"` or `"file"`)
- **`StoreItemWithState`**: `StoreItemMeta` + `InstalledState` — what the TUI works with
- **`StoreView`**: The full TUI model — arrays of `StoreItemWithState` grouped by category
- **`ProviderStoreFile` / `McpStoreFile`**: Shape of the JSON files in `store/providers/` and `store/mcps/`. They have a `_meta` block (description + tags for the TUI) and the rest is the raw config payload.

### `src/lib/store.ts`

Scans the `store/` directory and builds a `StoreIndex`. Each item type has its own scan function:

- **`scanAgents()`**: Reads `store/agents/*.md`, parses frontmatter with `gray-matter`, extracts `description` and `mode` for tags.
- **`scanCommands()`**: Reads `store/commands/*.md`, parses frontmatter, extracts `description` and `agent` for tags.
- **`scanSkills()`**: Reads `store/skills/*/SKILL.md`, parses frontmatter, extracts `name`, `description`, `license`, `compatibility`, `metadata` for tags.
- **`scanProviders()`**: Reads `store/providers/*.json`, parses with `jsonc-parser`, extracts `_meta.description` and `_meta.tags`.
- **`scanMcps()`**: Reads `store/mcps/*.json`, same pattern as providers.

`getStorePath()` walks up from the current file to find the project root (the directory containing `store/`).

`loadIndex()` returns the cached `index.json` if it exists, otherwise calls `buildIndex()` on the fly.

### `src/lib/config.ts`

Manages the OpenCode global configuration at `~/.config/opencode/`. Three main responsibilities:

**1. Detection (`getInstalledState`)**

For each item type, checks whether it exists in the global config:

| Type | Check JSON config | Check filesystem |
|------|-------------------|------------------|
| agent | `config.agent.<id>` exists | `~/.config/opencode/agents/<id>.md` exists |
| command | `config.command.<id>` exists | `~/.config/opencode/commands/<id>.md` exists |
| skill | — | `~/.config/opencode/skills/<id>/SKILL.md` exists |
| provider | `config.provider.<id>` exists | — |
| mcp | `config.mcp.<id>` exists | — |

Returns `{ installed: true, installedVia: "json" | "file" }` or `{ installed: false }`.

**2. Install (`installItem`)**

- **Agents, commands**: Copies the `.md` file from `store/` to `~/.config/opencode/{agents,commands}/`.
- **Skills**: Copies `SKILL.md` to `~/.config/opencode/skills/<id>/`.
- **Providers, MCPs**: Reads the JSON file, strips the `_meta` key, and uses `jsonc-parser`'s `modify()` + `applyEdits()` to write the payload into `opencode.json` under `provider.<id>` or `mcp.<id>`. This preserves existing formatting and comments in the config file.

**3. Uninstall (`uninstallItem`)**

Reverse of install:
- File-based items: Deletes the file (or directory for skills).
- JSON-based items: Uses `jsonc-parser` to remove the key. If the parent object becomes empty, removes it too.

**`buildStoreView()`** maps over all items and attaches their `InstalledState`.

### `src/components/StoreApp.tsx`

The entire TUI in one React component, using Ink. Key parts:

- **State**: `view` (StoreView), `categoryIndex`, `itemIndex`, `message`
- **`CATEGORIES`** array defines the 5 tabs and maps each to a `StoreView` key
- **`useInput()`** handles keyboard — arrows for navigation, Enter/Space for toggle, q to quit
- **`refreshView()`** re-checks installed state after a toggle operation
- **Sub-components**: `CategoryTab`, `ItemRow`, `DetailPanel`

The component is stateless with respect to the store — it re-reads installed state from the filesystem on every toggle.

### `src/cli.tsx`

Bootstrap: loads the index, builds the view, calls `render()` from Ink. Exits with an error if the store is empty.

### `src/build-index.ts`

Standalone script (`npm run index`) that calls `buildIndex()` and writes `index.json` to the project root. Run this after adding or modifying store items.

### `bin/cli.js`

The global CLI entry point. Uses `#!/usr/bin/env npx tsx` to run TypeScript directly without a build step. Imports `src/cli.tsx`.

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
3. **`config.ts`**: Add detection logic in `getInstalledState()`. Add install logic in `installItem()`. Add uninstall logic in `uninstallItem()`. Add to `buildStoreView()` filter. If it maps to a JSON config key, add to `getConfigKey()`.
4. **`StoreApp.tsx`**: Add an entry to the `CATEGORIES` array. Add the new key to `refreshView()`. Update the `typeLabel` map in `DetailPanel` if you want a custom display name.
5. **`store/`**: Create the new directory and add items.
6. Run `npm run index` to rebuild.

## Development workflow

```bash
npm run dev       # Run the TUI directly via tsx
npm run index     # Rebuild index.json after changing store items
npm run build     # Compile to dist/ (for production use)
```

Since the global command is symlinked via `npm link`, changes to source files take effect immediately — no rebuild required.

## Important paths

| Path | Purpose |
|------|---------|
| `~/.config/opencode/opencode.json` | Global OpenCode config (providers, MCPs, agents, commands via JSON) |
| `~/.config/opencode/agents/` | Global agent markdown files |
| `~/.config/opencode/commands/` | Global command markdown files |
| `~/.config/opencode/skills/` | Global skill directories |
| `./store/` | The local store this tool manages |
| `./index.json` | Generated index of all store items |

## Conventions

- All source code is in `src/`, TypeScript with ESM imports (`.js` extensions in import paths).
- The TUI is a single Ink component in `StoreApp.tsx`. If it grows, split into sub-components in `src/components/`.
- Store items are the source of truth. `index.json` is derived and can be regenerated at any time.
- Provider and MCP JSON files use `_meta` as the reserved key for store metadata. This key is always stripped before writing to `opencode.json`.
- `jsonc-parser` is used instead of `JSON.parse`/`JSON.stringify` to preserve comments and formatting in user config files.
- File-based items (agents, commands, skills) are installed by copying files. JSON-based items (providers, MCPs) are installed by merging into `opencode.json`.
