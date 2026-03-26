---
name: ticket-commit
description: Analyzes staged changes and extracts a ticket ID from the branch name to generate and execute ticket-prefixed commit messages
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

### 2. Extract Ticket ID from Branch

- Determine the current branch name via `git rev-parse --abbrev-ref HEAD`.
- Extract the ticket ID from the **beginning** of the branch name.
- The ticket ID format is: `PROJECTID-1234` (uppercase letters, a hyphen, then digits).
- It always appears at the very start of the branch name, followed by a `-` separator before the rest of the branch description.
- Example branch names and their extracted ticket IDs:
  - `BANK-142-add-pokemon-export` → `BANK-142`
  - `HOME-88-fix-auth-bug` → `HOME-88`
- If no ticket ID can be extracted, inform the user and stop.

### 3. Gather Context

- **Primary Source:** Use the current conversation history to understand the intent (the "Why").
- **Secondary Source:** If the current conversation history is insufficient to understand the intent (the "Why") for all changes:
  - **Gather More:** Run `git diff --staged -- <file1> <file2>` for each of the key files to understand the changes.
  - **Ambiguity:** If the code and session history conflict, ask the user for clarification before drafting.

### 4. Commit Message Standards

- **Format:** `TICKET-ID: <description>`
- **Ticket ID:** Extracted from the branch name, must match format `PROJECTID-1234`. Must appear at the start of the message, followed by a colon and a space.
- **Description:** Imperative mood ("Add" not "Added"), starts with uppercase, ends with a period. Max 72 chars.
- **Body:** Use bullet points to explain the reasoning and impact, not just a list of changed lines.
- **Breaking Changes:** Start footer with `BREAKING CHANGE:` (do not use the `!` syntax).

### 5. Execution Protocol

- Run `git commit -m 'MESSAGE'`.
- **Constraint:** Use exactly one `-m` flag.
- **Constraint:** Wrap the entire message in single quotes (`'`) to prevent the shell from interpreting special characters (like `!`, `&`, or backticks).

## Core Principles

- **Efficiency:** Minimize terminal output by targeting specific files if the diff is massive.
- **Accuracy:** Ensure the "What" from the code matches the "Why" from the session summary.
- **Automation:** Handle both content generation and command execution without asking for confirmation unless the diff is ambiguous.
