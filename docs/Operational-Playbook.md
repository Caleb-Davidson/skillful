# Operational Playbook

## Reliability posture

`skillful` is designed so read and browse workflows remain available even when parts of the source network fail.

The expected posture is graceful degradation, not fail-fast termination.

## Common operational scenarios

### No sources configured

- Expected behavior: app opens in Settings.
- Operator action: add at least one source and run source refresh.

### Source check fails

- Expected behavior: failure is reported per source, app remains usable.
- Operator action: inspect source URL, auth, and network state.

### Source fetch succeeds but content is empty

- Expected behavior: source remains configured; merged catalog may have fewer items.
- Operator action: verify source repository format and branch content.

### Duplicate IDs across catalogs

- Expected behavior: highest-priority source wins deterministically.
- Operator action: adjust source order when override intent changes.

### Local modifications differ from source

- Expected behavior: mismatch state is surfaced before overwrite.
- Operator action: choose overwrite only when drift should be reconciled.

## Maintenance guidance

- Keep source IDs stable once shared.
- Prefer explicit source naming for human readability.
- Treat source-priority changes as behavior changes and communicate them.
- Keep target support messaging accurate to avoid unsafe assumptions.

## Future evolution constraints

Any future changes should preserve:

- deterministic merge behavior,
- non-destructive project scope isolation,
- best-effort async source checks,
- startup usability with zero configured sources.
