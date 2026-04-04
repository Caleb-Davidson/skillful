import type { CapabilityMap, TargetAdapter } from "./shared.js";
import { makeNotImplementedAdapter } from "./shared.js";

const CODEX_CLI_CAPABILITIES: CapabilityMap = {
  agent: "partial",
  command: "partial",
  skill: "yes",
  provider: "yes",
  mcp: "yes",
};

export const codexCliAdapter: TargetAdapter = makeNotImplementedAdapter(
  "codex-cli",
  "Codex CLI",
  CODEX_CLI_CAPABILITIES,
);
