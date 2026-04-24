# skillful

A terminal storefront for managing your [OpenCode](https://opencode.ai) setup.

`skillful` installs and uninstalls agents, commands, skills, providers, and MCP servers from one or more connected **git-backed store sources**.

## Why

OpenCode customization is powerful, but manually managing many files across global and project scope gets noisy fast.

`skillful` gives you one keyboard-first TUI to:

- connect multiple sources (personal/work/team)
- browse merged content with deterministic priority rules
- install or remove items globally or per-project
- manage project targets and startup defaults

## Source model

Store content lives in separate repos. `skillful` caches and indexes them locally.

- Source registry: `~/.config/skillful/sources.json`
- Source cache root: `~/.cache/skillful/sources/<sourceId>/repo`
- Per-source cached index: `~/.cache/skillful/sources/<sourceId>/index.json`
- Priority rule: lower number means higher priority
- Collision rule: if multiple sources define the same `(type,id)`, highest-priority source wins

Expected source repo format:

```text
<repo>/
  store/
    agents/*.md
    commands/*.md
    skills/<name>/SKILL.md
    providers/*.json
    mcps/*.json
```

`index.json` in source repos is **not required**.

## Install

Requires **Node.js 22+**.

```bash
git clone <repo-url> skillful
cd skillful
npm run setup
```

`npm run setup` installs dependencies, builds TypeScript, and links `skillful` globally.

## Usage

```bash
skillful
skillful manage
skillful projects
skillful settings
skillful --target=opencode
skillful --update
```

- `manage`, `projects`, `settings` jump to a specific view.
- `--target` supports: `opencode`, `claude-code`, `codex-cli`, `codex-app`.
- `--update` re-installs all currently installed items for the current project from connected sources (run at a project root containing `.git` or `.opencode`).

When no enabled sources exist, `skillful` starts in **Settings** so first-run setup is guided instead of empty.

## TUI views

`skillful` has three views and shared tab navigation:

- **Store**: browse items by category and install/uninstall.
- **Projects**: register, remove, and switch projects; set per-project target defaults.
- **Settings**: configure app defaults and manage connected store sources.

## Key controls

Common controls:

- `q` quit
- `Tab` next view

Store view:

- `Left` / `Right` switch category
- `Up` / `Down` move selection
- `Enter` / `Space` install or uninstall selected item

Projects view:

- `Up` / `Down` move selection
- `Enter` open selected project in Store view
- `a` add project path
- `d` remove selected project
- `t` cycle selected project's default target

Settings view:

- `Up` / `Down` move selection
- `Enter` / `Space` cycle setting or enable/disable source
- `a` add source URL
- `d` remove selected source
- `[` / `]` reorder source priority
- `u` check selected source for updates
- `f` fetch selected source and refresh its cached index
- `c` check all enabled sources

Source changes refresh in-memory store content immediately (no restart needed).

## Install behavior

Global mode (outside a project):

- agents/commands -> `~/.config/opencode/agents|commands`
- skills -> `~/.config/opencode/skills/<name>/SKILL.md`
- providers/mcps -> merged into `~/.config/opencode/opencode.json`

Project mode (inside a project with `.git` or `.opencode`):

- agents/commands -> `.opencode/agents|commands`
- skills -> `.opencode/skills/<name>/SKILL.md`
- providers/mcps -> merged into `./opencode.json`

In project mode, operations affect project scope only and do not mutate global installs.

Project-mode status indicators in Store view:

- `✓` installed in project
- `◆` installed globally only (not yet in project)
- `○` not installed
- `!` installed but differs from source (press Enter to overwrite)

## Config files

`skillful` keeps its own app state separate from OpenCode files:

- `~/.config/skillful/settings.json` - default target and startup view
- `~/.config/skillful/projects.json` - registered projects and optional per-project targets
- `~/.config/skillful/sources.json` - source registry, priorities, and source status metadata

These files are created automatically on first use.

## Authoring a store source

Agents (`store/agents/<name>.md`):

```markdown
---
description: What this agent does
mode: subagent
targets:
  - opencode
tools:
  write: false
---

Your agent prompt.
```

Commands (`store/commands/<name>.md`):

```markdown
---
description: What this command does
agent: build
targets: [opencode, codex-cli]
---

Prompt template. Use $ARGUMENTS for user input.
```

Skills (`store/skills/<folder>/SKILL.md`):

```markdown
---
name: my-skill
description: What this skill teaches
targets: codex-app
---

Skill content.
```

`targets` is optional for agents, commands, and skills. When present, the item is only shown for the listed targets (`opencode`, `claude-code`, `codex-cli`, `codex-app`).

Providers (`store/providers/<name>.json`) and MCPs (`store/mcps/<name>.json`) must include `_meta.description`; everything except `_meta` is treated as the install payload.

```json
{
  "_meta": {
    "description": "Human-readable description",
    "tags": ["example"]
  },
  "type": "remote",
  "url": "https://example.com/mcp"
}
```

## Development

```bash
npm run dev
npm run build
npm run start
```

## License

MIT
