# opencode-manager

A terminal storefront for managing your [OpenCode](https://opencode.ai) setup. Browse a curated collection of agents, commands, skills, providers, and MCP servers — then install or remove them from your global OpenCode config with a single keypress.

## Why

OpenCode supports a rich ecosystem of customizations — custom agents, slash commands, reusable skills, provider configs, and MCP server integrations — but managing them means editing JSON files and copying markdown into the right directories by hand.

This tool keeps a local "store" of those items in version control, tracks what's installed in your global config, and gives you a TUI to toggle them on and off.

## What's in the store

| Category | Count | Format | Installed to |
|----------|-------|--------|--------------|
| **Agents** | 7 | Markdown with frontmatter | `~/.config/opencode/agents/` |
| **Commands** | 6 | Markdown with frontmatter | `~/.config/opencode/commands/` |
| **Skills** | 4 | `SKILL.md` in named folders | `~/.config/opencode/skills/<name>/` |
| **Providers** | 4 | JSON config blocks | `provider.<id>` in `opencode.json` |
| **MCP Servers** | 5 | JSON config blocks | `mcp.<id>` in `opencode.json` |

### Agents

- **brainstorm** — Primary agent for exploring design options without making changes
- **code-reviewer** — Reviews code for quality, security, and best practices
- **docs-writer** — Writes and maintains project documentation
- **git-commit** — Generates conventional commits from staged changes
- **refactorer** — Refactors code for better structure and readability
- **security-auditor** — Performs security audits and identifies vulnerabilities
- **test-writer** — Generates and runs tests, analyzes coverage gaps

### Commands

- **/test** — Run the test suite and fix any failures
- **/review-changes** — Review recent git changes and suggest improvements
- **/explain** — Explain how a file or module works
- **/fix-todos** — Find and fix TODO/FIXME comments in the codebase
- **/changelog** — Generate a changelog from recent commits
- **/check-deps** — Analyze project dependencies for issues and updates

### Skills

- **git-release** — Create consistent releases with changelogs and version bumps
- **pr-review** — Structured pull request review with checklist and feedback
- **api-design** — Design RESTful and GraphQL APIs with consistent conventions
- **error-handling** — Implement consistent error handling patterns

### Providers

- **amazon-bedrock** — Bedrock us-east-1 with martech profile and Claude Haiku 4.5
- **amazon-bedrock-west** — Bedrock us-west-2 with Claude Sonnet 4
- **anthropic** — Anthropic direct API (key from `$ANTHROPIC_API_KEY`)
- **openai** — OpenAI direct API (key from `$OPENAI_API_KEY`)

### MCP Servers

- **context7** — Search library and framework docs (remote)
- **sentry** — Query Sentry issues and error data via OAuth (remote)
- **gh-grep** — Grep by Vercel — search code on GitHub (remote)
- **github** — GitHub MCP server for issues, PRs, repos (local, via npx)
- **filesystem** — Read, search, and manage local files (local, via npx)

## Install

Requires **Node.js 22+**.

```bash
# Clone the repo
git clone <repo-url> opencode-manager
cd opencode-manager

# Run setup (installs dependencies, installs tsx globally, links CLI)
npm run setup
```

That's it. You can now run `opencode-manager` from anywhere.

The setup script works on both macOS and Windows.

## Usage

```bash
opencode-manager
```

This opens the TUI:

```
 OpenCode Manager — manage your agents, commands, skills, providers & MCPs

  ▸ Agents(2/7)   Commands(0/6)   Skills(0/4)   Providers(1/4)   MCPs(0/5)
 ────────────────────────────────────────────────────────────────────────
  ▸ ✓ brainstorm — Brainstorms ideas and explores design options...
    ○ code-reviewer — Reviews code for quality, security, and best practices
    ○ docs-writer — Writes and maintains project documentation
    ...

 ┌──────────────────────────────────────────────────────┐
 │ brainstorm (agent)                                    │
 │ Brainstorms ideas and explores design options...      │
 │ Tags: primary                                         │
 │ Status: Installed (via file)                          │
 └──────────────────────────────────────────────────────┘

 ←/→ category  ↑/↓ navigate  Enter/Space toggle  q quit
```

### Controls

| Key | Action |
|-----|--------|
| `←` / `→` | Switch between categories |
| `↑` / `↓` | Navigate items in the current category |
| `Enter` or `Space` | Install or uninstall the selected item |
| `q` | Quit |

Each category tab shows `(installed/total)` so you can see at a glance what's active.

### What happens when you install

- **Agents, commands** — The markdown file is copied into `~/.config/opencode/agents/` or `~/.config/opencode/commands/`.
- **Skills** — The `SKILL.md` is copied into `~/.config/opencode/skills/<name>/`.
- **Providers** — The JSON block (minus `_meta`) is written into the `provider` object in `~/.config/opencode/opencode.json`.
- **MCP servers** — The JSON block (minus `_meta`) is written into the `mcp` object in `~/.config/opencode/opencode.json`.

Uninstalling reverses each of these — files are deleted, JSON keys are removed.

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
npm run dev       # Run the TUI via tsx (no build step)
npm run build     # Compile TypeScript to dist/
npm run index     # Rebuild the store index
npm run setup     # Install deps, tsx globally, and link CLI
```

Since `npm link` creates a symlink, code changes take effect immediately when running `opencode-manager` — no rebuild needed during development.

## License

MIT
