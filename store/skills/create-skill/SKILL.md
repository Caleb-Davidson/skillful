---
name: create-skill
description: Create new agent skills following OpenCode documentation. Use when you need to create, write, or scaffold a SKILL.md file with proper structure.
license: MIT
compatibility: opencode
metadata:
  audience: developers
  domain: opencode
  platform: universal
---

# Agent Skills Definition

Skills are reusable behavior definitions loaded on-demand via the `skill` tool. They encapsulate workflows, conventions, or procedures that agents invoke when needed.

## Skill Location

Skills exist as `SKILL.md` files inside dedicated folders:

- **Project-scoped**: `.opencode/skills/<skill-name>/SKILL.md`
- **Global-scoped**: `~/.config/opencode/skills/<skill-name>/SKILL.md`

The folder name must match the skill's `name` in its frontmatter.

## Required Metadata

Every skill begins with YAML frontmatter containing these fields:

```markdown
---
name: <skill-identifier>
description: <brief-description>
license: <optional-license>             # optional, e.g. MIT, Apache-2.0
compatibility: <optional-compatibility> # optional, e.g. opencode
metadata:                                # optional, omit entire block if not needed
  <key>: <value>
---
```

| Field | Requirements |
|-------|--------------|
| `name` | 1-64 characters, lowercase alphanumeric with single hyphens, never starts or ends with `-`, no consecutive hyphens |
| `description` | 1-256 characters, plain text. Embed usage context implicitly in how the description is written. |
| `license` | Optional. Common values: `MIT`, `Apache-2.0`, `GPL-3.0`. Omit the line entirely if not applicable. |
| `compatibility` | Optional. Defaults to `opencode`. Omit the line entirely if not applicable. |
| `metadata` | Optional key-value pairs for extra context. Useful keys: `audience` (e.g. `developers`, `maintainers`), `domain` (e.g. `git`, `docker`, `opencode`), `platform` (e.g. `node`, `python`, `universal`). Omit entire block if no metadata. |

### Valid Name Pattern

```
^[a-z0-9]+(-[a-z0-9]+)*$
```

Valid: `git-release`, `code-review`, `terraform-plan`  
Invalid: `Git-Release`, `code_review`, `-review`, `code--review`

## Content Structure

After frontmatter, write freeform Markdown containing execution instructions. The format depends on the skill type:

**Imperative** (procedural skills):
```
1. Do this first
2. Then do this
3. Finally do this
```

**Conditional** (decision-making skills):
```
- If X applies: do Y
- If A applies: do B
- Otherwise: do C
```

**Reference** (conventions or standards):
```
When doing X, follow these rules:
- Rule one
- Rule two
```

## Example

```markdown
---
name: git-release
description: Automates semantic versioning, changelog generation from conventional commits, annotated tagging, and GitHub registry publishing
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  domain: git
  platform: universal
---

1. Run `npm run version` or `pnpm version` to bump the version
2. Generate changelog using `standard-changelog`
3. Commit with message "chore(release): X.X.X"
4. Create annotated tag: `git tag -a vX.X.X -m "Release vX.X.X"`
5. Push with tags: `git push && git push --tags`
6. The GitHub Actions workflow publishes to the registry
```

## Permission Configuration

Control skill visibility in `opencode.json`:

```json
{
  "permission": {
    "skill": {
      "*": "allow",
      "private-*": "deny",
      "sensitive-*": "ask"
    }
  }
}
```

| Setting | Behavior |
|---------|----------|
| `allow` | Loads immediately when invoked |
| `deny` | Hidden from available skills list |
| `ask` | Prompts user for approval before loading |

Pattern matching supports wildcards (`*`).

## Creating a Skill

1. Choose a valid name matching the regex `^[a-z0-9]+(-[a-z0-9]+)*$`
2. Create the directory at your preferred location
3. Write the `SKILL.md` with frontmatter followed by execution instructions
4. Invoke via the `skill` tool to use