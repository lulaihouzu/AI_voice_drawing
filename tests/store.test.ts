import { beforeEach, describe, expect, it } from "vitest";
import { useDrawingStore } from "../src/state/store";

function resetStore() {
  useDrawingStore.setState({
    objects: [],
    activeObjectId: undefined,
    lastCreatedObjectId: undefined,
    lastTranscript: "",
    lastInterimTranscript: "",
    voiceStatus: "idle",
    undoStack: [],
    redoStack: [],
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
});
