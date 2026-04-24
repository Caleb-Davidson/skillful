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

Only the active target adapter is loaded at startup.

Why this matters:

- lower startup overhead,
- smaller runtime surface for each session,
- cleaner separation of optional integrations.

## OpenCode adapter intent

The OpenCode adapter is the primary full-support reference.

Its behavior emphasizes:

- preserving user configuration shape,
- safe merge/remove semantics,
- clear global versus project separation,
- cached reads for responsive interaction.
