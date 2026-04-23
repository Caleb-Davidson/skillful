---
name: create-store-mcp
description: Guided process to create a new MCP server entry in the skillful store
compatibility: opencode
metadata:
  audience: developers
  workflow: store-authoring
---

## What I do

Walk the user through creating a new OpenCode MCP server configuration and adding it to the `store/mcps/` directory in this repo.

## When to use me

Use this skill when the user wants to add a new MCP server to the skillful store.

## Background

MCP (Model Context Protocol) servers provide external tools to OpenCode. There are two types:

- **Remote** — HTTP-based servers accessed via URL. May use headers for auth or OAuth.
- **Local** — Spawned as child processes via a command (e.g. `npx`). May need environment variables.

In the store, MCP JSON files have an extra `_meta` block for display in the TUI. On install, `_meta` is stripped and everything else is written under `mcp.<name>` in `opencode.json`.

## Process

Ask the user the following questions in a single message. Do not proceed until all are answered:

1. **Name** — The MCP server identifier (lowercase, hyphenated, e.g. `context7`, `gh-grep`). This becomes the filename and the key under `mcp.<name>` in opencode.json.
2. **Description** — A one-line summary for the TUI (required, e.g. "Context7 remote MCP — search library and framework docs").
3. **Tags** — Optional list of tags for filtering in the TUI (e.g. `remote`, `search`, `docs` or `local`, `github`).
4. **Type** — `remote` or `local`.
5. **If remote:**
   - `url` — The URL of the remote MCP server (required).
   - `headers` — Optional headers object (e.g. `{"Authorization": "Bearer {env:API_KEY}"}`).
   - `oauth` — Optional. Set to `{}` if the server uses OAuth, `false` to disable OAuth auto-detection, or omit entirely.
6. **If local:**
   - `command` — The command as an array of strings (required, e.g. `["npx", "-y", "@modelcontextprotocol/server-github"]`).
   - `environment` — Optional environment variables object (e.g. `{"GITHUB_TOKEN": "{env:GITHUB_TOKEN}"}`).
7. **Enabled** — Optional. Set to `true` or `false` to control whether it's active on startup. Omit to use the default (enabled).
8. **Timeout** — Optional. Timeout in ms for fetching tools. Default is 5000. Only set if a custom value is needed.

## Output format

Once the user provides all the information, create the file at `store/mcps/<name>.json`.

For a **remote** MCP:
```json
{
  "_meta": {
    "description": "<description>",
    "tags": ["<tag1>", "<tag2>"]
  },
  "type": "remote",
  "url": "<url>",
  "headers": { ... },
  "oauth": { ... }
}
```

For a **local** MCP:
```json
{
  "_meta": {
    "description": "<description>",
    "tags": ["<tag1>", "<tag2>"]
  },
  "type": "local",
  "command": ["<cmd>", "<arg1>", "<arg2>"],
  "environment": { ... }
}
```

Omit `"tags"` inside `_meta` if no tags were provided. Omit `"headers"`, `"oauth"`, `"environment"`, `"enabled"`, and `"timeout"` if not provided.

## After creating the file

Run `npm run index` (which executes `tsx src/build-index.ts`) to regenerate `index.json` with the new MCP server included. Report the updated item count to the user.

## Validation rules

- Name must be lowercase alphanumeric with hyphens, no spaces.
- Name must not conflict with an existing file in `store/mcps/`.
- Description is required.
- Type must be `remote` or `local`.
- Remote MCPs must have a `url` field with a valid URL.
- Local MCPs must have a `command` field as an array with at least one element.
- Secrets should use `{env:VARIABLE_NAME}` substitution, never hardcoded values.
- The JSON must be valid and properly formatted with 2-space indentation.

## Examples

Remote MCP with OAuth:

File: `store/mcps/linear.json`
```json
{
  "_meta": {
    "description": "Linear MCP — manage issues and projects via OAuth",
    "tags": ["remote", "project-management"]
  },
  "type": "remote",
  "url": "https://mcp.linear.app/mcp",
  "oauth": {}
}
```

Local MCP with environment variables:

File: `store/mcps/postgres.json`
```json
{
  "_meta": {
    "description": "PostgreSQL MCP — query and manage local databases",
    "tags": ["local", "database"]
  },
  "type": "local",
  "command": ["npx", "-y", "@modelcontextprotocol/server-postgres"],
  "environment": {
    "DATABASE_URL": "{env:DATABASE_URL}"
  }
}
```
