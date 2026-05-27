# Architecture Decisions

This file captures durable decisions that shape the system.

## Sources are external git repos

Decision:

- The application repo is not the content source of truth.

Why:

- decouples application release cadence from content updates,
- supports separate personal, work, and team catalogs,
- enables independent ownership and review flows.

## Cached per-source indexes are runtime artifacts

Decision:

- Per-source indexes are generated locally from cached clones.

Why:

- avoids startup rescans when content is unchanged,
- keeps source-repo requirements minimal,
- supports offline startup with previously indexed data.

## Priority-first collision resolution

Decision:

- First source by priority wins for duplicate `(type, id)`.

Why:

- deterministic behavior,
- intentional overrides,
- no ambiguous install targets.

## App remains usable without sources

Decision:

- No enabled sources is not an error state.

Why:

- improves first-run onboarding,
- reduces operator friction,
- avoids unnecessary startup failures.

## Target adapters isolate environment behavior

Decision:

- Installation and detection logic are adapter-owned.

Why:

- prevents cross-target coupling,
- keeps support-level messaging explicit,
- allows gradual target maturity.

## Project mode is scope-safe

Decision:

- Project operations do not implicitly mutate global configuration.

Why:

- protects user-wide defaults,
- prevents accidental global drift,
- keeps project workflows predictable.

## Multi-target installs are atomic

Decision:

- When a project declares multiple targets in `skillful.targets.json`, install/uninstall actions fan out to every eligible target and are not exposed as per-target operations.

Why:

- avoids drift between toolchains within one project,
- matches the user's mental model ("this skill is part of my project"),
- keeps the row UI legible — one rollup status per item, with per-target detail one step away.

## skillful.targets.json lives in the repo

Decision:

- Multi-target selection is project-local and checked into the repository, not stored in the per-user project registry.

Why:

- collaborators on the same repo share the same target set without re-configuring,
- avoids conflating per-user preferences (registry) with shared project intent,
- keeps the per-user registry's optional `defaultTarget` available as a single-target override path.
