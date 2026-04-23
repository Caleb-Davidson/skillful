---
name: create-store-provider
description: Guided process to create a new provider entry in the skillful store
compatibility: opencode
metadata:
  audience: developers
  workflow: store-authoring
---

## What I do

Walk the user through creating a new OpenCode provider configuration and adding it to the `store/providers/` directory in this repo.

## When to use me

Use this skill when the user wants to add a new provider config to the skillful store.

## Background

Providers in OpenCode configure how the tool connects to LLM APIs. A provider config block lives under `provider.<id>` in `opencode.json` and can include options (API keys, regions, profiles, timeouts) and model definitions.

In the store, provider JSON files have an extra `_meta` block for display in the TUI. On install, `_meta` is stripped and everything else is written to `opencode.json`.

## Process

Ask the user the following questions in a single message. Do not proceed until all are answered:

1. **Name** — The provider identifier (lowercase, hyphenated, e.g. `amazon-bedrock`). This becomes the filename and the key under `provider.<name>` in opencode.json.
2. **Description** — A one-line summary for the TUI (required, e.g. "Amazon Bedrock us-east-1 with Claude Haiku 4.5").
3. **Tags** — Optional list of tags for filtering in the TUI (e.g. `aws`, `bedrock`, `us-east-1`).
4. **Options** — The provider options object. Common fields:
   - `apiKey` — API key, often using variable substitution: `{env:SOME_KEY}`
   - `region` — AWS region (for Bedrock)
   - `profile` — AWS named profile (for Bedrock)
   - `endpoint` — Custom endpoint URL
   - `timeout` — Request timeout in ms
   - `chunkTimeout` — Timeout between streamed chunks in ms
5. **Models** — Optional models object. Each key is a model ID, value has a `name` field for display. Leave blank for an empty models object.

## Output format

Once the user provides all the information, create the file at `store/providers/<name>.json` with this exact format:

```json
{
  "_meta": {
    "description": "<description>",
    "tags": ["<tag1>", "<tag2>"]
  },
  "options": {
    <options fields>
  },
  "models": {
    <model entries, or empty object>
  }
}
```

Omit the `"tags"` field inside `_meta` if no tags were provided. Omit the `"models"` key entirely if the user explicitly says no models. Omit `"options"` if no options were provided.

## After creating the file

Run `npm run index` (which executes `tsx src/build-index.ts`) to regenerate `index.json` with the new provider included. Report the updated item count to the user.

## Validation rules

- Name must be lowercase alphanumeric with hyphens, no spaces.
- Name must not conflict with an existing file in `store/providers/`.
- Description is required.
- The `_meta` block is required and must have at least a `description`.
- API keys should use `{env:VARIABLE_NAME}` substitution, never hardcoded values.
- The JSON must be valid and properly formatted with 2-space indentation.

## Example

For a user who wants to add an Anthropic provider with a custom timeout:

File: `store/providers/anthropic-slow.json`
```json
{
  "_meta": {
    "description": "Anthropic provider with extended timeout for long-running tasks",
    "tags": ["anthropic", "direct"]
  },
  "options": {
    "apiKey": "{env:ANTHROPIC_API_KEY}",
    "timeout": 600000,
    "chunkTimeout": 60000
  }
}
```
