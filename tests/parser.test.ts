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

  it("uses the shape after the create verb when a target object is mentioned", () => {
    const commands = expectOk(parseCommand("在这个圆形旁边画一个红色实心的矩形"));

    expect(commands[0]).toMatchObject({
      type: "create",
      shape: "rect",
      style: {
        fill: "#ef4444",
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

  it("parses object rename and named target commands", () => {
    const renameCommands = expectOk(parseCommand("把它命名为开始节点"));
    const renameCurrentShapeCommands = expectOk(parseCommand("把这个圆命名为入口"));
    const moveCommands = expectOk(parseCommand("移动开始节点向右"));
    const colorCommands = expectOk(parseCommand("把开始节点改成绿色"));
    const deleteCommands = expectOk(parseCommand("删除开始节点"));

    expect(renameCommands[0]).toMatchObject({
      type: "rename",
      target: {
        ref: "active",
      },
      name: "开始",
    });
    expect(renameCurrentShapeCommands[0]).toMatchObject({
      type: "rename",
      target: {
        ref: "active",
      },
      name: "入口",
    });
    expect(moveCommands[0]).toMatchObject({
      type: "move",
      target: {
        ref: "name",
        name: "开始",
      },
      direction: "right",
    });
    expect(colorCommands[0]).toMatchObject({
      type: "update",
      target: {
        ref: "name",
        name: "开始",
      },
      patch: {
        fill: "#16a34a",
      },
    });
    expect(deleteCommands[0]).toMatchObject({
      type: "delete",
      target: {
        ref: "name",
        name: "开始",
      },
    });
  });

  it("parses positional and size based target commands", () => {
    const colorCommands = expectOk(parseCommand("把左边那个圆改成绿色"));
    const moveCommands = expectOk(parseCommand("移动最大的矩形向右"));
    const deleteCommands = expectOk(parseCommand("删除右边的圆"));

    expect(colorCommands[0]).toMatchObject({
      type: "update",
      target: {
        ref: "query",
        query: {
          region: "left",
          shape: "circle",
        },
      },
      patch: {
        fill: "#16a34a",
      },
    });
    expect(moveCommands[0]).toMatchObject({
      type: "move",
      target: {
        ref: "query",
        query: {
          sizeRank: "largest",
          shape: "rect",
        },
      },
      direction: "right",
    });
    expect(deleteCommands[0]).toMatchObject({
      type: "delete",
      target: {
        ref: "query",
        query: {
          region: "right",
          shape: "circle",
        },
      },
    });
  });

  it("parses layer order commands", () => {
    const frontCommands = expectOk(parseCommand("把它置顶"));
    const backCommands = expectOk(parseCommand("把开始节点置底"));
    const forwardCommands = expectOk(parseCommand("把左边那个圆上移一层"));
    const backwardCommands = expectOk(parseCommand("把最大的矩形下移一层"));

    expect(frontCommands[0]).toMatchObject({
      type: "layer",
      target: {
        ref: "active",
      },
      action: "front",
    });
    expect(backCommands[0]).toMatchObject({
      type: "layer",
      target: {
        ref: "name",
        name: "开始",
      },
      action: "back",
    });
    expect(forwardCommands[0]).toMatchObject({
      type: "layer",
      target: {
        ref: "query",
        query: {
          region: "left",
          shape: "circle",
        },
      },
      action: "forward",
    });
    expect(backwardCommands[0]).toMatchObject({
      type: "layer",
      target: {
        ref: "query",
        query: {
          sizeRank: "largest",
          shape: "rect",
        },
      },
      action: "backward",
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
    expect(expectOk(parseCommand("导出为 SVG"))[0]).toMatchObject({ type: "export", format: "svg" });
    expect(expectOk(parseCommand("下载 SVG"))[0]).toMatchObject({ type: "export", format: "svg" });
    expect(expectOk(parseCommand("保存为矢量图"))[0]).toMatchObject({ type: "export", format: "svg" });
    expect(expectOk(parseCommand("导出为 JSON"))[0]).toMatchObject({ type: "export", format: "json" });
    expect(expectOk(parseCommand("导出工程文件"))[0]).toMatchObject({ type: "export", format: "json" });
    expect(expectOk(parseCommand("保存工程"))[0]).toMatchObject({ type: "project", action: "save" });
    expect(expectOk(parseCommand("加载工程"))[0]).toMatchObject({ type: "project", action: "load" });
    expect(expectOk(parseCommand("恢复工程"))[0]).toMatchObject({ type: "project", action: "load" });
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
