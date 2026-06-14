import { describe, expect, it } from "vitest";
import { executeDrawingCommand, type ExecutionState } from "../src/commands/executor";
import type { CanvasObject } from "../src/commands/types";

function emptyState(): ExecutionState {
  return {
    objects: [],
    activeObjectId: undefined,
  };
}

function object(id: string, x: number): CanvasObject {
  return {
    id,
    type: "circle",
    x,
    y: 310,
    radius: 48,
    style: {
      stroke: "#1f2937",
      strokeWidth: 2,
    },
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("executeDrawingCommand", () => {
  it("creates sized shapes and marks the new object active", () => {
    const result = executeDrawingCommand(
      {
        type: "create",
        shape: "circle",
        size: "large",
        style: {
          fill: "#ef4444",
        },
        position: {
          region: "left",
        },
      },
      emptyState(),
    );

    expect(result.changed).toBe(true);
    expect(result.objects).toHaveLength(1);
    expect(result.activeObjectId).toBe(result.objects[0].id);
    expect(result.objects[0]).toMatchObject({
      type: "circle",
      radius: 72,
      x: 260,
      y: 310,
      style: {
        fill: "#ef4444",
        stroke: "#1f2937",
        strokeWidth: 2,
      },
    });
  });

  it("creates text objects with extracted content and font size", () => {
    const result = executeDrawingCommand(
      {
        type: "create",
        shape: "text",
        text: "开始",
        size: "small",
      },
      emptyState(),
    );

    expect(result.objects[0]).toMatchObject({
      type: "text",
      text: "开始",
      style: {
        fontSize: 22,
        stroke: "#1f2937",
      },
    });
  });

  it("places default new shapes beside the latest object instead of overlapping it", () => {
    const circle = executeDrawingCommand(
      {
        type: "create",
        shape: "circle",
        position: {
          region: "center",
        },
      },
      emptyState(),
    );
    const rect = executeDrawingCommand(
      {
        type: "create",
        shape: "rect",
        position: {
          region: "center",
        },
      },
      circle,
    );

    expect(rect.objects).toHaveLength(2);
    expect(rect.objects[1]).toMatchObject({
      type: "rect",
      x: 632,
      y: 310,
    });
  });

  it("keeps explicit non-center positions unchanged", () => {
    const circle = executeDrawingCommand(
      {
        type: "create",
        shape: "circle",
      },
      emptyState(),
    );
    const rect = executeDrawingCommand(
      {
        type: "create",
        shape: "rect",
        position: {
          region: "left",
        },
      },
      circle,
    );

    expect(rect.objects[1]).toMatchObject({
      type: "rect",
      x: 260,
      y: 310,
    });
  });

  it("creates an arrow between the last two drawable objects", () => {
    const first = executeDrawingCommand(
      {
        type: "create",
        shape: "circle",
        position: {
          region: "left",
        },
      },
      emptyState(),
    );
    const second = executeDrawingCommand(
      {
        type: "create",
        shape: "rect",
        position: {
          region: "right",
        },
      },
      first,
    );
    const connected = executeDrawingCommand(
      {
        type: "create",
        shape: "arrow",
        connection: {
          mode: "connect",
        },
      },
      second,
    );

    expect(connected.objects).toHaveLength(3);
    expect(connected.objects[2]).toMatchObject({
      type: "arrow",
      x: 260,
      y: 310,
      width: 440,
      height: 0,
    });
  });

  it("creates a pointed arrow from named source to target", () => {
    const circle = executeDrawingCommand(
      {
        type: "create",
        shape: "circle",
        position: {
          region: "top",
        },
      },
      emptyState(),
    );
    const rect = executeDrawingCommand(
      {
        type: "create",
        shape: "rect",
        position: {
          region: "bottom",
        },
      },
      circle,
    );
    const arrow = executeDrawingCommand(
      {
        type: "create",
        shape: "arrow",
        connection: {
          mode: "point-to",
          from: "圆形",
          to: "矩形",
        },
      },
      rect,
    );

    expect(arrow.objects[2]).toMatchObject({
      type: "arrow",
      x: 480,
      y: 160,
      width: 0,
      height: 300,
    });
  });

  it("renames objects and resolves later commands by name", () => {
    const created = executeDrawingCommand(
      {
        type: "create",
        shape: "circle",
        position: {
          region: "left",
        },
      },
      emptyState(),
    );
    const renamed = executeDrawingCommand(
      {
        type: "rename",
        target: {
          ref: "active",
        },
        name: "开始",
      },
      created,
    );
    const moved = executeDrawingCommand(
      {
        type: "move",
        target: {
          ref: "name",
          name: "开始",
        },
        direction: "right",
        distance: 36,
      },
      renamed,
    );
    const updated = executeDrawingCommand(
      {
        type: "update",
        target: {
          ref: "name",
          name: "开始",
        },
        patch: {
          fill: "#16a34a",
        },
      },
      moved,
    );

    expect(renamed).toMatchObject({
      changed: true,
      message: "已将图形命名为“开始”。",
    });
    expect(renamed.objects[0]).toMatchObject({
      name: "开始",
    });
    expect(moved.objects[0].x).toBe(296);
    expect(updated.objects[0].style.fill).toBe("#16a34a");
    expect(updated.activeObjectId).toBe(updated.objects[0].id);
  });

  it("rejects duplicate object names", () => {
    const first = executeDrawingCommand({ type: "create", shape: "circle" }, emptyState());
    const firstNamed = executeDrawingCommand(
      {
        type: "rename",
        target: {
          ref: "active",
        },
        name: "开始",
      },
      first,
    );
    const second = executeDrawingCommand({ type: "create", shape: "rect" }, firstNamed);
    const duplicate = executeDrawingCommand(
      {
        type: "rename",
        target: {
          ref: "active",
        },
        name: "开始",
      },
      second,
    );

    expect(duplicate).toMatchObject({
      changed: false,
      message: "名称“开始”已被使用。",
    });
    expect(duplicate.objects[1].name).toBeUndefined();
  });

  it("uses object names when creating arrows", () => {
    const start = executeDrawingCommand(
      {
        type: "create",
        shape: "circle",
        position: {
          region: "top",
        },
      },
      emptyState(),
    );
    const startNamed = executeDrawingCommand(
      {
        type: "rename",
        target: {
          ref: "active",
        },
        name: "开始",
      },
      start,
    );
    const end = executeDrawingCommand(
      {
        type: "create",
        shape: "rect",
        position: {
          region: "bottom",
        },
      },
      startNamed,
    );
    const endNamed = executeDrawingCommand(
      {
        type: "rename",
        target: {
          ref: "active",
        },
        name: "结束",
      },
      end,
    );
    const arrow = executeDrawingCommand(
      {
        type: "create",
        shape: "arrow",
        connection: {
          mode: "point-to",
          from: "开始节点",
          to: "结束节点",
        },
      },
      endNamed,
    );

    expect(arrow.objects[2]).toMatchObject({
      type: "arrow",
      x: 480,
      y: 160,
      width: 0,
      height: 300,
    });
  });

  it("resolves position and size based target queries", () => {
    const leftCircle = executeDrawingCommand(
      {
        type: "create",
        shape: "circle",
        position: {
          region: "left",
        },
      },
      emptyState(),
    );
    const rightCircle = executeDrawingCommand(
      {
        type: "create",
        shape: "circle",
        position: {
          region: "right",
        },
      },
      leftCircle,
    );
    const smallRect = executeDrawingCommand(
      {
        type: "create",
        shape: "rect",
        size: "small",
        position: {
          region: "top",
        },
      },
      rightCircle,
    );
    const largeRect = executeDrawingCommand(
      {
        type: "create",
        shape: "rect",
        size: "large",
        position: {
          region: "bottom",
        },
      },
      smallRect,
    );
    const updated = executeDrawingCommand(
      {
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
      },
      largeRect,
    );
    const movedLargest = executeDrawingCommand(
      {
        type: "move",
        target: {
          ref: "query",
          query: {
            shape: "rect",
            sizeRank: "largest",
          },
        },
        direction: "right",
        distance: 36,
      },
      updated,
    );
    const deletedRight = executeDrawingCommand(
      {
        type: "delete",
        target: {
          ref: "query",
          query: {
            region: "right",
            shape: "circle",
          },
        },
      },
      movedLargest,
    );

    expect(updated.objects[0].style.fill).toBe("#16a34a");
    expect(updated.objects[1].style.fill).toBeUndefined();
    expect(movedLargest.objects[3].x).toBe(516);
    expect(deletedRight.objects).toHaveLength(3);
    expect(deletedRight.objects.some((object) => object.id === rightCircle.objects[1].id)).toBe(false);
  });

  it("reports missing query targets", () => {
    const result = executeDrawingCommand(
      {
        type: "move",
        target: {
          ref: "query",
          query: {
            region: "left",
            shape: "circle",
          },
        },
        direction: "right",
      },
      emptyState(),
    );

    expect(result).toMatchObject({
      changed: false,
      message: "没有找到符合“左边圆形”的对象，无法移动。",
    });
  });

  it("reorders objects by layer commands", () => {
    const state: ExecutionState = {
      objects: [object("bottom", 240), object("middle", 480), object("top", 720)],
      activeObjectId: "middle",
    };
    const forward = executeDrawingCommand(
      {
        type: "layer",
        target: {
          ref: "active",
        },
        action: "forward",
      },
      state,
    );
    const front = executeDrawingCommand(
      {
        type: "layer",
        target: {
          ref: "name",
          name: "bottom",
        },
        action: "front",
      },
      {
        ...forward,
        objects: forward.objects.map((canvasObject) =>
          canvasObject.id === "bottom" ? { ...canvasObject, name: "bottom" } : canvasObject,
        ),
      },
    );
    const back = executeDrawingCommand(
      {
        type: "layer",
        target: {
          ref: "active",
        },
        action: "back",
      },
      front,
    );

    expect(forward).toMatchObject({
      changed: true,
      activeObjectId: "middle",
      message: "已上移一层。",
    });
    expect(forward.objects.map((canvasObject) => canvasObject.id)).toEqual(["bottom", "top", "middle"]);
    expect(front).toMatchObject({
      changed: true,
      activeObjectId: "bottom",
      message: "已将图形置于顶层。",
    });
    expect(front.objects.map((canvasObject) => canvasObject.id)).toEqual(["top", "middle", "bottom"]);
    expect(back).toMatchObject({
      changed: true,
      activeObjectId: "bottom",
      message: "已将图形置于底层。",
    });
    expect(back.objects.map((canvasObject) => canvasObject.id)).toEqual(["bottom", "top", "middle"]);
  });

  it("reports layer boundaries without changing order", () => {
    const state: ExecutionState = {
      objects: [object("bottom", 240), object("top", 720)],
      activeObjectId: "top",
    };
    const alreadyTop = executeDrawingCommand(
      {
        type: "layer",
        target: {
          ref: "active",
        },
        action: "forward",
      },
      state,
    );
    const alreadyBottom = executeDrawingCommand(
      {
        type: "layer",
        target: {
          ref: "name",
          name: "bottom",
        },
        action: "back",
      },
      {
        ...state,
        objects: state.objects.map((canvasObject) =>
          canvasObject.id === "bottom" ? { ...canvasObject, name: "bottom" } : canvasObject,
        ),
      },
    );

    expect(alreadyTop).toMatchObject({
      changed: false,
      message: "图形已经在顶层。",
    });
    expect(alreadyTop.objects.map((canvasObject) => canvasObject.id)).toEqual(["bottom", "top"]);
    expect(alreadyBottom).toMatchObject({
      changed: false,
      activeObjectId: "bottom",
      message: "图形已经在底层。",
    });
    expect(alreadyBottom.objects.map((canvasObject) => canvasObject.id)).toEqual(["bottom", "top"]);
  });

  it("updates, moves, deletes, and clears objects", () => {
    const created = executeDrawingCommand(
      {
        type: "create",
        shape: "rect",
      },
      emptyState(),
    );
    const updated = executeDrawingCommand(
      {
        type: "update",
        target: {
          ref: "active",
        },
        patch: {
          fill: "#16a34a",
          scale: 1.2,
        },
      },
      created,
    );
    const moved = executeDrawingCommand(
      {
        type: "move",
        target: {
          ref: "active",
        },
        direction: "right",
        distance: 36,
      },
      updated,
    );
    const deleted = executeDrawingCommand(
      {
        type: "delete",
        target: {
          ref: "active",
        },
      },
      moved,
    );
    const cleared = executeDrawingCommand({ type: "clear" }, created);

    expect(updated.objects[0]).toMatchObject({
      width: 153.6,
      height: 100.8,
      style: {
        fill: "#16a34a",
      },
    });
    expect(moved.objects[0].x).toBe(516);
    expect(deleted.objects).toHaveLength(0);
    expect(cleared.objects).toHaveLength(0);
  });
});
