import type { DrawingCommand } from "./types";

export type CommandContext = {
  activeObjectId?: string;
  lastCreatedObjectId?: string;
};

export function normalizeCommands(commands: DrawingCommand[], _context: CommandContext) {
  return commands.map((command) => {
    if (command.type === "create") {
      return {
        ...command,
        position: {
          region: "center" as const,
          ...command.position,
        },
        style: {
          stroke: "#1f2937",
          strokeWidth: 2,
          ...command.style,
        },
      };
    }

    return command;
  });
}
