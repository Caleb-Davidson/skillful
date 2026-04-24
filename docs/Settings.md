# Settings and Preferences

## Purpose

Settings provide durable user preferences that shape startup and operational defaults.

They reduce repeated setup work while keeping explicit control in user hands.

## Preference categories

Two preference surfaces matter most:

- default target selection,
- default startup view.

Together they control how quickly users reach their most common workflow.

## Why Settings includes source management

Sources are the primary catalog input, so they are treated as user-level operating configuration rather than project metadata.

Grouping source controls in Settings keeps discovery and bootstrap in one place.

## Interaction goals

- fast keyboard-first operations,
- clear status visibility for each source,
- immediate feedback after actions,
- live refresh without restart.

## First-run experience

When no enabled sources exist, the app defaults to Settings.

This turns a potentially confusing empty state into a guided setup path.

## Persistence boundaries

- Settings affect global app behavior.
- Source registry affects catalog composition.
- Project registry remains separate to avoid conflating user-wide and project-specific concerns.
