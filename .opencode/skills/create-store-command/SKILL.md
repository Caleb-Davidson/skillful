---
name: create-store-command
description: Guided process to create a new command entry in the skillful store
compatibility: opencode
metadata:
  audience: developers
  workflow: store-authoring
---

## What I do

Walk the user through creating a new OpenCode custom command and adding it to the `store/commands/` directory in this repo.

## When to use me

Use this skill when the user wants to add a new slash command to the skillful store.

## Process

Ask the user the following questions in a single message. Do not proceed until all are answered:

1. **Name** — The command identifier (lowercase, hyphenated, e.g. `fix-todos`). This becomes the filename and the slash command name (`/<name>`).
2. **Description** — A one-line summary of what the command does (required, shown in the TUI and in autocomplete).
3. **Agent** — Optional. Which agent should execute this command (e.g. `build`, `plan`, or a custom agent name). Leave blank to use the user's current agent.
4. **Model** — Optional. Override the model for this command. Format: `provider/model-id`. Leave blank to use the agent's default.
5. **Subtask** — Optional. Set to `true` to force the command to run as a subagent invocation (useful to avoid polluting the primary context). Default: not set.
6. **Prompt template** — The full prompt content. This is the markdown body below the frontmatter. Explain the following special syntax to the user:
   - `$ARGUMENTS` — replaced with whatever the user types after the command
   - `$1`, `$2`, `$3` — positional arguments
   - `!`\``command`\` — injects shell command output into the prompt
   - `@path/to/file` — includes a file's content in the prompt

## Output format

Once the user provides all the information, create the file at `store/commands/<name>.md` with this exact format:

```markdown
---
description: <description>
agent: <agent>           # omit line entirely if blank
model: <model>           # omit line entirely if blank
subtask: true            # omit line entirely if not true
---

<prompt template content>
```

## After creating the file

Run `npm run index` (which executes `tsx src/build-index.ts`) to regenerate `index.json` with the new command included. Report the updated item count to the user.

## Validation rules

- Name must be lowercase alphanumeric with hyphens, no spaces, no underscores.
- Name must not conflict with an existing file in `store/commands/`.
- Description is required and should be under 120 characters.
- Agent, if provided, should be a known agent name (built-in: `build`, `plan`, `general`, `explore`, or any custom agent in the store).
- Model, if provided, must contain a `/` separator.

## Example

For a user who wants a "lint" command that runs the linter and fixes issues:

File: `store/commands/lint.md`
```markdown
---
description: Run the linter and auto-fix issues
agent: build
---

Run the project's linter with auto-fix enabled:

!`npm run lint -- --fix`

If there are remaining issues that couldn't be auto-fixed, analyze each one and apply manual fixes. Show a summary of all changes made.
```
