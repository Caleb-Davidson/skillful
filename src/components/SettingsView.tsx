import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { UserSettings, AppView, TargetId } from "../lib/types.js";
import { loadSettings, saveSettings, getSettingsPath } from "../lib/settings.js";
import { listTargetIds } from "../lib/target-manager.js";

interface SettingsViewProps {
  onSwitchView: (view: AppView) => void;
}

interface SettingOption {
  key: string;
  label: string;
  description: string;
  currentValue: () => string;
  cycle: () => void;
}

export default function SettingsView({ onSwitchView }: SettingsViewProps) {
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  function persist(updated: UserSettings) {
    saveSettings(updated);
    setSettings(updated);
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

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      setMessage(null);
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(options.length - 1, prev + 1));
      setMessage(null);
      return;
    }

    // Enter or Space = cycle value
    if (key.return || input === " ") {
      options[selectedIndex].cycle();
      return;
    }

    // Tab = cycle to next view (settings → manage → projects → settings)
    if (key.tab) {
      onSwitchView("manage");
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="cyan">Skillful</Text>
          <Text color="gray"> — Settings</Text>
        </Box>
        <Text color="gray">Configure default behavior for skillful</Text>
      </Box>

      {/* Separator */}
      <Box>
        <Text color="gray">{"─".repeat(72)}</Text>
      </Box>

      {/* Settings list */}
      <Box flexDirection="column">
        {options.map((opt, i) => {
          const selected = i === selectedIndex;
          return (
            <Box key={opt.key} flexDirection="column">
              <Box>
                <Text>
                  <Text color={selected ? "cyan" : "white"} bold={selected}>
                    {selected ? " ▸ " : "   "}
                  </Text>
                  <Text color={selected ? "cyan" : "white"} bold={selected}>
                    {opt.label}
                  </Text>
                  <Text color="gray"> — </Text>
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

      {/* Config file path */}
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
      </Box>

      {/* Message bar */}
      {message && (
        <Box marginTop={1}>
          <Text color="green">{message}</Text>
        </Box>
      )}

      {/* Help bar */}
      <Box marginTop={1}>
        <Text color="gray">
          ↑/↓ navigate  Enter/Space cycle value  Tab next view  q quit
        </Text>
      </Box>
    </Box>
  );
}
