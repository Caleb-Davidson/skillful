/**
 * A skill is its whole directory: SKILL.md plus any supporting files. These
 * helpers hash and install that directory as one unit.
 */
import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "./hash.js";

/**
 * Fingerprint every file under a skill directory. Entries are sorted by their
 * `/`-joined relative path and CRLF is normalized to LF, so the hash is stable
 * across platforms and checkout line-ending settings.
 */
export function hashSkillDir(dirPath: string): string {
  const entries: { rel: string; content: string }[] = [];
  function walk(currentDir: string, prefix: string): void {
    for (const item of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const full = path.join(currentDir, item.name);
      const rel = prefix === "" ? item.name : `${prefix}/${item.name}`;
      if (item.isDirectory()) {
        walk(full, rel);
      } else if (item.isFile()) {
        entries.push({ rel, content: fs.readFileSync(full, "utf-8").replace(/\r\n/g, "\n") });
      }
    }
  }
  walk(dirPath, "");
  entries.sort((a, b) => a.rel.localeCompare(b.rel));
  return sha256Hex(JSON.stringify(entries));
}

/** Replace `destDir` with a copy of `srcDir`, so no file removed from the source lingers. */
export function replaceSkillDir(srcDir: string, destDir: string): void {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  fs.cpSync(srcDir, destDir, { recursive: true });
}
