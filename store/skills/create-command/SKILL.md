---
name: create-command
description: Create new custom commands following OpenCode documentation. Use when you need to create a command markdown file that users invoke with /<command-name>.
license: MIT
compatibility: opencode
metadata:
  audience: developers
  domain: opencode
  platform: universal
---

# Custom Commands Definition

Commands are reusable prompt templates invoked with `/<name>` in the TUI. They encapsulate repetitive tasks that agents execute on demand.

## Command Location

Commands exist as `.md` files inside dedicated directories:

- **Project-scoped**: `.opencode/commands/<name>.md`
- **Global-scoped**: `~/.config/opencode/commands/<name>.md`

The filename (without `.md`) becomes the command name — invoked as `/<name>`.

## Required Metadata

Every command begins with YAML frontmatter containing these fields:

```markdown
---
description: <brief-description>
agent: <optional-agent-name>      # optional — which agent runs this command
model: <optional-model>          # optional — override the default model
subtask: <optional-boolean>       # optional — force subagent invocation
---
```

| Field | Requirements |
|-------|--------------|
| `description` | Required. Plain text shown in the TUI. 1-256 characters. |
| `agent` | Optional. Which agent executes this command. Defaults to current agent. |
| `model` | Optional. Override the default model for this command only. |
| `subtask` | Optional boolean. When `true`, forces subagent invocation even if agent mode is `primary`. |

## Content Structure

After frontmatter, the markdown body is the prompt template. It supports special placeholders:

**Arguments** — Use `$ARGUMENTS` to pass all user input, or positional parameters `$1`, `$2`, `$3`:

```
Create a new React component named $ARGUMENTS with TypeScript support.
```

Invoked as `/component Button` → `$ARGUMENTS` becomes `Button`.

**Shell output** — Use *!`command`* to inject bash output into the prompt:

```
Recent commits:
!`git log --oneline -10`
Review these changes and suggest improvements.
```

**File references** — Use `@filename` to include file contents:

```
Review the component in @src/components/Button.tsx.
Check for performance issues and suggest improvements.
```

## Example

```markdown
---
description: Run the full test suite with coverage
agent: build
model: anthropic/claude-3-5-sonnet-20241022
---

Run the full test suite with coverage report and show any failures.
Focus on the failing tests and suggest fixes.
```

## Creating a Command

1. Choose a command name (lowercase, no spaces — the filename becomes `/<name>`)
2. Create the `.md` file in your preferred scope (project or global `commands/` directory)
3. Write the frontmatter with `description` (required) and optional `agent`, `model`, `subtask`
4. Write the prompt template body using `$ARGUMENTS`, positional parameters, !`command`, or `@file` syntax
5. The command is available in the TUI after a reload
