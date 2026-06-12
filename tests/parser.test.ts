import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/commands/parser";

describe("parseCommand", () => {
  it("parses a basic create command", () => {
    const result = parseCommand("画一个红色圆形");

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.commands[0]).toMatchObject({
        type: "create",
        shape: "circle",
        style: {
          fill: "#ef4444",
        },
      });
    }
  });

  it("parses a move command", () => {
    const result = parseCommand("向右移动一点");

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.commands[0]).toMatchObject({
        type: "move",
        direction: "right",
      });
    }
  });

  it("returns suggestions for unsupported commands", () => {
    const result = parseCommand("随便变得更好看");

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.suggestions.length).toBeGreaterThan(0);
    }
  });
});
