/**
 * Agent file format conversion for sync.
 *
 * Claude Code / OpenCode agents are markdown with YAML frontmatter and a body.
 * Codex agents are flat TOML with the body in an `instructions` string.
 *
 * This module reads either format into a common shape and writes back to
 * either format. It is intentionally narrow:
 *
 *   - top-level scalar/array frontmatter fields,
 *   - one multiline body / `instructions` string.
 *
 * Nested tables and arrays-of-tables are not supported (agent files do not use them).
 */
import matter from "gray-matter";

export type AgentFormat = "md" | "toml";

export interface ParsedAgent {
  /** Frontmatter / top-level fields, minus the body. */
  fields: Record<string, unknown>;
  /** Markdown body or TOML `instructions` string, with trailing newline stripped. */
  body: string;
}

export interface ConvertResult {
  /** Serialized agent file in the target format. */
  output: string;
  /** Human-readable warnings about lossy fields. */
  warnings: string[];
}

export function detectFormat(filePath: string): AgentFormat {
  return filePath.toLowerCase().endsWith(".toml") ? "toml" : "md";
}

// ── Parsing ─────────────────────────────────────────────────────────────────

export function parseAgent(raw: string, format: AgentFormat): ParsedAgent {
  return format === "toml" ? parseTomlAgent(raw) : parseMdAgent(raw);
}

function parseMdAgent(raw: string): ParsedAgent {
  const parsed = matter(raw);
  const fields = (parsed.data ?? {}) as Record<string, unknown>;
  return { fields, body: parsed.content.replace(/\n+$/, "") };
}

/**
 * Parse the narrow TOML subset agent files use:
 *   key = "scalar"
 *   key = 12
 *   key = true
 *   key = ["a", "b"]
 *   key = """multi-line string"""
 * Comments (#) and blank lines are skipped. Nested tables are not supported.
 */
function parseTomlAgent(raw: string): ParsedAgent {
  const fields: Record<string, unknown> = {};
  const lines = raw.split(/\r?\n/);
  let bodyKey: string | null = null;
  let body = "";

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      i += 1;
      continue;
    }

    // Table header — ignored, but stops top-level parsing.
    if (trimmed.startsWith("[")) {
      break;
    }

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) {
      i += 1;
      continue;
    }

    const key = line.slice(0, eqIdx).trim();
    const valueText = line.slice(eqIdx + 1).trimStart();

    // Multi-line basic string starts with """.
    if (valueText.startsWith('"""')) {
      let collected = valueText.slice(3);
      // Same-line close.
      const sameLineEnd = collected.indexOf('"""');
      if (sameLineEnd !== -1) {
        fields[key] = decodeTomlString(collected.slice(0, sameLineEnd));
        i += 1;
        continue;
      }
      // Multi-line — gather until closing """.
      const chunks: string[] = [];
      if (collected !== "") chunks.push(collected);
      i += 1;
      while (i < lines.length) {
        const next = lines[i];
        const endIdx = next.indexOf('"""');
        if (endIdx !== -1) {
          chunks.push(next.slice(0, endIdx));
          i += 1;
          break;
        }
        chunks.push(next);
        i += 1;
      }
      // TOML """ ... """ trims a leading newline if it immediately follows the opener.
      let stringValue = chunks.join("\n");
      if (stringValue.startsWith("\n")) stringValue = stringValue.slice(1);
      stringValue = decodeTomlString(stringValue);
      if (key === "instructions" || key === "prompt") {
        bodyKey = key;
        body = stringValue;
      } else {
        fields[key] = stringValue;
      }
      continue;
    }

    fields[key] = parseTomlInlineValue(valueText);
    i += 1;
  }

  // If `instructions` was a single-line string, lift it into body.
  if (bodyKey === null) {
    if (typeof fields.instructions === "string") {
      body = fields.instructions as string;
      delete fields.instructions;
    } else if (typeof fields.prompt === "string") {
      body = fields.prompt as string;
      delete fields.prompt;
    }
  }

  return { fields, body };
}

function parseTomlInlineValue(text: string): unknown {
  const trimmed = stripInlineComment(text).trim();
  if (trimmed === "") return "";

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  if (trimmed.startsWith('"')) {
    return decodeTomlString(stripBasicString(trimmed));
  }

  if (trimmed.startsWith("[")) {
    return parseTomlArray(trimmed);
  }

  const asNumber = Number(trimmed);
  if (!Number.isNaN(asNumber) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return asNumber;
  }

  // Bare unquoted — return as string.
  return trimmed;
}

function stripBasicString(text: string): string {
  if (!text.startsWith('"')) return text;
  const endIdx = text.indexOf('"', 1);
  return endIdx === -1 ? text.slice(1) : text.slice(1, endIdx);
}

function stripInlineComment(text: string): string {
  // Drop `# comment` outside of quoted strings. Narrow scope: only basic strings.
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' && text[i - 1] !== "\\") inString = !inString;
    if (ch === "#" && !inString) return text.slice(0, i);
  }
  return text;
}

function parseTomlArray(text: string): unknown[] {
  const inner = text.replace(/^\[/, "").replace(/\]\s*$/, "").trim();
  if (inner === "") return [];
  const items: unknown[] = [];
  let depth = 0;
  let inString = false;
  let buf = "";
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === '"' && inner[i - 1] !== "\\") inString = !inString;
    if (!inString) {
      if (ch === "[") depth += 1;
      else if (ch === "]") depth -= 1;
      else if (ch === "," && depth === 0) {
        items.push(parseTomlInlineValue(buf));
        buf = "";
        continue;
      }
    }
    buf += ch;
  }
  if (buf.trim() !== "") items.push(parseTomlInlineValue(buf));
  return items;
}

function decodeTomlString(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

// ── Serialization ───────────────────────────────────────────────────────────

export function serializeAgent(parsed: ParsedAgent, format: AgentFormat): string {
  return format === "toml" ? serializeAgentToml(parsed) : serializeAgentMd(parsed);
}

function serializeAgentMd(parsed: ParsedAgent): string {
  const hasFields = Object.keys(parsed.fields).length > 0;
  // gray-matter has a stringify but it depends on js-yaml internally; we emit a
  // minimal-but-correct YAML by hand to avoid pulling that surface into ours.
  const frontmatter = hasFields ? `---\n${toYaml(parsed.fields)}---\n\n` : "";
  const body = parsed.body.replace(/\n+$/, "");
  return `${frontmatter}${body}\n`;
}

function serializeAgentToml(parsed: ParsedAgent): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(parsed.fields)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      // Nested object — drop with a comment; agent files shouldn't carry them
      // across the boundary in v1.
      lines.push(`# ${key}: dropped (nested table not supported across formats)`);
      continue;
    }
    lines.push(`${key} = ${tomlValue(value)}`);
  }
  if (parsed.body.trim() !== "") {
    if (lines.length > 0) lines.push("");
    lines.push(`instructions = """\n${escapeTomlMultiline(parsed.body)}\n"""`);
  }
  return `${lines.join("\n")}\n`;
}

function tomlValue(value: unknown): string {
  if (typeof value === "string") return tomlString(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : '""';
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return `[${value.map((v) => tomlValue(v)).join(", ")}]`;
  }
  return tomlString(String(value));
}

function tomlString(value: string): string {
  if (value.includes("\n")) {
    return `"""\n${escapeTomlMultiline(value)}\n"""`;
  }
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeTomlMultiline(value: string): string {
  // Multi-line basic strings allow literal newlines; only escape \\ and """ closers.
  return value.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"');
}

// Minimal, deterministic YAML emitter for frontmatter shapes we see in
// agent files: top-level scalars, arrays of scalars, and one level of nested
// `key: value` objects (e.g. `tools: { write: false }`).
function toYaml(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
        continue;
      }
      lines.push(`${key}:`);
      for (const entry of value) {
        lines.push(`  - ${yamlScalar(entry)}`);
      }
      continue;
    }
    if (typeof value === "object") {
      const nested = value as Record<string, unknown>;
      const keys = Object.keys(nested);
      if (keys.length === 0) {
        lines.push(`${key}: {}`);
        continue;
      }
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(nested)) {
        lines.push(`  ${k}: ${yamlScalar(v)}`);
      }
      continue;
    }
    lines.push(`${key}: ${yamlScalar(value)}`);
  }
  return `${lines.join("\n")}\n`;
}

function yamlScalar(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (value === null || value === undefined) return '""';
  const str = String(value);
  // Quote when the value would otherwise be parsed as something else,
  // contains special chars, or has surrounding whitespace.
  if (
    str === "" ||
    /^(true|false|null|yes|no)$/i.test(str) ||
    /^[-+]?\d/.test(str) ||
    /[:#&*!|>'"%@`,{}\[\]]/.test(str) ||
    /^\s|\s$/.test(str)
  ) {
    return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return str;
}

// ── Conversion ──────────────────────────────────────────────────────────────

const TARGET_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  opencode: "OpenCode",
  codex: "Codex",
};

/**
 * Convert an agent file from one format to another. Returns the serialized
 * output plus a list of human-readable warnings for fields that travel across
 * a vocabulary boundary (currently `tools` and `model`).
 */
export function convertAgent(
  raw: string,
  from: AgentFormat,
  to: AgentFormat,
  context?: { fromTarget?: string; toTarget?: string; id?: string }
): ConvertResult {
  const parsed = parseAgent(raw, from);
  const warnings: string[] = [];

  if (from !== to) {
    const id = context?.id ?? "(agent)";
    const fromLabel = TARGET_LABELS[context?.fromTarget ?? ""] ?? from.toUpperCase();
    const toLabel = TARGET_LABELS[context?.toTarget ?? ""] ?? to.toUpperCase();

    if (Object.prototype.hasOwnProperty.call(parsed.fields, "tools")) {
      warnings.push(
        `${id}: 'tools' was copied verbatim from ${fromLabel} → ${toLabel}. Tool names differ per target (e.g. Claude uses 'Bash', 'Read'; Codex uses 'shell', 'apply_patch'). Edit the file before use.`
      );
    }
    if (Object.prototype.hasOwnProperty.call(parsed.fields, "model")) {
      warnings.push(
        `${id}: 'model' was copied verbatim from ${fromLabel} → ${toLabel}. Model identifiers differ per target (e.g. 'sonnet' is not a Codex model). Edit the file before use.`
      );
    }
  }

  return { output: serializeAgent(parsed, to), warnings };
}
