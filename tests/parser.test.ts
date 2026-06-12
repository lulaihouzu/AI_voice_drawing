import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/commands/parser";
import type { DrawingCommand, ParseResult } from "../src/commands/types";

function expectOk(result: ParseResult): DrawingCommand[] {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.reason);
  }

  return result.commands;
}

describe("parseCommand", () => {
  it("parses a basic create command", () => {
    const commands = expectOk(parseCommand("画一个红色圆形"));

    expect(commands[0]).toMatchObject({
      type: "create",
      shape: "circle",
      style: {
        fill: "#ef4444",
      },
      position: {
        region: "center",
      },
    });
  });

  it("parses positioned rectangle creation", () => {
    const commands = expectOk(parseCommand("在右边画一个蓝色矩形"));

    expect(commands[0]).toMatchObject({
      type: "create",
      shape: "rect",
      style: {
        fill: "#2563eb",
      },
      position: {
        region: "right",
      },
    });
  });

  it("parses line and arrow creation", () => {
    const lineCommands = expectOk(parseCommand("画一条黑色直线"));
    const arrowCommands = expectOk(parseCommand("从圆形指向矩形画一个箭头"));

    expect(lineCommands[0]).toMatchObject({
      type: "create",
      shape: "line",
      style: {
        stroke: "#111827",
      },
    });
    expect(arrowCommands[0]).toMatchObject({
      type: "create",
      shape: "arrow",
      connection: {
        mode: "point-to",
        from: "圆形",
        to: "矩形",
      },
    });
  });

  it("parses text creation", () => {
    const commands = expectOk(parseCommand("写上开始两个字"));

    expect(commands[0]).toMatchObject({
      type: "create",
      shape: "text",
      text: "开始",
    });
  });

  it("parses size and corner position hints", () => {
    const commands = expectOk(parseCommand("请在左上角画一个小的黄色圆形"));

    expect(commands[0]).toMatchObject({
      type: "create",
      shape: "circle",
      size: "small",
      style: {
        fill: "#facc15",
      },
      position: {
        region: "top-left",
      },
    });
  });

  it("parses color update command", () => {
    const commands = expectOk(parseCommand("把它改成绿色"));

    expect(commands[0]).toMatchObject({
      type: "update",
      target: {
        ref: "active",
      },
      patch: {
        fill: "#16a34a",
      },
    });
  });

  it("parses scale commands", () => {
    const enlargeCommands = expectOk(parseCommand("把它放大一点"));
    const shrinkCommands = expectOk(parseCommand("把它缩小一点"));

    expect(enlargeCommands[0]).toMatchObject({
      type: "update",
      patch: {
        scale: 1.2,
      },
    });
    expect(shrinkCommands[0]).toMatchObject({
      type: "update",
      patch: {
        scale: 0.8,
      },
    });
  });

  it("parses a move command", () => {
    const commands = expectOk(parseCommand("向右移动一点"));

    expect(commands[0]).toMatchObject({
      type: "move",
      direction: "right",
      distance: 36,
    });
  });

  it("parses destructive and global commands", () => {
    expect(expectOk(parseCommand("删除它"))[0]).toMatchObject({ type: "delete" });
    expect(expectOk(parseCommand("撤销"))[0]).toMatchObject({ type: "undo" });
    expect(expectOk(parseCommand("重做"))[0]).toMatchObject({ type: "redo" });
    expect(expectOk(parseCommand("再做一次"))[0]).toMatchObject({ type: "redo" });
    expect(expectOk(parseCommand("清空画布"))[0]).toMatchObject({ type: "clear" });
    expect(expectOk(parseCommand("导出为图片"))[0]).toMatchObject({ type: "export", format: "png" });
  });

  it("parses a simple compound command", () => {
    const commands = expectOk(parseCommand("画两个圆，并用箭头连接它们"));

    expect(commands).toHaveLength(3);
    expect(commands[0]).toMatchObject({
      type: "create",
      shape: "circle",
      position: {
        region: "left",
      },
    });
    expect(commands[1]).toMatchObject({
      type: "create",
      shape: "circle",
      position: {
        region: "right",
      },
    });
    expect(commands[2]).toMatchObject({
      type: "create",
      shape: "arrow",
      connection: {
        mode: "connect",
      },
    });
  });

  it("returns suggestions for unsupported commands", () => {
    const result = parseCommand("随便变得更好看");

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.suggestions.length).toBeGreaterThan(0);
    }
  });
});
