---
name: create-store-skill
description: Guided process to create a new skill entry in the opencode-manager store
compatibility: opencode
metadata:
  audience: developers
  workflow: store-authoring
---

## What I do

Walk the user through creating a new OpenCode agent skill and adding it to the `store/skills/` directory in this repo.

## When to use me

Use this skill when the user wants to add a new skill to the opencode-manager store.

## Process

Ask the user the following questions in a single message. Do not proceed until all are answered:

1. **Name** — The skill identifier (lowercase alphanumeric with hyphens, e.g. `git-release`). This becomes the directory name and must match the `name` field in frontmatter.
2. **Description** — A one-line summary of what the skill does (required, 1-1024 characters). This is shown in the TUI and used by agents to decide when to load the skill.
3. **License** — Optional. e.g. `MIT`, `Apache-2.0`. Leave blank to omit.
4. **Compatibility** — Optional. Defaults to `opencode`. Leave blank to omit.
5. **Metadata** — Optional key-value pairs for extra context. Useful keys:
   - `audience` (e.g. `developers`, `maintainers`)
   - `domain` (e.g. `git`, `docker`, `opencode`)
   - `platform` (e.g. `node`, `python`, `universal`)
   Leave blank to omit.
6. **Skill content** — The full markdown body. This is what gets injected into the agent's context when the skill is loaded. It should include:
   - **What I do** — bullet list of capabilities
   - **When to use me** — guidance for when this skill is appropriate
   - Any procedures, rules, templates, or reference material the agent needs

## Output format

Once the user provides all the information, create the directory `store/skills/<name>/` and the file `store/skills/<name>/SKILL.md` with this exact format:

```markdown
---
name: <name>
description: <description>
license: <license>             # omit line entirely if blank
compatibility: <compatibility> # omit line entirely if blank
metadata:                      # omit entire block if no metadata
  <key>: <value>
---

<skill content>
```

## After creating the file

Run `npm run index` (which executes `tsx src/build-index.ts`) to regenerate `index.json` with the new skill included. Report the updated item count to the user.

## Validation rules

- Name must be 1-64 characters, lowercase alphanumeric with single hyphen separators. Regex: `^[a-z0-9]+(-[a-z0-9]+)*$`
- Name must not start or end with `-` and must not contain `--`.
- Name must not conflict with an existing directory in `store/skills/`.
- Description is required, 1-1024 characters.
- The directory name must exactly match the `name` field in frontmatter.
- Metadata values must be strings.

## Example

For a user who wants a "docker-deploy" skill:

Directory: `store/skills/docker-deploy/`
File: `store/skills/docker-deploy/SKILL.md`
```markdown
---
name: docker-deploy
description: Build, tag, and deploy Docker containers to a registry
license: MIT
compatibility: opencode
metadata:
  audience: devops
  domain: docker
  platform: universal
---

## What I do

- Build Docker images with proper tagging conventions
- Push to container registries (ECR, Docker Hub, GCR)
- Generate docker-compose files for multi-service deployments
- Create Dockerfiles following best practices (multi-stage builds, minimal layers)

## When to use me

Use this skill when you need to containerize an application or set up a Docker-based deployment pipeline.

## Tagging convention

Images are tagged as: `<registry>/<repo>:<version>-<git-sha-short>`

## Dockerfile best practices

- Use specific base image tags, never `latest`
- Order layers from least to most frequently changing
- Use multi-stage builds to minimize image size
- Run as non-root user
- Use .dockerignore to exclude unnecessary files
```
