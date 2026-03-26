---
name: conventional-commit
description: Analyzes staged changes and session intent to generate and execute high-quality Conventional Commit messages
license: MIT
compatibility: opencode
metadata:
  audience: developers
  domain: git
  platform: universal
---
## Operational Workflow

### 1. Initial State Check

- Run `git diff --staged --stat` to see what changes are being committed.
- If no changes are staged, inform the user and stop.

### 2. Gather Context

- **Primary Source:** Use the current conversation history to understand the intent (the "Why").
- **Secondary Source:** If the current conversation history is insufficient to understand the intent (the "Why") for all changes:
  - **Gather More:** Run `git diff --staged -- <file1> <file2>` for each of the key files to understand the changes.
  - **Ambiguity:** If the code and session history conflict, ask the user for clarification before drafting.

### 3. Conventional Commit Standards

- **Format:** `<type>(<scope>): <description>`
- **Types:** feat, fix, docs, style, refactor, test, chore
- **Scopes:** Prioritize project-specific naming conventions (e.g., `auth`, `api`, `ui`, `db`, `ci`)
- **Description:** Imperative mood ("Add" not "Added"), capitalized, ends with a period. Max 72 chars.
- **Body:** Use bullet points to explain the reasoning and impact, not just a list of changed lines.
- **Breaking Changes:** Start footer with `BREAKING CHANGE:` (do not use the `!` syntax).

### 4. Execution Protocol

- Run `git commit -m 'MESSAGE'`.
- **Constraint:** Use exactly one `-m` flag.
- **Constraint:** Wrap the entire message in single quotes (`'`) to prevent the shell from interpreting special characters (like `!`, `&`, or backticks).

## Core Principles

- **Efficiency:** Minimize terminal output by targeting specific files if the diff is massive.
- **Accuracy:** Ensure the "What" from the code matches the "Why" from the session summary.
- **Automation:** Handle both the content generation and the command execution without asking for confirmation unless the diff is ambiguous.