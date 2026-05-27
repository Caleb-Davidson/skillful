# Targets

## Why targets exist

`skillful` manages content for multiple downstream environments.

Targets abstract environment-specific installation behavior away from the shared store workflow.

This keeps the browsing and selection experience consistent while allowing each environment to evolve independently.

## Adapter model

Each target provides an adapter with responsibilities for:

- install-state detection,
- install and uninstall behavior,
- capability signaling,
- optional mismatch support.

## Capability signaling

Not every target supports every category equally.

Capability metadata exists so the interface can:

- prevent unsupported operations,
- communicate partial support clearly,
- avoid silent failures.

## Lazy activation

Only the configured target adapter(s) are loaded at startup.

Why this matters:

- lower startup overhead,
- smaller runtime surface for each session,
- cleaner separation of optional integrations.

## Multi-target sessions

A project can opt into multi-target by committing `skillful.targets.json` at its root:

```json
{ "targets": ["claude-code", "opencode"] }
```

When multi-target is active:

- the store view shows the **superset** of items visible to any configured target,
- each row carries a **rollup status** — `installed`, `missing-in-some`, `older-version`, `not-installed`, or `unsupported`,
- install/uninstall actions are **atomic across all eligible targets** — partial installs are not exposed as a user action,
- items only some targets support are still shown, badged with their eligible target list.

The detail panel exposes the per-target breakdown for transparency. Mismatch detection fans out across targets in parallel.

## Precedence

For a given session:

1. `--target <id>` flag (forces single-target and locks the session),
2. `skillful.targets.json` at the active project root,
3. project registry per-project `defaultTarget`,
4. user-settings `defaultTarget`,
5. built-in fallback (`opencode`).

## OpenCode adapter intent

The OpenCode adapter is the primary full-support reference.

Its behavior emphasizes:

- preserving user configuration shape,
- safe merge/remove semantics,
- clear global versus project separation,
- cached reads for responsive interaction.
