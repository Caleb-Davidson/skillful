import type { CapabilityMap, TargetAdapter } from "./shared.js";
import { makeNotImplementedAdapter } from "./shared.js";

const CODEX_APP_CAPABILITIES: CapabilityMap = {
  agent: "yes",
  command: "partial",
  skill: "yes",
  provider: "partial",
  mcp: "yes",
};

export const codexAppAdapter: TargetAdapter = makeNotImplementedAdapter(
  "codex-app",
  "Codex App",
  CODEX_APP_CAPABILITIES,
);
