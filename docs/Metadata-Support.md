# Metadata Support

## Purpose

This document defines which store metadata fields are interpreted by `skillful`, which are only indexed for display/search tags, and which are passed through to target adapters.

The goal is to keep store authoring predictable and avoid assumptions that every frontmatter key changes behavior.

## Identity and merge behavior

Item identity is based on `(type, id)` and source priority determines winners on collisions.

- `type` comes from folder category (`agents`, `commands`, `skills`, `providers`, `mcps`).
- `id` comes from filename/folder naming conventions.
- Frontmatter does not override identity.

## Behavior-driving metadata

These fields currently affect `skillful` logic directly.

### Agent (`store/agents/<id>.md`)

- `description` (`string`, optional): used for display text fallback.
- `targets` (`string | string[]`, optional): target allow-list. If present, item is shown only for listed targets.

### Command (`store/commands/<id>.md`)

- `description` (`string`, optional): used for display text fallback.
- `targets` (`string | string[]`, optional): target allow-list. If present, item is shown only for listed targets.

### Skill (`store/skills/<folder>/SKILL.md`)

- `name` (`string`, required): if missing, skill is skipped.
- `description` (`string`, required): if missing, skill is skipped.
- `targets` (`string | string[]`, optional): target allow-list. If present, item is shown only for listed targets.

### Provider (`store/providers/<id>.json`)

- `_meta.description` (`string`, required): if missing, provider is skipped.

### MCP (`store/mcps/<id>.json`)

- `_meta.description` (`string`, required): if missing, MCP item is skipped.

## Target allow-list (`targets`)

When `targets` is omitted, the item is visible for all targets.

Supported target IDs:

- `opencode`
- `claude-code`
- `codex`

Accepted formats:

```yaml
targets: opencode
```

```yaml
targets: [opencode, codex]
```

Invalid/unknown target values are ignored. If no valid values remain, the item is treated as unscoped (visible to all targets).

## Indexed-for-tags metadata (not logic-driving)

These fields are currently converted into tags for browsing/context, but do not change install/update logic by themselves.

### Agent

- `mode` -> tag (defaults to `subagent` when absent)
- `model` -> provider prefix tag (text before `/`)

### Command

- `agent` -> `agent:<value>` tag

### Skill

- `license` -> `license:<value>` tag
- `compatibility` -> `<value>` tag
- `metadata` object -> `<key>:<value>` tags

### Target tags

When `targets` is provided for agent/command/skill, `skillful` also appends `target:<id>` tags for visibility and debugging.

## Opaque/pass-through fields

Additional frontmatter keys are allowed and preserved as source content for downstream target tools, but `skillful` does not currently interpret them for UI state or filtering.

Examples include agent fields such as `tools`, `permission`, `temperature`, `top_p`, etc.

## UI display policy

The TUI intentionally shows normalized fields only:

- name
- description
- tags
- install/support state
- store path
- source label/id

It does not render arbitrary frontmatter/JSON metadata fields directly.

## Authoring guidance

- Use `description` on all item types for clear browsing UX.
- Use `targets` only when an item is truly target-specific.
- Prefer portable metadata first; add target-specific constraints only when necessary.
