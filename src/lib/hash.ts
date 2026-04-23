import { createHash } from "node:crypto";

export function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n?/g, "\n");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashNormalizedText(input: string): string {
  return sha256Hex(normalizeLineEndings(input));
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeJson(entry));
  }

  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const key of Object.keys(input).sort()) {
      const normalized = canonicalizeJson(input[key]);
      if (normalized !== undefined) {
        output[key] = normalized;
      }
    }

    return output;
  }

  return value;
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}

export function hashCanonicalJson(value: unknown): string {
  return sha256Hex(stableJsonStringify(value));
}
