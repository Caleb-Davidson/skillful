# Projects

## Purpose

Project support lets users apply store content to a specific repository context without altering global defaults.

This is essential for teams and multi-repo workflows where each project has different constraints.

## Project context model

The app detects project context from known repository markers.

This enables automatic scope-aware behavior without requiring users to toggle modes manually.

## Why project registry exists

The registry is a convenience and consistency feature.

It allows users to:

- maintain a curated list of active projects,
- switch quickly between projects,
- optionally assign a per-project default target.

## Design principles

- Registration should be simple and reversible.
- Project naming should be human-friendly and stable.
- Per-project preferences should not leak into global defaults.

## Behavior to preserve

- Entering a project should auto-register it when appropriate.
- Removing a project should affect only registry metadata.
- Project mode operations should mutate project scope only.

## Project-local multi-target

A project may declare a multi-target selection by committing `skillful.targets.json` at its root. This file is checked in with the repo and shared with collaborators, separate from the per-user project registry. See [Targets](Targets.md) for the rollup and installation semantics.
