import { beforeEach, describe, expect, it } from "vitest";
import { clearProjectSnapshot } from "../src/canvas/projectStorage";
import { useDrawingStore } from "../src/state/store";

function resetStore() {
  clearProjectSnapshot();
  useDrawingStore.setState({
    objects: [],
    activeObjectId: undefined,
    lastCreatedObjectId: undefined,
    lastTranscript: "",
    lastInterimTranscript: "",
    voiceStatus: "idle",
    undoStack: [],
    redoStack: [],
    pendingExport: undefined,
    feedback: [],
  });
}

describe("useDrawingStore command loop", () => {
  beforeEach(() => {
    resetStore();
  });

  it("runs recognized command text through parser and executor", () => {
    const result = useDrawingStore.getState().runCommandText("画一个红色圆形");
    const state = useDrawingStore.getState();

    expect(result).toMatchObject({
      ok: true,
      changed: true,
      level: "success",
      commandCount: 1,
    });
    expect(state.lastTranscript).toBe("画一个红色圆形");
    expect(state.lastInterimTranscript).toBe("");
    expect(state.objects).toHaveLength(1);
    expect(state.objects[0]).toMatchObject({
      type: "circle",
      style: {
        fill: "#ef4444",
      },
    });
    expect(state.feedback[0]).toMatchObject({
      level: "success",
      message: "已创建图形。",
    });
  });

  it("returns and records a compound command result", () => {
    const result = useDrawingStore.getState().runCommandText("画两个圆，并用箭头连接它们");
    const state = useDrawingStore.getState();

    expect(result).toMatchObject({
      ok: true,
      changed: true,
      message: "已执行 3 个操作。",
      commandCount: 3,
    });
    expect(state.objects).toHaveLength(3);
    expect(state.feedback[0]).toMatchObject({
      level: "success",
      message: "已执行 3 个操作。",
    });
  });

  it("records unsupported commands as error feedback", () => {
    const result = useDrawingStore.getState().runCommandText("随便变得更好看");
    const state = useDrawingStore.getState();

    expect(result).toMatchObject({
      ok: false,
      changed: false,
      level: "error",
      commandCount: 0,
    });
    expect(state.objects).toHaveLength(0);
    expect(state.feedback[0].level).toBe("error");
  });

  it("updates interim transcript and voice status independently", () => {
    const store = useDrawingStore.getState();

    store.setInterimTranscript("画一个");
    store.setVoiceStatus("listening");

    expect(useDrawingStore.getState().lastInterimTranscript).toBe("画一个");
    expect(useDrawingStore.getState().voiceStatus).toBe("listening");
  });

  it("returns spoken messages for undo and redo", () => {
    const store = useDrawingStore.getState();

    store.runCommandText("画一个蓝色矩形");
    const undo = useDrawingStore.getState().runCommandText("撤销");
    const redo = useDrawingStore.getState().runCommandText("重做");

    expect(undo).toMatchObject({
      ok: true,
      changed: true,
      message: "已撤销。",
    });
    expect(redo).toMatchObject({
      ok: true,
      changed: true,
      message: "已重做。",
    });
  });

  it("renames the active object and moves it by spoken name", () => {
    const store = useDrawingStore.getState();

    store.runCommandText("画一个红色圆形");
    const rename = useDrawingStore.getState().runCommandText("把它命名为开始节点");
    const move = useDrawingStore.getState().runCommandText("移动开始节点向右");
    const state = useDrawingStore.getState();

    expect(rename).toMatchObject({
      ok: true,
      changed: true,
      message: "已将图形命名为“开始”。",
    });
    expect(move).toMatchObject({
      ok: true,
      changed: true,
      message: "已移动图形。",
    });
    expect(state.objects[0]).toMatchObject({
      name: "开始",
      x: 516,
    });
    expect(state.feedback[0]).toMatchObject({
      level: "success",
      message: "已移动图形。",
    });
  });

  it("reports missing named targets without changing canvas", () => {
    useDrawingStore.getState().runCommandText("画一个红色圆形");
    const result = useDrawingStore.getState().runCommandText("移动开始节点向右");
    const state = useDrawingStore.getState();

    expect(result).toMatchObject({
      ok: true,
      changed: false,
      message: "没有找到名为“开始”的对象，无法移动。",
    });
    expect(state.objects[0].x).toBe(480);
  });

  it("runs position based object targeting through the voice command loop", () => {
    const store = useDrawingStore.getState();

    store.runCommandText("画两个圆");
    const result = useDrawingStore.getState().runCommandText("把左边那个圆改成绿色");
    const state = useDrawingStore.getState();

    expect(result).toMatchObject({
      ok: true,
      changed: true,
      message: "已更新图形。",
    });
    expect(state.objects[0]).toMatchObject({
      x: 260,
      style: {
        fill: "#16a34a",
      },
    });
    expect(state.objects[1].style.fill).toBeUndefined();
  });

  it("changes layer order through voice commands and supports undo", () => {
    const store = useDrawingStore.getState();

    store.runCommandText("画两个圆");
    const initialOrder = useDrawingStore.getState().objects.map((object) => object.id);
    const result = useDrawingStore.getState().runCommandText("把左边那个圆置顶");
    const layeredState = useDrawingStore.getState();
    const undoResult = useDrawingStore.getState().runCommandText("撤销");
    const undoState = useDrawingStore.getState();

    expect(result).toMatchObject({
      ok: true,
      changed: true,
      message: "已将图形置于顶层。",
      level: "success",
    });
    expect(layeredState.objects.map((object) => object.id)).toEqual([initialOrder[1], initialOrder[0]]);
    expect(layeredState.activeObjectId).toBe(initialOrder[0]);
    expect(undoResult).toMatchObject({
      ok: true,
      changed: true,
      message: "已撤销。",
    });
    expect(undoState.objects.map((object) => object.id)).toEqual(initialOrder);
  });

  it("creates an export request for non-empty canvas", () => {
    const store = useDrawingStore.getState();

    store.runCommandText("画一个红色圆形");
    const result = useDrawingStore.getState().runCommandText("导出为图片");
    const state = useDrawingStore.getState();

    expect(result).toMatchObject({
      ok: true,
      changed: false,
      exportRequested: true,
      message: "正在导出 PNG 文件。",
    });
    expect(state.pendingExport).toMatchObject({
      format: "png",
      objects: [
        {
          type: "circle",
        },
      ],
    });
    expect(state.pendingExport?.filename).toMatch(/^ai-voice-drawing-\d{8}-\d{6}\.png$/);
  });

  it("does not create an export request for empty canvas", () => {
    const result = useDrawingStore.getState().runCommandText("导出为图片");
    const state = useDrawingStore.getState();

    expect(result).toMatchObject({
      ok: true,
      changed: false,
      exportRequested: false,
      message: "画布为空，无法导出 PNG 文件。",
    });
    expect(state.pendingExport).toBeUndefined();
  });

  it("creates an svg export request for non-empty canvas", () => {
    const store = useDrawingStore.getState();

    store.runCommandText("画一个蓝色矩形");
    const result = useDrawingStore.getState().runCommandText("导出为 SVG");
    const state = useDrawingStore.getState();

    expect(result).toMatchObject({
      ok: true,
      changed: false,
      exportRequested: true,
      message: "正在导出 SVG 文件。",
    });
    expect(state.pendingExport).toMatchObject({
      format: "svg",
      objects: [
        {
          type: "rect",
        },
      ],
    });
    expect(state.pendingExport?.filename).toMatch(/^ai-voice-drawing-\d{8}-\d{6}\.svg$/);
  });

  it("creates a json export request for non-empty canvas", () => {
    const store = useDrawingStore.getState();

    store.runCommandText("画一个蓝色矩形");
    const activeObjectId = useDrawingStore.getState().activeObjectId;
    const result = useDrawingStore.getState().runCommandText("导出为 JSON");
    const state = useDrawingStore.getState();

    expect(result).toMatchObject({
      ok: true,
      changed: false,
      exportRequested: true,
      message: "正在导出 JSON 文件。",
    });
    expect(state.pendingExport).toMatchObject({
      format: "json",
      activeObjectId,
      objects: [
        {
          type: "rect",
        },
      ],
    });
    expect(state.pendingExport?.filename).toMatch(/^ai-voice-drawing-\d{8}-\d{6}\.json$/);
  });

  it("saves and loads project snapshots through voice commands", () => {
    const store = useDrawingStore.getState();

    store.runCommandText("画一个红色圆形");
    store.runCommandText("把它命名为开始节点");
    const savedObjectId = useDrawingStore.getState().objects[0].id;
    const saveResult = useDrawingStore.getState().runCommandText("保存工程");

    useDrawingStore.getState().runCommandText("清空画布");
    const loadResult = useDrawingStore.getState().runCommandText("加载工程");
    const state = useDrawingStore.getState();

    expect(saveResult).toMatchObject({
      ok: true,
      changed: false,
      message: "已保存工程。",
      level: "success",
    });
    expect(loadResult).toMatchObject({
      ok: true,
      changed: true,
      message: "已加载工程。",
      level: "success",
    });
    expect(state.activeObjectId).toBe(savedObjectId);
    expect(state.objects).toHaveLength(1);
    expect(state.objects[0]).toMatchObject({
      id: savedObjectId,
      type: "circle",
      name: "开始",
    });
  });

  it("reports unavailable project snapshots without changing canvas", () => {
    const result = useDrawingStore.getState().runCommandText("加载工程");
    const state = useDrawingStore.getState();

    expect(result).toMatchObject({
      ok: true,
      changed: false,
      message: "没有可加载的工程。",
      level: "info",
    });
    expect(state.objects).toHaveLength(0);
  });

  it("does not save empty project snapshots", () => {
    const result = useDrawingStore.getState().runCommandText("保存工程");

    expect(result).toMatchObject({
      ok: true,
      changed: false,
      message: "画布为空，无法保存工程。",
      level: "info",
    });
  });

  it("clears pending export after completion feedback", () => {
    const store = useDrawingStore.getState();

    store.runCommandText("画一个蓝色矩形");
    useDrawingStore.getState().runCommandText("导出为图片");
    useDrawingStore.getState().completeExport("已导出 PNG 图片。", "success");

    expect(useDrawingStore.getState().pendingExport).toBeUndefined();
    expect(useDrawingStore.getState().feedback[0]).toMatchObject({
      level: "success",
      message: "已导出 PNG 图片。",
    });
  });
});
