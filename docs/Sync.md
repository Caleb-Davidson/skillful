# Sync

## Why sync exists

A multi-target project (one that has committed [`skillful.targets.json`](Targets.md)) installs the same store items across every configured toolchain atomically.

That coverage stops at the store boundary. Anything a user hand-authors directly under one target's install directory — a custom slash command in `.claude/commands/`, a one-off skill in `.opencode/skills/`, a project agent in `.codex/agents/` — is invisible to the rest of the targets in the project.

Sync closes that gap. It discovers items present in any configured target but unknown to the merged store index, and mirrors them additively across the other configured targets so a custom command authored once is available everywhere.

## Scope

Sync is intentionally narrow in v1:

- **Categories:** agents, commands, skills. MCPs and providers are out of scope.
- **Locality:** project-scoped only. Requires `skillful.targets.json` with at least two targets.
- **Direction:** additive. Sync never deletes or renames; pruning is a separate operation.
- **Identity:** only items whose `(type, id)` is absent from the merged store index are considered "custom." Items present in the store — even if hand-edited in place — are the store's responsibility and are skipped.
- **Install kind:** file-installed items only. JSON-installed customs (OpenCode's `opencode.json` agent/command keys) are not considered for sync in v1.

## Surfacing as a subcommand

Sync runs as a non-interactive subcommand, not through the TUI:

```bash
skillful sync
skillful sync --yes
skillful sync --dry-run
```

Reasons for keeping it out of the store UI:

- the questions and warnings are flow-shaped (per-category batched prompts, format conversion confirmations, conflict reports), not row-shaped;
- the operation is occasional rather than browsing-driven;
- a CLI flow keeps it scriptable.

`--target` forces single-target mode and is therefore incompatible with `sync`.

## Conflict policy: refuse + report

Sync refuses to write any item whose content disagrees across the targets where it already exists.

The policy applies both when one target is missing the item (would-be copy) and when every configured target already has its own divergent copy (nothing to copy).

Why this policy:

- silent overwrite would erase work the user explicitly hand-authored,
- divergence is surfaced exactly when the user has the context to resolve it,
- a single "lead target wins" default would be wrong as often as right.

Conflicts are listed at the end of every run. Resolution is left to the user — fix the file in one target and re-run.

## Format conversion: lossy and opt-in

Agents are markdown with YAML frontmatter for Claude Code and OpenCode, and TOML for Codex. Sync includes a converter for that boundary.

The converter is invoked only when a custom agent needs to cross the format boundary. It is interactive — the user confirms once per direction before any write — and emits a warning that the `tools` and `model` fields were carried verbatim across vocabularies that do not match.

Properties of the conversion:

- portable fields (`description`, `name`, body / `instructions`) are translated.
- `tools` and `model` are copied as-is so structure round-trips, with a clear note that names differ per target (Claude tool names vs. Codex tool names; model identifiers per provider).
- unknown frontmatter scalars and arrays pass through to TOML and back.

Store-shipped agents are never auto-converted. The store ships paired `.md` and `.toml` artifacts when needed; sync only converts user-authored customs.

## Codex caveats

Codex differs from the markdown-target pair in three ways that sync handles explicitly:

- **Skills are global-only.** In a project sync, the codex target is skipped for the skill category with a notice. Run `skillful sync` outside a project (future) to mirror skills globally.
- **Commands are unsupported.** Codex commands are skipped with a notice; the closest analog is a Codex skill.
- **Agents are TOML.** Cross-target copy requires conversion as described above.

## Run shape

Each run:

1. Resolves multi-target config and validates that sync applies (project + ≥2 targets + no `--target`).
2. Lists custom items per target across the in-scope categories.
3. Detects conflicts (content divergence across targets that already have the item).
4. Plans additive mirrors for items missing in one or more targets.
5. Prompts per category to apply (`y` / `n` / `d` for diff), per format conversion to confirm.
6. Executes confirmed mirrors, or prints them under `--dry-run`.
7. Prints a final report: applied, skipped, conflicts, warnings.

`--yes` collapses all prompts to yes. Conflicts are still surfaced; they are never auto-resolved.
