// The command registry: the single extension point for the Agent CLI.
//
// Each phase appends its command array here. Item commands (list/info/install/
// remove <type>) arrive in a later phase, e.g.:
//
//   import { itemCommands } from "./items.js";
//   export const allCommands: CommandDef[] = [...sourceCommands, ...itemCommands];
//
// Keep this the only place commands are wired in.

import type { CommandDef } from "../types.js";
import { sourceCommands } from "./sources.js";

export const allCommands: CommandDef[] = [...sourceCommands];
