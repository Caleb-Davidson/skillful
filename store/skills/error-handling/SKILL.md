---
name: error-handling
description: Implement consistent error handling patterns across the codebase
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: implementation
---

## What I do

- Establish consistent error handling patterns
- Define custom error classes with proper hierarchies
- Implement error boundaries and recovery strategies
- Ensure errors are logged, reported, and user-friendly

## Patterns

### Custom error classes
Create domain-specific error types that extend a base error:
- `AppError` (base) → `ValidationError`, `NotFoundError`, `AuthError`, `ConflictError`
- Include error codes, HTTP status mappings, and serialization

### Error boundaries
- Wrap async operations in try/catch with proper error transformation
- Use Result types (`{ ok, data } | { ok, error }`) for expected failures
- Reserve exceptions for unexpected/unrecoverable errors

### Logging
- Log the full error (stack, context) server-side
- Return sanitized messages to clients (never leak internals)
- Include correlation IDs for tracing

## When to use me

Use this skill when setting up error handling for a new service, or when refactoring inconsistent error handling in an existing codebase.
