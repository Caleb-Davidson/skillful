/**
 * User settings persistence.
 * Stored at ~/.config/skillful/settings.json
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { UserSettings } from "./types.js";

const CONFIG_DIR = path.join(os.homedir(), ".config", "skillful");
const SETTINGS_PATH = path.join(CONFIG_DIR, "settings.json");

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/** Load user settings. Returns defaults if file doesn't exist. */
export function loadSettings(): UserSettings {
  if (!fs.existsSync(SETTINGS_PATH)) return {};
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
    return JSON.parse(raw) as UserSettings;
  } catch {
    return {};
  }
}

/** Save user settings to disk. */
export function saveSettings(settings: UserSettings): void {
  ensureConfigDir();
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

/** Get the path to the settings file (for display in the TUI). */
export function getSettingsPath(): string {
  return SETTINGS_PATH;
}
