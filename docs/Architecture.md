# Architecture

## System shape

`skillful` is split into four conceptual layers:

- Interface layer: terminal views and keyboard-driven workflows.
- Application layer: startup routing, context detection, and view-model assembly.
- Domain layer: sources, store indexing, install state, and target capabilities.
- Persistence layer: user settings, project registry, source registry, and source cache.

## Why this layering exists

The layering keeps business rules independent from presentation details.

This allows:

- future UI evolution without rewriting source logic,
- target-specific behavior changes without rewriting browsing logic,
- source-system evolution without rewriting install semantics.

## Runtime lifecycle

At startup, the application:

- loads user settings,
- resolves active target,
- detects project context,
- loads merged content from configured sources,
- selects initial view.

If no enabled sources exist, the app still launches and defaults to Settings to guide bootstrap.

## View model strategy

The UI never works directly from raw source files.

Instead, it uses a normalized store view that combines:

- merged store metadata,
- active target support signals,
- install state,
- mismatch state.

This separation makes behavior consistent across categories and sources.

## Design choices to preserve

- Startup should remain fast and non-blocking.
- Background update checks should remain advisory.
- Install actions should be explicit and reversible.
- Source operations should degrade gracefully when a subset of sources fails.
