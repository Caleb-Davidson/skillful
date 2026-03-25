---
name: create-store-agent
description: Guided process to create a new agent entry in the opencode-manager store
compatibility: opencode
metadata:
  audience: developers
  workflow: store-authoring
---

## What I do

Walk the user through creating a new OpenCode agent and adding it to the `store/agents/` directory in this repo.

## When to use me

Use this skill when the user wants to add a new agent to the opencode-manager store.

## Process

Ask the user the following questions in a single message. Do not proceed until all are answered:

1. **Name** — The agent identifier (lowercase, hyphenated, e.g. `code-reviewer`). This becomes the filename.
2. **Description** — A one-line summary of what the agent does (required, shown in the TUI).
3. **Mode** — One of: `primary` (user-facing, Tab-switchable), `subagent` (invoked by other agents or via @mention), or `all` (both). Default: `subagent`.
4. **Model** — Optional. Format: `provider/model-id` (e.g. `anthropic/claude-sonnet-4-5`). Leave blank to inherit from the invoking agent.
5. **Temperature** — Optional. Float from 0.0 to 1.0. Lower = more deterministic. Leave blank for model default.
6. **Tool restrictions** — Should any tools be disabled? Common: `write: false`, `edit: false`, `bash: false`. Leave blank to allow all.
7. **System prompt** — The full instructions for the agent. This is the markdown body below the frontmatter.

## Output format

Once the user provides all the information, create the file at `store/agents/<name>.md` with this exact format:

```markdown
---
description: <description>
mode: <mode>
model: <model>           # omit line entirely if blank
temperature: <temp>      # omit line entirely if blank
tools:                   # omit entire block if no restrictions
  <tool>: false
---

<system prompt content>
```

## After creating the file

Run `npm run index` (which executes `tsx src/build-index.ts`) to regenerate `index.json` with the new agent included. Report the updated item count to the user.

## Validation rules

- Name must be lowercase alphanumeric with hyphens, no spaces, no underscores.
- Name must not conflict with an existing file in `store/agents/`.
- Description is required and should be under 120 characters.
- Mode must be one of: `primary`, `subagent`, `all`.
- Model, if provided, must contain a `/` separator.
- Temperature, if provided, must be a number between 0.0 and 1.0.

## Example

For a user who wants a "debug" agent that investigates bugs with read-only access:

File: `store/agents/debug.md`
```markdown
---
description: Investigates bugs by analyzing code, logs, and stack traces
mode: subagent
tools:
  write: false
  edit: false
---

You are a debugging specialist. When asked to investigate a bug:

1. Reproduce the issue by understanding the reported behavior
2. Read the relevant source code and trace the execution path
3. Check logs, error messages, and stack traces
4. Identify the root cause
5. Suggest a fix with explanation

Do not make changes directly. Present your findings and recommended fix.
```
