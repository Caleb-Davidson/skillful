import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { ProjectEntry, TargetId } from "../lib/types.js";
import { loadRegistry, addProject, removeProject, saveRegistry } from "../lib/projects.js";
import { listTargetIds } from "../lib/target-manager.js";

interface ProjectsViewProps {
  onSwitchToProject: (projectPath: string, targetId?: TargetId) => void;
  onSwitchView: (view: "manage" | "settings") => void;
  currentProjectPath?: string;
}

export default function ProjectsView({ onSwitchToProject, onSwitchView, currentProjectPath }: ProjectsViewProps) {
  const [projects, setProjects] = useState<ProjectEntry[]>(() => loadRegistry().projects);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<"list" | "add">("list");
  const [inputValue, setInputValue] = useState("");

  function refresh() {
    setProjects(loadRegistry().projects);
  }

  useInput((input, key) => {
    if (mode === "add") {
      if (key.escape) {
        setMode("list");
        setInputValue("");
        setMessage(null);
        return;
      }
      // TextInput handles the rest
      return;
    }

    // List mode
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      setMessage(null);
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(projects.length - 1, prev + 1));
      setMessage(null);
      return;
    }

    // Enter = switch to project
    if (key.return && projects.length > 0) {
      const project = projects[selectedIndex];
      if (project) {
        onSwitchToProject(project.path, project.defaultTarget);
      }
      return;
    }

    // 'a' = add project
    if (input === "a") {
      setMode("add");
      setInputValue(process.cwd());
      setMessage(null);
      return;
    }

    // 'd' or Delete = remove project
    if ((input === "d" || key.delete) && projects.length > 0) {
      const project = projects[selectedIndex];
      if (project) {
        removeProject(project.path);
        refresh();
        setSelectedIndex((prev) => Math.min(prev, Math.max(0, projects.length - 2)));
        setMessage(`Removed ${project.name}`);
      }
      return;
    }

    // 't' = cycle target for selected project
    if (input === "t" && projects.length > 0) {
      const project = projects[selectedIndex];
      if (project) {
        const targets = listTargetIds();
        const currentIdx = project.defaultTarget ? targets.indexOf(project.defaultTarget) : -1;
        const nextIdx = (currentIdx + 1) % (targets.length + 1); // +1 for "none" option
        const registry = loadRegistry();
        const entry = registry.projects.find((p) => p.path === project.path);
        if (entry) {
          if (nextIdx === targets.length) {
            delete entry.defaultTarget;
            setMessage(`${project.name}: target reset to global default`);
          } else {
            entry.defaultTarget = targets[nextIdx];
            setMessage(`${project.name}: target set to ${targets[nextIdx]}`);
          }
          saveRegistry(registry);
          refresh();
        }
      }
      return;
    }

    // Tab = switch to manage view
    if (key.tab) {
      onSwitchView("manage");
      return;
    }

    // 's' = switch to settings
    if (input === "s") {
      onSwitchView("settings");
      return;
    }
  });

  function handleAddSubmit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setMode("list");
      setInputValue("");
      return;
    }

    const result = addProject(trimmed);
    if (result.added) {
      setMessage(`Added project: ${result.entry.name}`);
    } else {
      setMessage(`Already registered: ${result.entry.name}`);
    }
    refresh();
    setMode("list");
    setInputValue("");
    // Select the newly added/found project
    const updatedProjects = loadRegistry().projects;
    const idx = updatedProjects.findIndex((p) => p.path === result.entry.path);
    if (idx >= 0) setSelectedIndex(idx);
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="cyan">Skillful</Text>
          <Text color="gray"> — Projects</Text>
        </Box>
        <Text color="gray">Registered projects you manage with skillful</Text>
      </Box>

      {/* Separator */}
      <Box>
        <Text color="gray">{"─".repeat(72)}</Text>
      </Box>

      {/* Project list */}
      <Box flexDirection="column">
        {projects.length === 0 ? (
          <Box flexDirection="column" marginY={1}>
            <Text color="gray">  No projects registered yet.</Text>
            <Text color="gray">  Press 'a' to add a project directory.</Text>
          </Box>
        ) : (
          projects.map((project, i) => {
            const selected = i === selectedIndex;
            const isCurrent = currentProjectPath === project.path;
            return (
              <Box key={project.path}>
                <Text>
                  <Text color={selected ? "cyan" : "white"} bold={selected}>
                    {selected ? " ▸ " : "   "}
                  </Text>
                  <Text color={isCurrent ? "green" : selected ? "cyan" : "white"} bold={selected}>
                    {project.name}
                  </Text>
                  {isCurrent && <Text color="green"> [active]</Text>}
                  {project.defaultTarget && (
                    <Text color="yellow"> [{project.defaultTarget}]</Text>
                  )}
                  <Text color="gray"> — {project.path}</Text>
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      {/* Detail panel for selected project */}
      {projects.length > 0 && projects[selectedIndex] && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          marginTop={1}
        >
          <Box>
            <Text bold color="cyan">{projects[selectedIndex].name}</Text>
          </Box>
          <Text>
            <Text color="gray">Path: </Text>
            <Text>{projects[selectedIndex].path}</Text>
          </Text>
          <Text>
            <Text color="gray">Target: </Text>
            <Text color="yellow">
              {projects[selectedIndex].defaultTarget ?? "global default"}
            </Text>
          </Text>
          <Text>
            <Text color="gray">Added: </Text>
            <Text dimColor>{new Date(projects[selectedIndex].addedAt).toLocaleDateString()}</Text>
          </Text>
        </Box>
      )}

      {/* Add project input */}
      {mode === "add" && (
        <Box marginTop={1}>
          <Text color="cyan">Project path: </Text>
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleAddSubmit}
            placeholder="/path/to/project"
          />
        </Box>
      )}

      {/* Message bar */}
      {message && (
        <Box marginTop={1}>
          <Text color={message.startsWith("Removed") ? "yellow" : "green"}>
            {message}
          </Text>
        </Box>
      )}

      {/* Help bar */}
      <Box marginTop={1}>
        <Box flexDirection="column">
          <Text color="gray">
            ↑/↓ navigate  Enter open project  a add  d remove  t cycle target  Tab manage  s settings  q quit
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
