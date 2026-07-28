# Agent CLI

## Why it exists

The TUI is the human surface for browsing and managing the store. It is the wrong
surface for an automated caller: an AI agent (or a CI script) cannot drive an Ink
render loop, and it should never have to scrape prose to learn what happened.

The Agent CLI is a second, non-interactive front-end over the **same library
functions** the TUI calls. It exposes source management and per-item install/remove
as plain subcommands that emit machine-readable JSON and stable exit codes, so an
agent can add a source, list available skills, and install one into a project
without a human in the loop.

It adds no new domain logic. Every command is a thin handler that resolves context,
calls an existing `lib/` function, and prints a JSON envelope.

## The contract

Five guarantees the CLI makes to its caller. They exist because the caller is a
program, and a program is burned by ambiguity in ways a human browsing a list is not.

1. **One JSON object per invocation — always.** Success and failure both print a
   single envelope to stdout. There is no human-readable mode for these commands;
   the TUI and `skillful sync` remain the human surfaces.
2. **Never assume scope or target.** Item commands require `--scope` and `--target`
   explicitly. A missing flag is a usage error with a clear code — never a guessed
   default that silently writes to the wrong place.
3. **Validate fully before mutating.** All argument and flag validation completes
   before any disk or git write. A usage error never leaves partial state.
4. **Echo back what was resolved.** Every result reports the resolved scope, project
   directory, project name, and target list, so the caller can verify that reality
   matched intent.
5. **Idempotent where it is safe to be.** Re-installing overwrites; removing an absent
   item is a no-op success; adding an existing source is a no-op success. A typo that
   names something that does not exist still fails loudly.

## Grammar

The whole surface follows a single rule: `skillful <verb> <noun> [id] [flags]`.
The noun is singular when acting on one thing (`install skill pdf`) and plural when
listing a collection (`list skills`). There are two families.

### Sources (no `--scope`, no `--target`)

Sources are a single global registry (`~/.config/skillful/sources.json`). They are
neither scope- nor target-specific, so requiring those flags here would be noise.

| Command | Args / flags | Library call |
| --- | --- | --- |
| `list sources` | — | `listSources()` |
| `add source <url>` | `--id`, `--name`, `--branch` | `addSource()` then `ensureSourceIndexed()` |
| `remove source <id>` | — | `removeSource()` |
| `enable source <id>` | — | `toggleSourceEnabled()` |
| `disable source <id>` | — | `toggleSourceEnabled()` |
| `reorder source <id>` | `--direction up\|down` | `reorderSource()` |
| `update source <id>` | — (git fetch + reindex one) | `fetchSourceById()` |
| `check sources` | — (read-only remote check, all enabled) | `checkEnabledSourcesForUpdates()` |
| `check source <id>` | — (read-only remote check, one) | `checkSourceForUpdatesById()` |

`add source` adds the registry entry and then clones + indexes it so the items are
immediately listable. If the clone or index fails, the entry is still recorded (the
library stores the failure in `lastError` rather than throwing); the command returns
`ok: true` with a `warnings` entry and a populated `lastError` so the caller can see
the source was registered but is not yet usable.

### Items (`--scope` **and** `--target` required)

A matrix of four verbs over seven item types
(`agent` `command` `skill` `provider` `mcp` `config` `include`):

```text
list    <type>           # many   → buildStoreViewForTargets()[type]
info    <type> <id>      # one, detailed (item + per-target state)
install <type> <id>      # installItemForTarget() per eligible target
remove  <type> <id>      # uninstallItemForTarget() per installed target
```

`list` takes no id. `info` / `install` / `remove` take exactly one `<id>`; because the
type is named, identity `(type, id)` is fully specified, and the merged index already
dedupes to a single item per `(type, id)` by source priority — so there is never
ambiguity about which item an id refers to.

## Required flags and scope resolution

Every item command must carry:

- **`--scope global|project`** — no default.
- **`--target <id>`** — repeatable for multi-target, e.g.
  `--target opencode --target claude-code`. Valid: `opencode`, `claude-code`,
  `codex`. For `install` / `remove` it is a fan-out across the listed targets; for
  `list` / `info` it drives the multi-target rollup state.

Project directory resolution (when `--scope project`):

- **`--project <path>`** is optional. If given, it is trusted as the project root and
  its name is derived from git or the directory basename.
- If omitted, the current working directory is used **but must resolve to a real
  project** (contains `.git` or `.opencode`). If it does not, the command fails with
  `NOT_A_PROJECT` (exit 1) — a wrong-cwd assumption fails loud rather than writing to
  an unintended location.
- Either way, the resolved `projectDir` and `projectName` are echoed in the result.

Optional flags:

- **`--dry-run`** (install / remove) — resolve the item and targets and report what
  *would* change; write nothing.

## Output: the envelope

Every command emits exactly this shape:

```jsonc
{
  "schemaVersion": "1",
  "ok": true,
  "command": "install skill",
  "data": { /* command-specific; present iff ok */ },
  "warnings": ["..."],   // optional; may appear alongside data
  "error": null           // an object iff !ok (and then data is omitted)
}
```

Error form:

```jsonc
{
  "schemaVersion": "1",
  "ok": false,
  "command": "install skill",
  "error": {
    "code": "ITEM_NOT_FOUND",
    "message": "No skill with id 'pdf' in configured sources.",
    "details": { "type": "skill", "id": "pdf" }
  }
}
```

## Data shapes

These are deliberate **projections** of the internal types, not raw dumps — so the
agent contract stays stable even if `StoreItemMeta` / `InstalledState` change shape.

**Item** (projection of `StoreItemMeta` + `InstalledState`; `perTarget` is flattened,
since the internal type nests a full `InstalledState` per target):

```jsonc
{
  "id": "code-reviewer",
  "type": "agent",
  "name": "Code Reviewer",
  "description": "...",
  "tags": ["review"],
  "source": { "id": "anthropic", "label": "Anthropic Skills" },
  "storeHash": "ab12cd…",
  "targetIds": null,                 // null = all targets; or e.g. ["opencode"]
  "state": {
    "status": "missing-in-some",     // installed|missing-in-some|older-version|not-installed|unsupported
    "installed": false,              // true only when present in ALL eligible targets
    "supportMode": "yes",            // yes|partial|no
    "supportReason": null,
    "mismatch": false,
    "eligibleTargets": ["opencode", "claude-code"],
    "installedTargets": ["opencode"],
    "perTarget": [
      { "targetId": "opencode",    "eligible": true, "installed": true,  "mismatch": false, "installedVia": "file" },
      { "targetId": "claude-code", "eligible": true, "installed": false, "mismatch": false }
    ]
  }
}
```

**Source** (projection of `StoreSource`; drops internal head-tracking fields):

```jsonc
{
  "id": "anthropic",
  "name": "Anthropic Skills",
  "url": "https://github.com/…",
  "branch": "main",
  "enabled": true,
  "priority": 0,
  "lastIndexedAt": "2026-06-10T12:00:00Z",
  "lastError": null
}
```

**Action result** (`install` / `remove`):

```jsonc
{
  "item": { "type": "skill", "id": "pdf", "name": "PDF" },
  "scope": "project",
  "projectDir": "/abs/path/to/repo",
  "projectName": "repo",
  "requestedTargets": ["opencode", "claude-code", "codex"],
  "eligibleTargets":  ["opencode", "claude-code"],
  "changedTargets":   ["opencode", "claude-code"],   // installed (or removed) here
  "skipped": [ { "targetId": "codex", "reason": "codex does not support 'skill' items." } ],
  "changed": true,
  "dryRun": false
}
```

**List result:**

```jsonc
{
  "scope": "project",
  "projectDir": "/abs/path/to/repo",
  "projectName": "repo",
  "targets": ["opencode"],
  "type": "skill",
  "count": 12,
  "items": [ /* <item> … */ ]
}
```

## Exit codes and error codes

The numeric exit lets a shell branch without parsing; `error.code` gives the precise
reason.

| Exit | Meaning | `error.code` values |
| --- | --- | --- |
| 0 | success (including idempotent no-ops) | — |
| 1 | usage / validation | `USAGE`, `MISSING_SCOPE`, `MISSING_TARGET`, `INVALID_TARGET`, `INVALID_SCOPE`, `NOT_A_PROJECT` |
| 2 | not found | `SOURCE_NOT_FOUND`, `ITEM_NOT_FOUND` |
| 3 | operation failed | `NOT_ELIGIBLE`, `OPERATION_FAILED`, `PARTIAL_FAILURE` |

## Idempotency

- `install <type> <id>` on an already-installed item re-installs (overwrites with
  current store content); `changed: true`.
- `remove <type> <id>` on an item that is not installed is a no-op; `ok: true`,
  `changed: false`.
- `add source <url>` whose id already exists is a no-op; `ok: true`, `changed: false`.
- `remove source <id>` / `update source <id>` / `check source <id>` against an unknown
  id returns `SOURCE_NOT_FOUND` (exit 2) — a typo surfaces rather than silently
  "succeeding".
- A multi-target install where at least one target throws returns `PARTIAL_FAILURE`
  (exit 3) with `changedTargets` listing the targets that did succeed.

## Introspection

- **`skillful schema`** prints the full command catalog as JSON — every command, its
  positional args, its flags, the data shape it returns, and the exit-code table — so
  an agent can discover the surface instead of scraping help text. The catalog is
  generated from the live command registry, so it never drifts from the real surface.
- **`skillful version`** prints the version as a JSON envelope (`data.version`),
  consistent with the rest of the surface rather than a bare `--version` string. The
  same version is also surfaced inside `schema` (`data.version`).

## Run shape

Each item command:

1. Parses argv and validates flags (`--scope`, `--target`, optional `--project`,
   `--dry-run`). Any failure here exits 1 before touching disk.
2. Resolves the project context from `--project` or cwd (enforcing `NOT_A_PROJECT`).
3. Loads the merged index via `loadMergedIndexFromConfiguredSources()` and the
   requested adapters via `initAdapters()`.
4. For `list`: builds the view with `buildStoreViewForTargets()` and returns the
   requested category. For `info`/`install`/`remove`: resolves the item by
   `(type, id)`, erroring `ITEM_NOT_FOUND` if absent.
5. Performs the action (or, under `--dry-run`, computes eligibility only) and prints
   the envelope.

Each source command resolves directly against the source registry / source-sync
helpers and prints the envelope; no scope or target resolution is involved.

## Implementation notes

This is a presentation layer; the build is mostly wiring.

- **Dispatch placement.** Route the verb-noun commands at the top of `main()` in
  `cli.tsx`, before the TUI `render()` path — the same place `sync` and `--update`
  are already handled. Keep the handlers in a dedicated module (`lib/agent-cli/`)
  so `cli.tsx` stays a router.
- **Argument parsing.** The existing parsing is ad-hoc (`hasFlag`, `parseSubcommand`).
  A small structured parser for `verb noun [id] --flags` fits the zero-extra-deps
  style of the project; no parser library is required.
- **New library exports.** `target-manager.ts` gains symmetric uninstall helpers:
  `uninstallItemForTargets(item, targetIds, ctx)` (bulk, mirrors `installItemForTargets`)
  and `uninstallItemForTarget(item, targetId, ctx)` (single, mirrors `installItemForTarget`).
  The item handler fans out with the *singular* per-target call so it can report exactly
  which targets changed even on partial failure. `remove` never routes through
  `toggleItemForTargets()`, since toggle would *install* an item that is not installed.
- **Output is a projection.** Map `StoreItemMeta` + `InstalledState` to the documented
  item shape in one place; never `JSON.stringify` the internal objects directly.
