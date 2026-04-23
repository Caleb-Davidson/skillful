# opencode-manager

A terminal storefront for managing your [OpenCode](https://opencode.ai) setup. Browse a curated collection of agents, commands, skills, providers, and MCP servers — then install or remove them with a single keypress. Track multiple projects, set per-project defaults, and switch between them without leaving the TUI.

## Why

OpenCode supports a rich ecosystem of customizations — custom agents, slash commands, reusable skills, provider configs, and MCP server integrations — but managing them means editing JSON files and copying markdown into the right directories by hand.

This tool keeps a local "store" of those items in version control, tracks what's installed, and gives you a TUI to toggle them on and off — at either the global or project level. It also maintains a registry of your projects so you can quickly switch between them and keep per-project configuration.

## What's in the store

| Category | Count | Format | Installed to (global) | Installed to (project) |
|----------|-------|--------|-----------------------|------------------------|
| **Agents** | 4 | Markdown with frontmatter | `~/.config/opencode/agents/` | `.opencode/agents/` |
| **Commands** | 1 | Markdown with frontmatter | `~/.config/opencode/commands/` | `.opencode/commands/` |
| **Skills** | 5 | `SKILL.md` in named folders | `~/.config/opencode/skills/<name>/` | `.opencode/skills/<name>/` |
| **Providers** | 0 | JSON config blocks | `provider.<id>` in `~/.config/opencode/opencode.json` | `provider.<id>` in `./opencode.json` |
| **MCP Servers** | 3 | JSON config blocks | `mcp.<id>` in `~/.config/opencode/opencode.json` | `mcp.<id>` in `./opencode.json` |

### Agents

- **architect** — Designs detailed system architectures that enable developers to implement solutions independently.
- **brainstorm** — A brainstorming partner who helps developers explore diverse options and analyze trade-offs.
- **epic-manager** — Translates high-level business requirements into discrete, traceable Epics ready for task breakdown.
- **task-lead** — Breaks down approved Epics into discrete, testable Work Items.

### Commands

- **/update-agents** — Updates AGENTs.md with the current session and context.

### Skills

- **code-comments** — Add and maintain high-quality code documentation for public APIs and complex logic
- **conventional-commit** — Analyzes staged changes and session intent to generate and execute high-quality Conventional Commit messages
- **create-command** — Create new custom commands following OpenCode documentation. Use when you need to create a command markdown file that users invoke with /<command-name>.
- **create-skill** — Create new agent skills following OpenCode documentation. Use when you need to create, write, or scaffold a SKILL.md file with proper structure.
- **ticket-commit** — Analyzes staged changes and extracts a ticket ID from the branch name to generate and execute ticket-prefixed commit messages

### Providers

_No providers available_

### MCP Servers

- **atlassian-mcp-server-jira** — Atlassian Jira MCP — remote MCP server for Jira
- **chrome-devtools** — Chrome DevTools MCP — inspect, debug, and interact with Chrome via DevTools Protocol
- **github-mcp** — GitHub Copilot MCP — remote MCP server via GitHub Copilot API

## Install

Requires **Node.js 22+**.

```bash
# Clone the repo
git clone <repo-url> opencode-manager
cd opencode-manager

# Run setup (installs dependencies, compiles TypeScript, links CLI globally)
npm run setup
```

That's it. You can now run `opencode-manager` from anywhere.

The setup script works on both macOS and Windows.

## Usage

```bash
opencode-manager                # Auto-detect view (based on settings)
opencode-manager manage         # Open the store management view
opencode-manager projects       # Open the projects view
opencode-manager settings       # Open the settings view
opencode-manager --target=X     # Override target adapter (opencode, claude-code, etc.)
```

The TUI has three views, switchable at any time:

| View | Purpose | Switch to |
|------|---------|-----------|
| **Store** | Browse and install/uninstall store items | Tab from Projects, Tab from Settings |
| **Projects** | Manage registered projects | Tab from Store, `p` from Settings |
| **Settings** | Configure defaults (target, startup view) | `s` from Store, `s` from Projects |

### Store view (manage)

The tool automatically detects whether you're inside a project directory (by the presence of `.git` or `.opencode`). If so, it runs in **project mode** — installs go to your project config. Otherwise, it runs in **global mode** — installs go to `~/.config/opencode/`.

```
 [Store] |  Projects  |  Settings
 OpenCode Manager — Store
 Target: OpenCode (opencode)
 Project: my-project (/Users/you/Projects/my-project)

  ▸ Agents(1/4)   Commands(0/1)   Skills(0/5)   Providers(0/0)   MCPs(0/3)
 ────────────────────────────────────────────────────────────────────────
  ▸ ✓ brainstorm — Brainstorms ideas and explores design options...
    ◆ architect [global] — Designs detailed system architectures...
    ○ epic-manager — Translates high-level business requirements...
    ...

 ┌──────────────────────────────────────────────────────┐
 │ brainstorm (agent)                                    │
 │ Brainstorms ideas and explores design options...      │
 │ Tags: primary                                         │
 │ Status: Installed (project) via file                  │
 └──────────────────────────────────────────────────────┘

 ←/→ category  ↑/↓ navigate  Enter/Space toggle  Tab projects  s settings  q quit
 ✓ project  ◆ global only  ○ not installed
```

In project mode:

- `✓` (green) — installed in the project
- `◆` (blue) with `[global]` — installed globally but not in the project
- `○` (gray) — not installed anywhere

Pressing Enter/Space on a globally installed item adds it to the project config. Removing it from the project reveals the global state again. Global installs are never modified from project mode.

### Projects view

Register, remove, and switch between projects. Each project can have its own default target adapter.

```
 Store  | [Projects] |  Settings
 OpenCode Manager — Projects
 Registered projects you manage with opencode-manager

 ────────────────────────────────────────────────────────────────────────
  ▸ my-project [active] [opencode] — /Users/you/Projects/my-project
    other-project — /Users/you/Projects/other-project
    api-service [claude-code] — /Users/you/Projects/api-service

 ┌──────────────────────────────────────────────────────┐
 │ my-project                                            │
 │ Path: /Users/you/Projects/my-project                  │
 │ Target: opencode                                      │
 │ Added: 4/23/2026                                      │
 └──────────────────────────────────────────────────────┘

 ↑/↓ navigate  Enter open project  a add  d remove  t cycle target  Tab manage  s settings  q quit
```

| Key | Action |
|-----|--------|
| `a` | Add a project (type the directory path) |
| `d` | Remove the selected project from the registry |
| `t` | Cycle the default target for the selected project |
| `Enter` | Switch to that project's store view |

### Settings view

Configure global defaults that persist across sessions.

```
 Store  |  Projects  | [Settings]
 OpenCode Manager — Settings
 Configure default behavior for opencode-manager

 ────────────────────────────────────────────────────────────────────────
  ▸ Default Target — opencode
      Target adapter used when --target is not specified
    Default View — auto

 ┌──────────────────────────────────────────────────────┐
 │ Settings file: ~/.config/opencode-manager/settings.json │
 └──────────────────────────────────────────────────────┘

 ↑/↓ navigate  Enter/Space cycle value  Tab manage  p projects  q quit
```

Available settings:

| Setting | Values | Description |
|---------|--------|-------------|
| **Default Target** | `opencode`, `claude-code`, `codex-cli`, `codex-app` | Which target adapter to use when `--target` is not specified |
| **Default View** | `auto`, `manage`, `projects`, `settings` | Which view to show on startup. `auto` opens manage if inside a project, projects otherwise |

### Controls summary

| Key | Store view | Projects view | Settings view |
|-----|------------|---------------|---------------|
| `←` / `→` | Switch categories | — | — |
| `↑` / `↓` | Navigate items | Navigate projects | Navigate settings |
| `Enter` / `Space` | Toggle install | Open project | Cycle value |
| `Tab` | Go to Projects | Go to Store | Go to Store |
| `s` | Go to Settings | Go to Settings | — |
| `p` | — | — | Go to Projects |
| `a` | — | Add project | — |
| `d` | — | Remove project | — |
| `t` | — | Cycle target | — |
| `q` | Quit | Quit | Quit |

### What happens when you install

In **global mode** (outside a project):

- **Agents, commands** — The markdown file is copied into `~/.config/opencode/agents/` or `~/.config/opencode/commands/`.
- **Skills** — The `SKILL.md` is copied into `~/.config/opencode/skills/<name>/`.
- **Providers** — The JSON block (minus `_meta`) is written into the `provider` object in `~/.config/opencode/opencode.json`.
- **MCP servers** — The JSON block (minus `_meta`) is written into the `mcp` object in `~/.config/opencode/opencode.json`.

In **project mode** (inside a project with `.git` or `.opencode`):

- **Agents, commands** — The markdown file is copied into `.opencode/agents/` or `.opencode/commands/` in the project root.
- **Skills** — The `SKILL.md` is copied into `.opencode/skills/<name>/` in the project root.
- **Providers** — The JSON block (minus `_meta`) is written into `provider` in the project's `opencode.json`.
- **MCP servers** — The JSON block (minus `_meta`) is written into `mcp` in the project's `opencode.json`.

Uninstalling reverses each of these — files are deleted, JSON keys are removed. In project mode, only the project config is affected; global installs are never modified.

## Config files

opencode-manager stores its own configuration separately from OpenCode:

| File | Purpose |
|------|---------|
| `~/.config/opencode-manager/settings.json` | Global settings (default target, default startup view) |
| `~/.config/opencode-manager/projects.json` | Registry of tracked projects and their per-project targets |

These are created automatically on first use.

## Adding items to the store

### Agents

Create a markdown file in `store/agents/<name>.md` with OpenCode agent frontmatter:

```markdown
---
description: What this agent does
mode: subagent
tools:
  write: false
---

Your system prompt goes here.
```

### Commands

Create a markdown file in `store/commands/<name>.md`:

```markdown
---
description: What this command does
agent: build
---

The prompt template. Use $ARGUMENTS for user input.
```

### Skills

Create `store/skills/<name>/SKILL.md`:

```markdown
---
name: my-skill
description: What this skill teaches the agent
---

Skill content here.
```

### Providers

Create a JSON file in `store/providers/<name>.json`:

```json
{
  "_meta": {
    "description": "Human-readable description for the TUI",
    "tags": ["aws", "bedrock"]
  },
  "options": {
    "region": "us-east-1"
  },
  "models": {}
}
```

Everything except `_meta` is the config that gets written to `opencode.json` under `provider.<name>`.

### MCP Servers

Create a JSON file in `store/mcps/<name>.json`:

```json
{
  "_meta": {
    "description": "Human-readable description for the TUI",
    "tags": ["remote", "search"]
  },
  "type": "remote",
  "url": "https://example.com/mcp"
}
```

Everything except `_meta` is the config that gets written to `opencode.json` under `mcp.<name>`.

### Rebuild the index

After adding or modifying store items:

```bash
npm run index
```

This regenerates `index.json`. The TUI also rebuilds the index on the fly if `index.json` is missing.

## Development

```bash
npm run dev       # Run the TUI via tsx (no build step needed)
npm run build     # Compile TypeScript to dist/ (for fast production startup)
npm run start     # Run the compiled dist/cli.js directly
npm run index     # Rebuild the store index
npm run setup     # Install deps, compile, and link CLI globally
```

For development, `npm run dev` uses tsx to transpile on the fly. For production use (including the global `opencode-manager` command), run `npm run build` first — `bin/cli.js` will automatically use the compiled `dist/` output for fast startup (~300ms vs ~1-2s with tsx).

## License

MIT
