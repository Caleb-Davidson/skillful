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
