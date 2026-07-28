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

## Sync is additive only

Decision:

- `skillful sync` only adds missing copies of user-authored custom items across configured targets. It never deletes or renames.

Why:

- additive operations cannot lose work users explicitly hand-authored,
- pruning is a distinct operation that needs its own UX (rename detection, "are you sure", undo) and is deferred,
- keeps the v1 mental model simple: sync brings other targets up to the union, nothing more.

## Sync refuses on content conflicts

Decision:

- When the same `(type, id)` exists in more than one configured target with diverging content, sync refuses to write and reports the conflict.

Why:

- a "lead target wins" default would silently overwrite hand-authored work,
- divergence is surfaced exactly when the user has the context to resolve it,
- the report applies both to "missing in some, divergent in others" and "present everywhere, contents differ" cases, so drift never accumulates unnoticed.

## Sync requires multi-target config and rejects --target

Decision:

- `skillful sync` only runs in projects whose root contains `skillful.targets.json` with at least two targets, and is incompatible with the `--target` flag.

Why:

- `--target` forces single-target mode, which makes sync a no-op,
- per-user multi-target overrides are not a shared decision the way `skillful.targets.json` is, so they are not a safe basis for an operation that writes into project files,
- this keeps sync's contract obvious: it operates on the same target set the project itself opted into.

## Sync converts agent formats with lossy field carryover

Decision:

- When sync copies a custom agent between markdown-targets (Claude Code, OpenCode) and the TOML-target (Codex), it converts the file. The `tools` and `model` fields are carried verbatim, and a warning notes that those vocabularies differ per target.

Why:

- portable fields (`description`, body / `instructions`) translate cleanly and cover most of what an agent is,
- dropping `tools` and `model` silently would lose structure the user can fix in one edit; keeping them with a warning preserves intent without claiming correctness,
- store-shipped agents are never auto-converted — the store ships paired artifacts for those — so the lossy path is scoped to user-authored customs.

## Non-portable command frontmatter is stripped on install and on compare

Decision:

- When the store installs a command, target-recognized but non-portable frontmatter keys are dropped from the file written to disk. The same keys are dropped from the installed file before drift comparison. The list lives in `NON_PORTABLE_COMMAND_FIELDS` in `src/lib/store.ts`; today it is `["model"]`.

Why:

- both Claude Code and OpenCode accept `model:` in command frontmatter, but the value vocabularies differ per target (e.g. `sonnet` is not an OpenCode provider/model id), so a source-shipped value is wrong on at least one target,
- stripping on both write and compare lets users set a local `model:` preference without the item showing as drifted, which would force them to choose between their preference and reinstalls,
- centralizing the list keeps the policy expandable — `effort` or future non-portable keys can be added in one place and the install/compare pipelines stay aligned.

## Include items install to the project root as frontmatter-free markdown

Decision:

- The `include` item type ships plain markdown from `store/includes/<id>.md` and installs it to the project root as `<project>/<id>.md`, so a project's `AGENTS.md` can pull it in with an `@<id>.md` reference. Include files carry no frontmatter; the store listing description is derived from the first heading/line. Includes are Claude-Code-only and project-scoped — a global install is attempted and refused by the adapter, mirroring the CLAUDE.md-redirect `config` item.

Why:

- an always-in-context shared instruction block (e.g. a common agent workflow) belongs inlined via `@include`, not loaded on demand like a skill — `AGENTS.md` already composes this way with `@docs/*.md`, so the mechanism is idiomatic rather than new,
- frontmatter would render as literal text where the file is `@`-included, so the type deliberately forbids it and derives its metadata from the content instead,
- the project root install path (rather than a `.claude/` subdirectory) keeps the `@`-reference short and matches the existing CLAUDE.md-redirect precedent for project-root files,
- distributing the shared block through the store lets one edit propagate to every repo via `skillful install`, while each repo keeps its own project-specific companion files (e.g. a `project-context` skill) untouched.
