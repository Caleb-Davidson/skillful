import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type {
  StoreItemMeta,
  StoreItemWithState,
  StoreItemType,
  StoreView,
  ProjectContext,
  TargetId,
  AppView,
  MultiInstalledStatus,
  PerTargetState,
} from "../lib/types.js";
import {
  getCategoryNoticeForTargets,
  getTargetLabel,
  getTargetSelectionLabel,
  isCategoryVisibleForTargets,
  toggleItemForTargets,
  buildStoreViewForTargets,
  enrichStoreViewMismatchForTargets,
  initAdapters,
} from "../lib/target-manager.js";
import { loadProjectTargets } from "../lib/project-targets.js";
import { checkEnabledSourcesForUpdates, loadMergedIndexFromConfiguredSources } from "../lib/source-sync.js";
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

/** Map the rollup status to a (glyph, color, badge text) tuple for the row. */
function statusGlyph(status: MultiInstalledStatus | undefined, fallbackInstalled: boolean): {
  glyph: string;
  color: string;
} {
  switch (status) {
    case "installed":
      return { glyph: "✓", color: "green" };
    case "older-version":
      return { glyph: "!", color: "yellow" };
    case "missing-in-some":
      return { glyph: "◐", color: "blue" };
    case "unsupported":
      return { glyph: "×", color: "red" };
    case "not-installed":
      return { glyph: "○", color: "gray" };
    default:
      // Pre-status legacy: fall back to installed boolean.
      return fallbackInstalled
        ? { glyph: "✓", color: "green" }
        : { glyph: "○", color: "gray" };
  }
}

function statusLabel(status: MultiInstalledStatus | undefined): string | null {
  switch (status) {
    case "missing-in-some":
      return "missing in some";
    case "older-version":
      return "older version";
    case "unsupported":
      return "unsupported";
    default:
      return null;
  }
}

interface ItemRowProps {
  item: StoreItemWithState;
  selected: boolean;
  isProjectMode: boolean;
  configuredTargetCount: number;
}

function ItemRow({ item, selected, isProjectMode, configuredTargetCount }: ItemRowProps) {
  const isGlobalOnly = isProjectMode && !item.state.installed && item.state.globalInstalled;
  const status = item.state.status;
  const eligibleTargets = item.state.eligibleTargets ?? [];
  const partialEligibility = configuredTargetCount > 1 && eligibleTargets.length > 0 && eligibleTargets.length < configuredTargetCount;
  const { glyph, color } = statusGlyph(status, item.state.installed);
  const label = statusLabel(status);

  let displayName = item.name;
  if (item.type === "command") displayName = `/${item.name}`;

  // Override glyph for "global only" (project mode, not installed locally but installed globally).
  const finalGlyph = status === "not-installed" && isGlobalOnly ? "◆" : glyph;
  const finalColor = status === "not-installed" && isGlobalOnly ? "blue" : color;

  return (
    <Box>
      <Text>
        <Text color={selected ? "cyan" : "white"} bold={selected}>
          {selected ? " ▸ " : "   "}
        </Text>
        <Text color={finalColor}>{finalGlyph}</Text>
        <Text> </Text>
        <Text color={selected ? "cyan" : "white"} bold={selected}>
          {displayName}
        </Text>
        {label && <Text color={color}> [{label}]</Text>}
        {partialEligibility && (
          <Text color="magenta"> [{eligibleTargets.join("+")} only]</Text>
        )}
        {isGlobalOnly && <Text color="blue"> [global]</Text>}
        <Text color="gray"> — {item.description}</Text>
      </Text>
    </Box>
  );
}

interface DetailPanelProps {
  item: StoreItemWithState;
  isProjectMode: boolean;
  targetIds: TargetId[];
}

function DetailPanel({ item, isProjectMode, targetIds }: DetailPanelProps) {
  let displayName = item.name;
  if (item.type === "command") displayName = `/${item.name}`;

  const typeLabel: Record<StoreItemType, string> = {
    agent: "agent",
    command: "command",
    skill: "skill",
    provider: "provider",
    mcp: "mcp server",
    config: "config",
  };

  const status = item.state.status;
  const isGlobalOnly = isProjectMode && !item.state.installed && item.state.globalInstalled;
  const isUnsupported = status === "unsupported";
  const isPartialEligibility = (item.state.eligibleTargets?.length ?? 0) < targetIds.length && !isUnsupported;
  const perTarget = item.state.perTarget ?? [];
  const isMulti = targetIds.length > 1;

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
          <Text color="red">Unsupported for configured target{targetIds.length > 1 ? "s" : ""}</Text>
        ) : status === "older-version" ? (
          <Text color="yellow">Installed but different from store (Enter to overwrite)</Text>
        ) : status === "missing-in-some" ? (
          <Text color="blue">Installed in some targets, missing in others (Enter to install everywhere)</Text>
        ) : item.state.installed ? (
          <Text color="green">
            Installed{isProjectMode ? " (project)" : ""}{!isMulti && item.state.installedVia ? ` via ${item.state.installedVia}` : ""}
          </Text>
        ) : isGlobalOnly ? (
          <Text color="blue">
            Installed globally{" "}
            <Text color="gray">(not in project — Enter to add to project)</Text>
          </Text>
        ) : (
          <Text color="gray">Not installed</Text>
        )}
      </Text>
      {isPartialEligibility && (
        <Text>
          <Text color="gray">Eligible targets: </Text>
          <Text color="magenta">{(item.state.eligibleTargets ?? []).join(", ")}</Text>
          <Text color="gray"> (others can't install this item)</Text>
        </Text>
      )}
      {item.state.supportReason && !isMulti && (
        <Text>
          <Text color="gray">Support: </Text>
          <Text color="gray">{item.state.supportReason}</Text>
        </Text>
      )}
      {isMulti && perTarget.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">Per-target:</Text>
          {perTarget.map((p) => (
            <PerTargetRow key={p.targetId} entry={p} />
          ))}
        </Box>
      )}
      <Text>
        <Text color="gray">Store path: </Text>
        <Text dimColor>{item.path}</Text>
      </Text>
      {item.sourceLabel && (
        <Text>
          <Text color="gray">Source: </Text>
          <Text color="yellow">{item.sourceLabel}</Text>
          {item.sourceId ? <Text color="gray"> ({item.sourceId})</Text> : null}
        </Text>
      )}
    </Box>
  );
}

function PerTargetRow({ entry }: { entry: PerTargetState }) {
  let icon = "○";
  let color = "gray";
  let label = "not installed";

  if (!entry.eligible) {
    icon = "—";
    color = "gray";
    label = entry.state.supportReason ?? "not eligible";
  } else if (entry.state.installed && entry.state.mismatch === true) {
    icon = "!";
    color = "yellow";
    label = "older version";
  } else if (entry.state.installed) {
    icon = "✓";
    color = "green";
    label = "installed";
  }

  return (
    <Box>
      <Text>
        <Text color={color}>  {icon} </Text>
        <Text>{entry.targetId}</Text>
        <Text color="gray"> — </Text>
        <Text color={color}>{label}</Text>
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

type Category = "agents" | "commands" | "skills" | "providers" | "mcps" | "configs";
const CATEGORIES: { key: Category; label: string; type: StoreItemType }[] = [
  { key: "agents", label: "Agents", type: "agent" },
  { key: "commands", label: "Commands", type: "command" },
  { key: "skills", label: "Skills", type: "skill" },
  { key: "providers", label: "Providers", type: "provider" },
  { key: "mcps", label: "MCPs", type: "mcp" },
  { key: "configs", label: "Config", type: "config" },
];

function ManageView({ view, onViewChanged, onSwitchView }: ManageViewProps) {
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const ctx: ProjectContext = view.context;
  const isProjectMode = ctx.mode === "project";
  const targetIds: TargetId[] = view.targetIds ?? (view.targetId ? [view.targetId] : ["opencode"]);
  const isMulti = targetIds.length > 1;
  const targetLabel = isMulti ? getTargetSelectionLabel(targetIds) : getTargetLabel(targetIds[0]);
  const visibleCategories = useMemo(
    () => CATEGORIES.filter((category) => isCategoryVisibleForTargets(category.type, targetIds)),
    [targetIds]
  );

  useEffect(() => {
    if (visibleCategories.length === 0) {
      setCategoryIndex(0);
      setItemIndex(0);
      return;
    }
    if (categoryIndex >= visibleCategories.length) {
      setCategoryIndex(visibleCategories.length - 1);
      setItemIndex(0);
    }
  }, [categoryIndex, visibleCategories]);

  const currentCategory = visibleCategories[Math.max(0, Math.min(categoryIndex, visibleCategories.length - 1))];
  const items = useMemo(() => view[currentCategory.key] as StoreItemWithState[], [view, currentCategory.key]);
  const selectedItem = items.length > 0 ? items[itemIndex] : null;
  const categoryNotice = getCategoryNoticeForTargets(currentCategory.type, targetIds, ctx);

  async function refreshView() {
    // Rebuild from the merged source index so per-target state is fully recomputed.
    const merged = await loadMergedIndexFromConfiguredSources();
    const next = buildStoreViewForTargets(merged.index.items, targetIds, ctx);
    onViewChanged(next);
  }

  useInput((input, key) => {
    if (visibleCategories.length === 0) {
      if (key.tab) {
        onSwitchView("projects");
      }
      return;
    }

    // Category navigation
    if (key.leftArrow || (key.shift && key.tab)) {
      setCategoryIndex((prev) => (prev - 1 + visibleCategories.length) % visibleCategories.length);
      setItemIndex(0);
      setMessage(null);
      return;
    }
    if (key.rightArrow) {
      setCategoryIndex((prev) => (prev + 1) % visibleCategories.length);
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
        const status = selectedItem.state.status;
        if (status === "unsupported") {
          const fallbackMessage =
            selectedItem.state.supportReason ?? "Install is not available for this target.";
          setMessage(`Error: ${fallbackMessage}`);
          return;
        }

        const nowInstalled = toggleItemForTargets(selectedItem, targetIds, ctx);
        const wasUnhealthy = status === "missing-in-some" || status === "older-version";
        const scopeNote = isProjectMode ? " (project)" : "";
        const targetNote = isMulti ? ` in ${targetIds.join(" + ")}` : "";

        setMessage(
          nowInstalled
            ? `${wasUnhealthy ? "~ Synced" : "+ Installed"} ${selectedItem.name}${scopeNote}${targetNote}`
            : `- Uninstalled ${selectedItem.name}${scopeNote}${targetNote}`
        );
        void refreshView();
      } catch (err) {
        setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    // Tab = cycle to next view (manage → projects → settings → manage)
    if (key.tab) {
      onSwitchView("projects");
      return;
    }
    // Shift+Tab = cycle to previous view
    // (handled above in category nav as Shift+Tab, so won't reach here)
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
          <Text color="yellow">Target{isMulti ? "s" : ""}: </Text>
          <Text bold color="white">{targetLabel}</Text>
          <Text color="gray"> ({targetIds.join(", ")})</Text>
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
        {visibleCategories.map((cat, i) => (
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
        {categoryNotice && (
          <Text color="yellow">  Note: {categoryNotice}</Text>
        )}
        {items.length === 0 ? (
          <Text color="gray">  No {currentCategory.label.toLowerCase()} in the store.</Text>
        ) : (
          items.map((item, i) => (
            <ItemRow
              key={`${item.type}-${item.id}`}
              item={item}
              selected={i === itemIndex}
              isProjectMode={isProjectMode}
              configuredTargetCount={targetIds.length}
            />
          ))
        )}
      </Box>

      {/* Detail panel */}
      {selectedItem && (
        <DetailPanel item={selectedItem} isProjectMode={isProjectMode} targetIds={targetIds} />
      )}

      {/* Message bar */}
      {message && (
        <Box marginTop={1}>
          <Text color={message.startsWith("Error") ? "red" : message.startsWith("+") || message.startsWith("~") ? "green" : "yellow"}>
            {message}
          </Text>
        </Box>
      )}

      {/* Help bar */}
      <Box marginTop={1}>
        <Box flexDirection="column">
          <Text color="gray">←/→ category  ↑/↓ navigate  Enter/Space toggle  Tab next view  q quit</Text>
          <Text color="gray">
            <Text color="green">✓</Text> installed  {isMulti && <><Text color="blue">◐</Text> missing in some  </>}<Text color="yellow">!</Text> older version  <Text color="gray">○</Text> not installed
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

// ── Top-level App Shell ──

export interface StoreAppProps {
  initialView: StoreView;
  initialAppView?: AppView;
  /** When set (via --target flag), the session stays locked to this single target. */
  forcedTargetId?: TargetId;
}

export default function StoreApp({ initialView, initialAppView = "manage", forcedTargetId }: StoreAppProps) {
  const { exit } = useApp();
  const [appView, setAppView] = useState<AppView>(initialAppView);
  const [storeView, setStoreView] = useState<StoreView>(initialView);
  const [sourceStatusMessage, setSourceStatusMessage] = useState<string | null>(null);

  async function loadEffectiveItems(): Promise<StoreItemMeta[]> {
    const merged = await loadMergedIndexFromConfiguredSources();
    return merged.index.items;
  }

  async function refreshStoreFromSources(): Promise<void> {
    const targetIds = storeView.targetIds ?? (storeView.targetId ? [storeView.targetId] : ["opencode"]);
    const items = await loadEffectiveItems();
    const nextView = buildStoreViewForTargets(items, targetIds, storeView.context);
    setStoreView(nextView);
  }

  // Mismatch enrichment runs in the background per target.
  useEffect(() => {
    const targetIds = storeView.targetIds ?? (storeView.targetId ? [storeView.targetId] : ["opencode"]);
    const categories: Array<keyof Pick<StoreView, "agents" | "commands" | "skills" | "providers" | "mcps" | "configs">> = [
      "agents",
      "commands",
      "skills",
      "providers",
      "mcps",
      "configs",
    ];

    const hasPendingChecks = categories.some((category) =>
      storeView[category].some((item) => {
        // Multi-target items expose per-target mismatchChecked via perTarget.
        if (item.state.perTarget && item.state.perTarget.length > 0) {
          return item.state.perTarget.some(
            (p) => p.eligible && p.state.installed && p.state.mismatchChecked !== true
          );
        }
        return item.state.installed && item.state.mismatchChecked !== true;
      })
    );

    if (!hasPendingChecks) {
      return;
    }

    let cancelled = false;

    void enrichStoreViewMismatchForTargets(storeView, targetIds).then((nextView) => {
      if (!cancelled && nextView !== storeView) {
        setStoreView(nextView);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [storeView]);

  useEffect(() => {
    let cancelled = false;

    void checkEnabledSourcesForUpdates().then((statuses) => {
      if (cancelled) return;
      const updates = statuses.filter((status) => status.hasUpdate);
      if (updates.length > 0) {
        setSourceStatusMessage(
          `Updates available from ${updates.length} source${updates.length === 1 ? "" : "s"}. Open Settings to refresh.`
        );
      } else {
        setSourceStatusMessage(null);
      }
    }).catch(() => {
      // Non-fatal: source update checks are best-effort.
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Global quit handler
  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
    }
  });

  /**
   * Resolve the targets to use when switching to a new project.
   *  - forcedTargetId (from --target flag) always wins.
   *  - skillful.targets.json at the new project root → multi-target.
   *  - explicit registry default → single-target.
   *  - otherwise carry over the prior session's targets.
   */
  function resolveTargetsForProject(projectPath: string, projectTarget?: TargetId): TargetId[] {
    if (forcedTargetId) return [forcedTargetId];

    const fileTargets = loadProjectTargets(projectPath);
    if (fileTargets && fileTargets.length > 0) return fileTargets;

    if (projectTarget) return [projectTarget];

    return storeView.targetIds ?? (storeView.targetId ? [storeView.targetId] : ["opencode"]);
  }

  function handleSwitchToProject(projectPath: string, projectTarget?: TargetId) {
    void (async () => {
      const targetIds = resolveTargetsForProject(projectPath, projectTarget);

      // Pre-load any adapters not yet resident (e.g. multi-target with a new tool).
      await initAdapters(targetIds);

      const ctx: ProjectContext = {
        mode: "project",
        projectDir: projectPath,
        projectName: projectPath.split("/").pop() ?? projectPath,
      };

      // Auto-register the project when switching to it.
      addProject(projectPath);

      const items = await loadEffectiveItems();
      const view = buildStoreViewForTargets(items, targetIds, ctx);
      setStoreView(view);
      setAppView("manage");
    })().catch((err) => {
      const detail = err instanceof Error ? err.message : String(err);
      setSourceStatusMessage(`Failed to switch project store: ${detail}`);
    });
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
      {sourceStatusMessage && (
        <Box paddingX={1}>
          <Text color="yellow">{sourceStatusMessage}</Text>
        </Box>
      )}
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
          onSourcesChanged={refreshStoreFromSources}
        />
      )}
    </Box>
  );
}
