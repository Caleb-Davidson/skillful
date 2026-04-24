# Sources

## Purpose of the source system

The source system decouples application code from content catalogs.

This enables:

- independent lifecycle for store content,
- separate personal/work/team catalogs,
- organization-specific ownership and governance.

## Source contract

A source is a git repository containing a `store` directory with supported content categories.

The app treats source repositories as content inputs, not executable project dependencies.

## Local persistence

The source system uses three local persistence surfaces:

- source registry (configured sources and preferences),
- cached clone of each source,
- cached per-source index built from the cached clone.

This design supports fast startup and offline continuity.

## Priority and collision policy

When multiple sources define the same `(type, id)`, only the highest-priority entry is visible.

Why this policy exists:

- deterministic installs,
- predictable override behavior,
- reduced UI ambiguity.

## Update model

Source updates are intentionally split:

- check: compare remote head against local indexed head,
- fetch: refresh source cache and rebuild that source index.

Checks are asynchronous and best-effort so the UI remains responsive.

## Bootstrap behavior

If no enabled sources exist:

- app still launches,
- default landing view is Settings,
- user can add a source immediately.

This avoids startup failure and supports first-run onboarding.

## Constraints

- Source integrity is assumed at the content level; malformed entries are skipped rather than crashing the app.
- Source metadata changes should trigger live refresh of in-memory store content.
- Source operations should never require a full app restart.
