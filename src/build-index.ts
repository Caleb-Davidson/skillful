#!/usr/bin/env node
/**
 * Builds an index.json for a local store directory.
 * If ./store does not exist, falls back to ./skillful-store/store.
 * Also updates README.md when section markers are present.
 * Run: npm run index
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndexFromStorePath } from "./lib/store.js";
import type { StoreIndex, StoreItemMeta } from "./lib/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getProjectRoot(): string {
  let dir = __dirname;
  while (dir !== "/" && !fs.existsSync(path.join(dir, "package.json"))) {
    dir = path.dirname(dir);
  }
  if (dir === "/") {
    throw new Error("Could not locate project root (package.json not found).");
  }
  return dir;
}

function resolveStoreAndOutputRoot(projectRoot: string): { storePath: string; outputRoot: string } {
  const primaryStorePath = path.join(projectRoot, "store");
  if (fs.existsSync(primaryStorePath)) {
    return { storePath: primaryStorePath, outputRoot: projectRoot };
  }

  const splitStoreRoot = path.join(projectRoot, "skillful-store");
  const splitStorePath = path.join(splitStoreRoot, "store");
  if (fs.existsSync(splitStorePath)) {
    return { storePath: splitStorePath, outputRoot: splitStoreRoot };
  }

  throw new Error("No store directory found. Expected ./store or ./skillful-store/store.");
}

function generateReadmeSection(index: StoreIndex): string {
  const agents = index.items.filter((i) => i.type === "agent");
  const commands = index.items.filter((i) => i.type === "command");
  const skills = index.items.filter((i) => i.type === "skill");
  const providers = index.items.filter((i) => i.type === "provider");
  const mcps = index.items.filter((i) => i.type === "mcp");

  const table = `| Category | Count | Format | Installed to (global) | Installed to (project) |
|----------|-------|--------|-----------------------|------------------------|
| **Agents** | ${agents.length} | Markdown with frontmatter | \`~/.config/opencode/agents/\` | \`.opencode/agents/\` |
| **Commands** | ${commands.length} | Markdown with frontmatter | \`~/.config/opencode/commands/\` | \`.opencode/commands/\` |
| **Skills** | ${skills.length} | \`SKILL.md\` in named folders | \`~/.config/opencode/skills/<name>/\` | \`.opencode/skills/<name>/\` |
| **Providers** | ${providers.length} | JSON config blocks | \`provider.<id>\` in \`~/.config/opencode/opencode.json\` | \`provider.<id>\` in \`./opencode.json\` |
| **MCP Servers** | ${mcps.length} | JSON config blocks | \`mcp.<id>\` in \`~/.config/opencode/opencode.json\` | \`mcp.<id>\` in \`./opencode.json\` |`;

  const formatList = (items: StoreItemMeta[], prefix = "") =>
    items
      .map((i) => `- **${prefix}${i.name}** — ${i.description}`)
      .join("\n");

  const commandList = commands.map((i) => `- **/${i.name}** — ${i.description}`).join("\n");

  return `${table}

### Agents

${formatList(agents) || "_No agents available_"}

### Commands

${commandList || "_No commands available_"}

### Skills

${formatList(skills) || "_No skills available_"}

### Providers

${formatList(providers) || "_No providers available_"}

### MCP Servers

${formatList(mcps) || "_No MCP servers available_"}`;
}

function updateReadme(index: StoreIndex, outputRoot: string): void {
  const readmePath = path.join(outputRoot, "README.md");
  if (!fs.existsSync(readmePath)) {
    return;
  }
  const readmeContent = fs.readFileSync(readmePath, "utf-8");

  const startMarker = "## What's in the store";
  const endMarker = "## Install";

  const startIndex = readmeContent.indexOf(startMarker);
  const endIndex = readmeContent.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    console.warn("Could not find README section markers, skipping README update");
    return;
  }

  const newSection = `${startMarker}\n\n${generateReadmeSection(index)}\n\n`;
  const newReadme = readmeContent.slice(0, startIndex) + newSection + readmeContent.slice(endIndex);

  fs.writeFileSync(readmePath, newReadme, "utf-8");
  console.log("Updated README.md with current store contents");
}

const projectRoot = getProjectRoot();
const { storePath, outputRoot } = resolveStoreAndOutputRoot(projectRoot);
const index = buildIndexFromStorePath(storePath);
const outPath = path.join(outputRoot, "index.json");
fs.writeFileSync(outPath, JSON.stringify(index, null, 2) + "\n", "utf-8");
console.log(`Wrote index.json with ${index.items.length} items`);

updateReadme(index, outputRoot);
