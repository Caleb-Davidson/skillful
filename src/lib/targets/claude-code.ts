import type { CapabilityMap, TargetAdapter } from "./shared.js";
import { makeNotImplementedAdapter } from "./shared.js";

const CLAUDE_CAPABILITIES: CapabilityMap = {
  agent: "partial",
  command: "yes",
  skill: "yes",
  provider: "partial",
  mcp: "yes",
};

export const claudeCodeAdapter: TargetAdapter = makeNotImplementedAdapter(
  "claude-code",
  "Claude Code",
  CLAUDE_CAPABILITIES,
);
