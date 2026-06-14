// The command registry: the single extension point for the Agent CLI.
//
// Phase 0 ships zero commands; the dispatcher returns UNKNOWN_COMMAND for every
// verb-noun pair. Later phases append their command arrays here, e.g.:
//
//   import { sourceCommands } from "./sources.js";
//   import { itemCommands } from "./items.js";
//   export const allCommands: CommandDef[] = [...sourceCommands, ...itemCommands];
//
// Keep this the only place commands are wired in.

import type { CommandDef } from "../types.js";

export const allCommands: CommandDef[] = [];
