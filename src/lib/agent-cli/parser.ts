// Minimal structured argv parser for `verb noun [id] --flags`.
// Zero dependencies; supports repeatable flags, `--flag=value`, `--flag value`,
// and boolean flags. Models flags as a name -> values multimap.

/** Parsed flag store. A boolean flag records an empty-string value. */
export interface ParsedFlags {
  /** Raw multimap. A boolean flag maps to `[""]`. */
  readonly values: Map<string, string[]>;
  /** First value for a flag, or undefined if absent. */
  getOne(name: string): string | undefined;
  /** All values for a repeatable flag (empty array if absent). */
  getAll(name: string): string[];
  /** Whether the flag appeared at all (including boolean form). */
  has(name: string): boolean;
}

function makeParsedFlags(values: Map<string, string[]>): ParsedFlags {
  return {
    values,
    getOne(name: string): string | undefined {
      const list = values.get(name);
      return list && list.length > 0 ? list[0] : undefined;
    },
    getAll(name: string): string[] {
      return values.get(name) ? [...(values.get(name) as string[])] : [];
    },
    has(name: string): boolean {
      return values.has(name);
    },
  };
}

/**
 * Parse argv into positionals and flags.
 *
 * Rules:
 *   --flag=value      → values["flag"] += "value"
 *   --flag value      → values["flag"] += "value" (consumes next token unless it
 *                       starts with "--")
 *   --flag            → boolean: values["flag"] += "" (when no following value)
 *   bare token        → positional
 *
 * Flags may repeat (e.g. multiple `--target`); all values are preserved in order.
 */
export function parseArgv(argv: string[]): { positionals: string[]; flags: ParsedFlags } {
  const positionals: string[] = [];
  const values = new Map<string, string[]>();

  const push = (name: string, value: string): void => {
    const existing = values.get(name);
    if (existing) {
      existing.push(value);
    } else {
      values.set(name, [value]);
    }
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        // --flag=value (value may be empty: --flag=)
        push(body.slice(0, eq), body.slice(eq + 1));
        continue;
      }
      // --flag possibly followed by a separate value token.
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        push(body, next);
        i += 1;
      } else {
        // Boolean flag.
        push(body, "");
      }
      continue;
    }
    positionals.push(token);
  }

  return { positionals, flags: makeParsedFlags(values) };
}
