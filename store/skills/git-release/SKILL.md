---
name: git-release
description: Create consistent releases with changelogs and version bumps
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  workflow: github
---

## What I do

- Draft release notes from merged PRs and commits since the last tag
- Propose a semantic version bump based on conventional commits
- Generate a formatted changelog entry
- Provide a copy-pasteable `gh release create` command

## When to use me

Use this skill when you are preparing a tagged release. I will analyze the commit history since the last release tag and help you create a well-documented release.

## Process

1. Find the latest release tag with `git describe --tags --abbrev=0`
2. Collect commits since that tag
3. Categorize changes (features, fixes, breaking changes)
4. Determine version bump (major/minor/patch)
5. Generate release notes in markdown format
6. Provide the release command

## Version bump rules

- **BREAKING CHANGE** or `!` in commit → major bump
- `feat:` → minor bump
- `fix:`, `perf:` → patch bump
- Everything else → patch bump
