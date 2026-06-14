# AGENTS

High-signal project guide for contributors and coding agents.

## Architecture Hub

**Important Documentation:**
Before working on any system, you **MUST** read the relevant architecture document. These documents explain the "what" and "why" and are the source of truth for intent.

- **[System Overview](docs/Overview.md)**: Product purpose, goals, non-goals, and guiding principles for `skillful`.
- **[Application Architecture](docs/Architecture.md)**: Core system shape, layering, runtime lifecycle, and constraints to preserve.
- **[Source System Architecture](docs/Sources.md)**: Multi-source model, cache/index strategy, update flow, and priority-based merge behavior.
- **[Store Domain Architecture](docs/Store.md)**: Store model, item identity, scope behavior, and mismatch rationale.
- **[Target Adapter Architecture](docs/Targets.md)**: Why adapter abstraction exists and how target capability differences are handled.
- **[Project Context Architecture](docs/Projects.md)**: Project detection/registry intent and project-specific behavior boundaries.
- **[Settings Architecture](docs/Settings.md)**: Defaults, source management intent, persistence boundaries, and first-run UX.
- **[Sync Architecture](docs/Sync.md)**: Mirroring user-authored custom items across configured targets, conflict policy, and agent format conversion.
- **[Agent CLI](docs/Agent-CLI.md)**: Non-interactive, JSON-only subcommand surface for automated callers (AI agents); command grammar, output contract, and explicit scope/target rules.
- **[Architecture Decisions](docs/Decisions.md)**: Durable decisions and the rationale behind them.
- **[Operational Playbook](docs/Operational-Playbook.md)**: Failure modes, expected behavior, and maintenance guidance.

## Project intent

`skillful` is the TUI app/repo. Store content lives in separate git repos and is loaded via configured sources.

## Current architecture

```text
src/
  cli.tsx                    # entrypoint and startup routing
  components/
    StoreApp.tsx             # app shell + view switching
    SettingsView.tsx         # settings + source management UI
    ProjectsView.tsx         # project registry UI
  lib/
    source-sync.ts           # clone/fetch/check/index for git sources
    sources.ts               # source registry persistence and helpers
    store.ts                 # scan store directories + merge by priority
    target-manager.ts        # adapter selection, multi-target rollup, install fan-out
    project-targets.ts       # loads project-local skillful.targets.json
    agent-format.ts          # MD ↔ TOML agent conversion (used by sync)
    sync.ts                  # discovery, conflict detection, mirror execution
    agent-cli/               # non-interactive JSON CLI over the same lib functions
      dispatch.ts            # verb-noun routing + single-envelope emission
      parser.ts              # zero-dep `verb noun [id] --flags` argv parser
      output.ts              # envelope build, exit-code map, type projections
      resolve.ts             # scope/target/project resolution (explicit-flag contract)
      types.ts               # CommandDef/CommandContext/CliError + envelope types
      commands/              # registered commands: sources, items, meta (schema/version)
    targets/
      opencode-store.ts      # install/uninstall/read/write for OpenCode
      *.ts                   # target adapters
```

## Source system (important)

- Registry: `~/.config/skillful/sources.json`
- Cache: `~/.cache/skillful/sources/<sourceId>/repo`
- Cached per-source index: `~/.cache/skillful/sources/<sourceId>/index.json`
- Repo format expected:

```text
store/
  agents/
  commands/
  skills/
  providers/
  mcps/
```

- Priority merge rule: first source by priority wins for duplicate `(type,id)`.

## Behavioral rules

- If no enabled sources exist, app still launches and defaults to **Settings**.
- Source add/remove/reorder/enable/disable should refresh in-memory store content.
- Source checks are async/best-effort and must not crash the UI.

## Removed legacy behavior

- No repo-local `store/` source of truth.
- No `src/build-index.ts` workflow.
- No root `index.json` generation workflow.

## Dev commands

- `npm run dev`
- `npm run build`
- `npm run start`
