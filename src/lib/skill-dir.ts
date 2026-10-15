/**
 * A skill is its whole directory: SKILL.md plus any supporting files. These
 * helpers hash and install that directory as one unit.
 */
import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "./hash.js";

/** OS metadata files that appear in folders on their own and are never skill content. */
const IGNORED_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** Whether `id` can name a skill folder: one path segment, so joining it never escapes `skills/`. */
export function isSafeSkillId(id: string): boolean {
  return id.length > 0 && id !== "." && id !== ".." && !/[\\/:\0]/.test(id);
}

/** A file's text with line endings normalized to LF, or a digest of its bytes when it isn't UTF-8. */
function fileFingerprint(file: string): string {
  const bytes = fs.readFileSync(file);
  try {
    return utf8.decode(bytes).replace(/\r\n?/g, "\n");
  } catch {
    return `binary:${sha256Hex(bytes.toString("base64"))}`;
  }
}

/**
 * Fingerprint every file under a skill directory. Entries are sorted by their
 * `/`-joined relative path, text line endings are normalized to LF, and OS
 * metadata files are skipped, so the hash is stable across platforms and
 * checkout line-ending settings.
 */
export function hashSkillDir(dirPath: string): string {
  const entries: { rel: string; content: string }[] = [];
  function walk(currentDir: string, prefix: string): void {
    for (const item of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (IGNORED_FILES.has(item.name)) continue;
      const full = path.join(currentDir, item.name);
      const rel = prefix === "" ? item.name : `${prefix}/${item.name}`;
      if (item.isDirectory()) {
        walk(full, rel);
      } else if (item.isFile()) {
        entries.push({ rel, content: fileFingerprint(full) });
      }
    }
  }
  walk(dirPath, "");
  entries.sort((a, b) => a.rel.localeCompare(b.rel));
  return sha256Hex(JSON.stringify(entries));
}

/**
 * Replace `destDir` with a copy of `srcDir`, so no file removed from the source lingers.
 * Refuses unless `destDir` is a named folder directly inside a `skills` folder.
 */
export function replaceSkillDir(srcDir: string, destDir: string): void {
  const id = path.basename(destDir);
  if (!isSafeSkillId(id) || path.basename(path.dirname(destDir)) !== "skills") {
    throw new Error(`Refusing to replace '${destDir}': not a skill folder inside a skills directory.`);
  }
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  fs.cpSync(srcDir, destDir, { recursive: true });
}
