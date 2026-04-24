# Store Domain

## What the store represents

The store is a logical catalog of installable content, merged from enabled sources.

Each entry is represented as metadata plus state:

- metadata identifies what the item is,
- state identifies whether and how it is installed for the active target and scope.

## Why the store is normalized

Different content types are authored differently, but user decisions are similar.

A normalized model allows one interaction pattern for all categories:

- browse,
- inspect,
- install/uninstall,
- detect drift.

## Item identity

Identity is stable within a category and source-defined through category-specific naming conventions.

Cross-source merging uses `(type, id)` as collision key to preserve deterministic behavior.

## Install scopes

The store supports two operational scopes:

- global scope,
- project scope.

Project scope is intentionally non-destructive to global state. Global installs can be visible as context without being mutated.

## Mismatch detection

Installed content can diverge from source content over time.

Mismatch signaling exists to:

- make drift explicit,
- preserve user intent before overwrite,
- support confident update flows.

## Store-path transparency

Each visible item retains source provenance so users can understand where content came from.

This is important for trust, debugging, and collaboration in multi-source setups.
