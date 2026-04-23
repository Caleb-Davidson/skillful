import React, { useState, useMemo } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { StoreItemWithState, StoreItemType, StoreView, ProjectContext, TargetId, AppView } from "../lib/types.js";
import { getInstalledStateForTarget, getTargetLabel, toggleItemForTarget, buildStoreViewForTarget, initAdapter } from "../lib/target-manager.js";
import { loadIndex } from "../lib/store.js";
import { detectProjectContext } from "../lib/project-context.js";
import { addProject } from "../lib/projects.js";
import ProjectsView from "./ProjectsView.js";
import SettingsView from "./SettingsView.js";

// ── Sub-components for the Manage (store) view ──

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
  const supportMode = item.state.supportMode ?? "yes";
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
        {supportMode === "partial" && <Text color="yellow"> [partial]</Text>}
        {supportMode === "no" && <Text color="red"> [unsupported]</Text>}
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
  const supportMode = item.state.supportMode ?? "yes";
  const isUnsupported = supportMode === "no";
  const isPartial = supportMode === "partial";

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
        {isUnsupported ? (
          <Text color="red">Unsupported for target</Text>
        ) : item.state.installed ? (
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
      {(isPartial || item.state.supportReason) && (
        <Text>
          <Text color="gray">Support: </Text>
          {isPartial ? <Text color="yellow">Partial</Text> : <Text color="gray">{supportMode}</Text>}
          {item.state.supportReason ? <Text color="gray"> — {item.state.supportReason}</Text> : null}
        </Text>
      )}
      <Text>
        <Text color="gray">Store path: </Text>
        <Text dimColor>{item.path}</Text>
      </Text>
    </Box>
  );
}

// ── Manage View (the original store browsing UI) ──

interface ManageViewProps {
  view: StoreView;
  onViewChanged: (view: StoreView) => void;
  onSwitchView: (view: AppView) => void;
}

type Category = "agents" | "commands" | "skills" | "providers" | "mcps";
const CATEGORIES: { key: Category; label: string; type: StoreItemType }[] = [
  { key: "agents", label: "Agents", type: "agent" },
  { key: "commands", label: "Commands", type: "command" },
  { key: "skills", label: "Skills", type: "skill" },
  { key: "providers", label: "Providers", type: "provider" },
  { key: "mcps", label: "MCPs", type: "mcp" },
];

function ManageView({ view, onViewChanged, onSwitchView }: ManageViewProps) {
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const ctx: ProjectContext = view.context;
  const isProjectMode = ctx.mode === "project";
  const targetId: TargetId = view.targetId ?? "opencode";
  const targetLabel = getTargetLabel(targetId);

  const currentCategory = CATEGORIES[categoryIndex];
  const items = useMemo(() => view[currentCategory.key] as StoreItemWithState[], [view, currentCategory.key]);
  const selectedItem = items.length > 0 ? items[itemIndex] : null;

  function refreshView() {
    const refreshCategory = (list: StoreItemWithState[]): StoreItemWithState[] =>
      list.map((item) => ({ ...item, state: getInstalledStateForTarget(item, targetId, ctx) }));

    const updated: StoreView = {
      agents: refreshCategory(view.agents),
      commands: refreshCategory(view.commands),
      skills: refreshCategory(view.skills),
      providers: refreshCategory(view.providers),
      mcps: refreshCategory(view.mcps),
      context: ctx,
      targetId,
    };
    onViewChanged(updated);
  }

  useInput((input, key) => {
    // Category navigation
    if (key.leftArrow || (key.shift && key.tab)) {
      setCategoryIndex((prev) => (prev - 1 + CATEGORIES.length) % CATEGORIES.length);
      setItemIndex(0);
      setMessage(null);
      return;
    }
    if (key.rightArrow) {
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
        const supportMode = selectedItem.state.supportMode ?? "yes";
        if (supportMode !== "yes") {
          const fallbackMessage = selectedItem.state.supportReason ?? "Install is not available for this target yet.";
          setMessage(`Error: ${fallbackMessage}`);
          return;
        }

        const nowInstalled = toggleItemForTarget(selectedItem, targetId, ctx);
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

    // Tab = switch to projects view
    if (key.tab) {
      onSwitchView("projects");
      return;
    }

    // 's' = switch to settings
    if (input === "s") {
      onSwitchView("settings");
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="cyan">Skillful</Text>
          <Text color="gray"> — Store</Text>
        </Box>
        <Box>
          <Text color="yellow">Target: </Text>
          <Text bold color="white">{targetLabel}</Text>
          <Text color="gray"> ({targetId})</Text>
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
          <Text color="gray">←/→ category  ↑/↓ navigate  Enter/Space toggle  Tab projects  s settings  q quit</Text>
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

// ── Top-level App Shell ──

export interface StoreAppProps {
  initialView: StoreView;
  initialAppView?: AppView;
}

export default function StoreApp({ initialView, initialAppView = "manage" }: StoreAppProps) {
  const { exit } = useApp();
  const [appView, setAppView] = useState<AppView>(initialAppView);
  const [storeView, setStoreView] = useState<StoreView>(initialView);

  // Global quit handler
  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
    }
  });

  function handleSwitchToProject(projectPath: string, projectTarget?: TargetId) {
    // Build a new store view for the selected project
    const targetId = projectTarget ?? storeView.targetId ?? "opencode";

    // Re-detect project context for the selected path
    const ctx: ProjectContext = {
      mode: "project",
      projectDir: projectPath,
      projectName: projectPath.split("/").pop() ?? projectPath,
    };

    // Auto-register the project if switching to it
    addProject(projectPath);

    const index = loadIndex();
    const view = buildStoreViewForTarget(index.items, targetId, ctx);
    setStoreView(view);
    setAppView("manage");
  }

  function handleSwitchView(view: AppView) {
    setAppView(view);
  }

  // View-level navigation tabs indicator
  const viewTabs = (
    <Box marginBottom={0}>
      <Text>
        <Text bold={appView === "manage"} color={appView === "manage" ? "cyan" : "gray"}>
          {appView === "manage" ? "[Store]" : " Store "}
        </Text>
        <Text color="gray"> | </Text>
        <Text bold={appView === "projects"} color={appView === "projects" ? "cyan" : "gray"}>
          {appView === "projects" ? "[Projects]" : " Projects "}
        </Text>
        <Text color="gray"> | </Text>
        <Text bold={appView === "settings"} color={appView === "settings" ? "cyan" : "gray"}>
          {appView === "settings" ? "[Settings]" : " Settings "}
        </Text>
      </Text>
    </Box>
  );

  return (
    <Box flexDirection="column">
      {viewTabs}
      {appView === "manage" && (
        <ManageView
          view={storeView}
          onViewChanged={setStoreView}
          onSwitchView={handleSwitchView}
        />
      )}
      {appView === "projects" && (
        <ProjectsView
          onSwitchToProject={handleSwitchToProject}
          onSwitchView={handleSwitchView}
          currentProjectPath={storeView.context.projectDir}
        />
      )}
      {appView === "settings" && (
        <SettingsView
          onSwitchView={handleSwitchView}
        />
      )}
    </Box>
  );
}
