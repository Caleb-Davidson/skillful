# Overview

## What skillful is

`skillful` is a terminal application for managing OpenCode configuration content.

It helps users discover, install, update, and remove five categories of reusable content:

- agents
- commands
- skills
- providers
- MCP servers

## Why it exists

OpenCode customization is powerful, but manually managing many files across global and project scopes becomes error-prone.

`skillful` exists to provide:

- a single operational interface,
- deterministic behavior across environments,
- visibility into what is installed and where,
- safer updates with explicit overwrite behavior.

## Core product goals

- Make configuration operations understandable at a glance.
- Keep project-level changes isolated from global state unless explicitly chosen.
- Support multiple content catalogs (personal, work, team) without coupling content releases to application releases.
- Stay resilient when sources are unavailable or partially failing.

## Non-goals

- It is not a general package manager.
- It does not own source-repo authoring workflows.
- It does not require network availability to render the interface if cached data exists.

## Guiding principles

- Clarity over magic: users should always understand scope, source, and effect.
- Determinism over convenience: collisions resolve predictably by source priority.
- Isolation over side effects: project mode should not silently mutate global config.
- Best-effort background work: update checks should inform, never block.
