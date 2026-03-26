import React, { useState, useMemo } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { StoreItemWithState, StoreItemType, StoreView, ProjectContext } from "../lib/types.js";
import { toggleItem, getInstalledState } from "../lib/config.js";

interface CategoryTabProps {
  label: string;
  count: number;
  installedCount: number;
  active: boolean;
}

function CategoryTab({ label, count, installedCount, active }: CategoryTabProps) {
  return (
    <Box>
      <Text>
        <Text bold={active} color={active ? "cyan" : "white"}>
          {active ? " ▸ " : "   "}
          {label}
        </Text>
        <Text color="gray">({installedCount}/{count})</Text>
      </Text>
    </Box>
  );
}

interface ItemRowProps {
  item: StoreItemWithState;
  selected: boolean;
  isProjectMode: boolean;
}

function ItemRow({ item, selected, isProjectMode }: ItemRowProps) {
  const isGlobalOnly = isProjectMode && !item.state.installed && item.state.globalInstalled;
  const icon = item.state.installed ? "✓" : isGlobalOnly ? "◆" : "○";
  const iconColor = item.state.installed ? "green" : isGlobalOnly ? "blue" : "gray";

  let displayName = item.name;
  if (item.type === "command") displayName = `/${item.name}`;

  return (
    <Box>
      <Text>
        <Text color={selected ? "cyan" : "white"} bold={selected}>
          {selected ? " ▸ " : "   "}
        </Text>
        <Text color={iconColor}>{icon}</Text>
        <Text> </Text>
        <Text color={selected ? "cyan" : "white"} bold={selected}>
          {displayName}
        </Text>
        {isGlobalOnly && <Text color="blue"> [global]</Text>}
        <Text color="gray"> — {item.description}</Text>
      </Text>
    </Box>
  );
}

interface DetailPanelProps {
  item: StoreItemWithState;
  isProjectMode: boolean;
}

function DetailPanel({ item, isProjectMode }: DetailPanelProps) {
  let displayName = item.name;
  if (item.type === "command") displayName = `/${item.name}`;

  const typeLabel: Record<StoreItemType, string> = {
    agent: "agent",
    command: "command",
    skill: "skill",
    provider: "provider",
    mcp: "mcp server",
  };

  const isGlobalOnly = isProjectMode && !item.state.installed && item.state.globalInstalled;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      marginTop={1}
    >
      <Box>
        <Text bold color="cyan">{displayName}</Text>
        <Text color="gray"> ({typeLabel[item.type]})</Text>
      </Box>
      <Text>{item.description}</Text>
      {item.tags.length > 0 && (
        <Text>
          <Text color="gray">Tags: </Text>
          <Text color="yellow">{item.tags.join(", ")}</Text>
        </Text>
      )}
      <Text>
        <Text color="gray">Status: </Text>
        {item.state.installed ? (
          <Text color="green">
            Installed{isProjectMode ? " (project)" : ""}{item.state.installedVia ? ` via ${item.state.installedVia}` : ""}
          </Text>
        ) : isGlobalOnly ? (
          <Text color="blue">
            Installed globally{" "}
            <Text color="gray">(not in project — press Enter to add to project)</Text>
          </Text>
        ) : (
          <Text color="gray">Not installed</Text>
        )}
      </Text>
      <Text>
        <Text color="gray">Store path: </Text>
        <Text dimColor>{item.path}</Text>
      </Text>
    </Box>
  );
}

export interface StoreAppProps {
  initialView: StoreView;
}

type Category = "agents" | "commands" | "skills" | "providers" | "mcps";
const CATEGORIES: { key: Category; label: string; type: StoreItemType }[] = [
  { key: "agents", label: "Agents", type: "agent" },
  { key: "commands", label: "Commands", type: "command" },
  { key: "skills", label: "Skills", type: "skill" },
  { key: "providers", label: "Providers", type: "provider" },
  { key: "mcps", label: "MCPs", type: "mcp" },
];

export default function StoreApp({ initialView }: StoreAppProps) {
  const { exit } = useApp();
  const [view, setView] = useState<StoreView>(initialView);
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const ctx: ProjectContext = view.context;
  const isProjectMode = ctx.mode === "project";

  const currentCategory = CATEGORIES[categoryIndex];
  const items = useMemo(() => view[currentCategory.key] as StoreItemWithState[], [view, currentCategory.key]);
  const selectedItem = items.length > 0 ? items[itemIndex] : null;

  function refreshView() {
    const refreshCategory = (list: StoreItemWithState[]): StoreItemWithState[] =>
      list.map((item) => ({ ...item, state: getInstalledState(item, ctx) }));

    setView({
      agents: refreshCategory(view.agents),
      commands: refreshCategory(view.commands),
      skills: refreshCategory(view.skills),
      providers: refreshCategory(view.providers),
      mcps: refreshCategory(view.mcps),
      context: ctx,
    });
  }

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }

    // Category navigation
    if (key.leftArrow || (key.shift && key.tab)) {
      setCategoryIndex((prev) => (prev - 1 + CATEGORIES.length) % CATEGORIES.length);
      setItemIndex(0);
      setMessage(null);
      return;
    }
    if (key.rightArrow || key.tab) {
      setCategoryIndex((prev) => (prev + 1) % CATEGORIES.length);
      setItemIndex(0);
      setMessage(null);
      return;
    }

    // Item navigation
    if (key.upArrow) {
      setItemIndex((prev) => Math.max(0, prev - 1));
      setMessage(null);
      return;
    }
    if (key.downArrow) {
      setItemIndex((prev) => Math.min(items.length - 1, prev + 1));
      setMessage(null);
      return;
    }

    // Toggle install
    if ((key.return || input === " ") && selectedItem) {
      try {
        const nowInstalled = toggleItem(selectedItem, ctx);
        setMessage(
          nowInstalled
            ? `+ Installed ${selectedItem.name}${isProjectMode ? " (project)" : ""}`
            : `- Uninstalled ${selectedItem.name}${isProjectMode ? " (project)" : ""}`
        );
        refreshView();
      } catch (err) {
        setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="cyan">OpenCode Manager</Text>
          <Text color="gray"> — manage your agents, commands, skills, providers & MCPs</Text>
        </Box>
        {isProjectMode && (
          <Box>
            <Text color="yellow">Project: </Text>
            <Text bold color="white">{ctx.projectName}</Text>
            <Text color="gray"> ({ctx.projectDir})</Text>
          </Box>
        )}
      </Box>

      {/* Category tabs */}
      <Box>
        {CATEGORIES.map((cat, i) => (
          <CategoryTab
            key={cat.key}
            label={cat.label}
            count={(view[cat.key] as StoreItemWithState[]).length}
            installedCount={(view[cat.key] as StoreItemWithState[]).filter((it) => it.state.installed).length}
            active={i === categoryIndex}
          />
        ))}
      </Box>

      {/* Separator */}
      <Box>
        <Text color="gray">{"─".repeat(72)}</Text>
      </Box>

      {/* Item list */}
      <Box flexDirection="column">
        {items.length === 0 ? (
          <Text color="gray">  No {currentCategory.label.toLowerCase()} in the store.</Text>
        ) : (
          items.map((item, i) => (
            <ItemRow
              key={`${item.type}-${item.id}`}
              item={item}
              selected={i === itemIndex}
              isProjectMode={isProjectMode}
            />
          ))
        )}
      </Box>

      {/* Detail panel */}
      {selectedItem && <DetailPanel item={selectedItem} isProjectMode={isProjectMode} />}

      {/* Message bar */}
      {message && (
        <Box marginTop={1}>
          <Text color={message.startsWith("Error") ? "red" : message.startsWith("+") ? "green" : "yellow"}>
            {message}
          </Text>
        </Box>
      )}

      {/* Help bar */}
      <Box marginTop={1}>
        <Box flexDirection="column">
          <Text color="gray">←/→ category  ↑/↓ navigate  Enter/Space toggle  q quit</Text>
          {isProjectMode && (
            <Text color="gray">
              <Text color="green">✓</Text> project  <Text color="blue">◆</Text> global only  <Text color="gray">○</Text> not installed
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
