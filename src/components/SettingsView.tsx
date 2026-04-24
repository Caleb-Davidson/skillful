import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { UserSettings, AppView, TargetId, StoreSource } from "../lib/types.js";
import { loadSettings, saveSettings, getSettingsPath } from "../lib/settings.js";
import { listTargetIds } from "../lib/target-manager.js";
import { checkEnabledSourcesForUpdates, checkSourceForUpdatesById, fetchSourceById } from "../lib/source-sync.js";
import {
  addSource,
  createSourceId,
  getSourceRegistryPath,
  loadSourceRegistry,
  removeSource,
  reorderSource,
  toggleSourceEnabled,
} from "../lib/sources.js";

interface SettingsViewProps {
  onSwitchView: (view: AppView) => void;
  onSourcesChanged?: () => void | Promise<void>;
}

interface SettingOption {
  key: string;
  label: string;
  description: string;
  currentValue: () => string;
  cycle: () => void;
}

export default function SettingsView({ onSwitchView, onSourcesChanged }: SettingsViewProps) {
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [sources, setSources] = useState<StoreSource[]>(() => loadSourceRegistry().sources);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<"list" | "add">("list");
  const [inputValue, setInputValue] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function persist(updated: UserSettings) {
    saveSettings(updated);
    setSettings(updated);
  }

  function refreshSources() {
    setSources(loadSourceRegistry().sources);
  }

  function notifySourcesChanged(): void {
    if (!onSourcesChanged) return;
    void Promise.resolve(onSourcesChanged()).catch(() => {
      // Non-fatal.
    });
  }

  const targetIds = listTargetIds();
  const viewOptions: (AppView | "auto")[] = ["auto", "manage", "projects", "settings"];

  const options: SettingOption[] = [
    {
      key: "defaultTarget",
      label: "Default Target",
      description: "Target adapter used when --target is not specified",
      currentValue: () => settings.defaultTarget ?? "opencode",
      cycle: () => {
        const current = settings.defaultTarget ?? "opencode";
        const idx = targetIds.indexOf(current as TargetId);
        const next = targetIds[(idx + 1) % targetIds.length];
        const updated = { ...settings, defaultTarget: next };
        persist(updated);
        setMessage(`Default target set to: ${next}`);
      },
    },
    {
      key: "defaultView",
      label: "Default View",
      description: "Which view to show on startup (auto = detect from cwd)",
      currentValue: () => settings.defaultView ?? "auto",
      cycle: () => {
        const current = settings.defaultView ?? "auto";
        const idx = viewOptions.indexOf(current);
        const next = viewOptions[(idx + 1) % viewOptions.length];
        const updated = { ...settings, defaultView: next };
        persist(updated);
        setMessage(`Default view set to: ${next}`);
      },
    },
  ];

  const settingCount = options.length;
  const totalRows = settingCount + sources.length;
  const maxIndex = Math.max(0, totalRows - 1);
  const selectedSource = selectedIndex >= settingCount ? sources[selectedIndex - settingCount] : null;

  function deriveNameFromUrl(url: string): string {
    const cleaned = url.replace(/\.git$/i, "").replace(/\/$/, "");
    const segments = cleaned.split(/[/:]/).filter((segment) => segment.length > 0);
    return segments[segments.length - 1] ?? "source";
  }

  function ensureUniqueSourceId(baseId: string): string {
    const existing = new Set(sources.map((source) => source.id));
    if (!existing.has(baseId)) return baseId;

    let idx = 2;
    while (existing.has(`${baseId}-${idx}`)) {
      idx += 1;
    }
    return `${baseId}-${idx}`;
  }

  function handleAddSubmit(value: string): void {
    const trimmed = value.trim();
    if (!trimmed) {
      setMode("list");
      setInputValue("");
      return;
    }

    const name = deriveNameFromUrl(trimmed);
    const id = ensureUniqueSourceId(createSourceId(name));
    const result = addSource({
      id,
      name,
      url: trimmed,
      enabled: true,
    });

    refreshSources();
    setMode("list");
    setInputValue("");

    const latest = loadSourceRegistry().sources;
    const idx = latest.findIndex((source) => source.id === result.source.id);
    if (idx >= 0) {
      setSelectedIndex(settingCount + idx);
    }

    if (result.added) {
      setMessage(`Added source: ${result.source.name}`);
      notifySourcesChanged();
    } else {
      setMessage(`Source already exists: ${result.source.name}`);
    }
  }

  async function checkSelectedSource(): Promise<void> {
    if (!selectedSource) return;
    setBusy(`Checking ${selectedSource.name}...`);
    const status = await checkSourceForUpdatesById(selectedSource.id);
    refreshSources();
    setBusy(null);

    if (!status) {
      setMessage("Error: source not found");
      return;
    }
    if (status.error) {
      setMessage(`Error: ${status.error}`);
      return;
    }
    if (status.hasUpdate) {
      setMessage(`${status.sourceName}: update available`);
    } else {
      setMessage(`${status.sourceName}: up to date`);
    }
  }

  async function fetchSelectedSource(): Promise<void> {
    if (!selectedSource) return;
    setBusy(`Updating ${selectedSource.name}...`);
    const updated = await fetchSourceById(selectedSource.id);
    refreshSources();
    setBusy(null);

    if (!updated) {
      setMessage("Error: source not found");
      return;
    }
    if (updated.lastError) {
      setMessage(`Error: ${updated.lastError}`);
      return;
    }
    setMessage(`${updated.name}: refreshed to ${updated.indexedHead?.slice(0, 8) ?? "unknown"}`);
  }

  async function checkAllSources(): Promise<void> {
    setBusy("Checking all enabled sources...");
    const statuses = await checkEnabledSourcesForUpdates();
    refreshSources();
    setBusy(null);

    const updates = statuses.filter((status) => status.hasUpdate).length;
    if (updates > 0) {
      setMessage(`Updates available from ${updates} source${updates === 1 ? "" : "s"}`);
    } else {
      setMessage("All enabled sources are up to date");
    }
  }

  useInput((input, key) => {
    if (mode === "add") {
      if (key.escape) {
        setMode("list");
        setInputValue("");
      }
      return;
    }

    if (busy) return;

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      setMessage(null);
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(maxIndex, prev + 1));
      setMessage(null);
      return;
    }

    // Enter or Space = cycle setting or toggle source enablement.
    if (key.return || input === " ") {
      if (selectedIndex < settingCount) {
        options[selectedIndex].cycle();
      } else if (selectedSource) {
        const updated = toggleSourceEnabled(selectedSource.id);
        refreshSources();
        if (updated) {
          setMessage(`${updated.name}: ${updated.enabled ? "enabled" : "disabled"}`);
          notifySourcesChanged();
        }
      }
      return;
    }

    if (!selectedSource) {
      if (input === "a") {
        setMode("add");
        setInputValue("");
        setMessage(null);
        return;
      }
      if (input === "c") {
        void checkAllSources();
        return;
      }
      if (key.tab) {
        onSwitchView("manage");
      }
      return;
    }

    if (input === "[") {
      if (reorderSource(selectedSource.id, "up")) {
        refreshSources();
        const nextIdx = Math.max(settingCount, selectedIndex - 1);
        setSelectedIndex(nextIdx);
        setMessage(`${selectedSource.name}: moved up`);
        notifySourcesChanged();
      }
      return;
    }

    if (input === "d") {
      const removed = removeSource(selectedSource.id);
      if (removed) {
        refreshSources();
        setSelectedIndex((prev) => Math.min(prev, Math.max(settingCount, maxIndex - 1)));
        setMessage(`Removed source: ${selectedSource.name}`);
        notifySourcesChanged();
      }
      return;
    }

    if (input === "]") {
      if (reorderSource(selectedSource.id, "down")) {
        refreshSources();
        const nextIdx = Math.min(maxIndex, selectedIndex + 1);
        setSelectedIndex(nextIdx);
        setMessage(`${selectedSource.name}: moved down`);
        notifySourcesChanged();
      }
      return;
    }

    if (input === "u") {
      void checkSelectedSource();
      return;
    }

    if (input === "f") {
      void fetchSelectedSource().then(() => {
        notifySourcesChanged();
      });
      return;
    }

    if (input === "c") {
      void checkAllSources();
      return;
    }

    if (input === "a") {
      setMode("add");
      setInputValue("");
      setMessage(null);
      return;
    }

    // Tab = cycle to next view (settings -> manage -> projects -> settings)
    if (key.tab) {
      onSwitchView("manage");
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="cyan">Skillful</Text>
          <Text color="gray"> - Settings</Text>
        </Box>
        <Text color="gray">Configure defaults and connected store sources</Text>
      </Box>

      <Box>
        <Text color="gray">{"-".repeat(72)}</Text>
      </Box>

      <Box flexDirection="column">
        {options.map((opt, i) => {
          const selected = i === selectedIndex;
          return (
            <Box key={opt.key} flexDirection="column">
              <Box>
                <Text>
                  <Text color={selected ? "cyan" : "white"} bold={selected}>
                    {selected ? " > " : "   "}
                  </Text>
                  <Text color={selected ? "cyan" : "white"} bold={selected}>{opt.label}</Text>
                  <Text color="gray"> - </Text>
                  <Text color="yellow" bold>{opt.currentValue()}</Text>
                </Text>
              </Box>
              {selected && (
                <Box marginLeft={5}>
                  <Text color="gray">{opt.description}</Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text bold color="cyan">Sources (priority order)</Text>
      </Box>

      <Box flexDirection="column">
        {sources.length === 0 ? (
          <Text color="gray">  No sources configured. Press 'a' to add one.</Text>
        ) : (
          sources.map((source, i) => {
            const rowIndex = settingCount + i;
            const selected = rowIndex === selectedIndex;
            const hasUpdate = Boolean(source.lastKnownRemoteHead && source.indexedHead && source.lastKnownRemoteHead !== source.indexedHead);
            return (
              <Box key={source.id}>
                <Text>
                  <Text color={selected ? "cyan" : "white"} bold={selected}>
                    {selected ? " > " : "   "}
                  </Text>
                  <Text color={selected ? "cyan" : "white"} bold={selected}>{source.name}</Text>
                  <Text color="gray"> ({source.id})</Text>
                  <Text color={source.enabled ? "green" : "gray"}>{source.enabled ? " [enabled]" : " [disabled]"}</Text>
                  {hasUpdate && <Text color="yellow"> [update]</Text>}
                  {source.lastError && <Text color="red"> [error]</Text>}
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      {selectedSource && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          marginTop={1}
        >
          <Text>
            <Text bold color="cyan">{selectedSource.name}</Text>
            <Text color="gray"> ({selectedSource.id})</Text>
          </Text>
          <Text>
            <Text color="gray">URL: </Text>
            <Text>{selectedSource.url}</Text>
          </Text>
          <Text>
            <Text color="gray">Branch: </Text>
            <Text color="yellow">{selectedSource.branch ?? "remote HEAD"}</Text>
          </Text>
          <Text>
            <Text color="gray">Indexed head: </Text>
            <Text dimColor>{selectedSource.indexedHead ?? "unknown"}</Text>
          </Text>
          <Text>
            <Text color="gray">Remote head: </Text>
            <Text dimColor>{selectedSource.lastKnownRemoteHead ?? "unchecked"}</Text>
          </Text>
          <Text>
            <Text color="gray">Last checked: </Text>
            <Text dimColor>{selectedSource.lastCheckedAt ? new Date(selectedSource.lastCheckedAt).toLocaleString() : "never"}</Text>
          </Text>
          {selectedSource.lastError && (
            <Text color="red">{selectedSource.lastError}</Text>
          )}
        </Box>
      )}

      {mode === "add" && (
        <Box marginTop={1}>
          <Text color="cyan">Source Git URL: </Text>
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleAddSubmit}
            placeholder="https://github.com/org/skillful-store.git"
          />
        </Box>
      )}

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginTop={1}
      >
        <Text>
          <Text color="gray">Settings file: </Text>
          <Text dimColor>{getSettingsPath()}</Text>
        </Text>
        <Text>
          <Text color="gray">Sources file: </Text>
          <Text dimColor>{getSourceRegistryPath()}</Text>
        </Text>
      </Box>

      {(busy || message) && (
        <Box marginTop={1}>
          {busy ? <Text color="yellow">{busy}</Text> : <Text color={message?.startsWith("Error") ? "red" : "green"}>{message}</Text>}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray">
          ↑/↓ navigate  Enter/Space cycle-toggle  a add source  d remove source  [ ] reorder source  u check source  f update source  c check all  Tab next view  q quit
        </Text>
      </Box>
    </Box>
  );
}
