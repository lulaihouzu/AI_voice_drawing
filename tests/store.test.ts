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
    aiEnabled: false,
    aiStatus: "off",
    pendingAiClarification: undefined,
    pendingAiPlan: undefined,
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

  it("keeps AI disabled unless the user turns it on", async () => {
    const result = await useDrawingStore.getState().runVoiceCommandText("帮我生成一个用户登录流程图");
    const state = useDrawingStore.getState();

    expect(result).toMatchObject({
      ok: false,
      changed: false,
      source: "rules",
    });
    expect(state.aiEnabled).toBe(false);
    expect(state.aiStatus).toBe("off");
    expect(state.pendingAiPlan).toBeUndefined();
  });

  it("toggles AI parsing through voice commands", async () => {
    const enableResult = await useDrawingStore.getState().runVoiceCommandText("开启 AI 解析");
    const enabledState = useDrawingStore.getState();
    const disableResult = await useDrawingStore.getState().runVoiceCommandText("关闭AI解析");
    const disabledState = useDrawingStore.getState();

    expect(enableResult).toMatchObject({
      ok: true,
      changed: false,
      message: "AI 解析已开启。",
    });
    expect(enabledState.aiEnabled).toBe(true);
    expect(enabledState.aiStatus).toBe("idle");
    expect(disableResult).toMatchObject({
      ok: true,
      changed: false,
      message: "AI 解析已关闭。",
    });
    expect(disabledState.aiEnabled).toBe(false);
    expect(disabledState.aiStatus).toBe("off");
  });

  it("runs supported rule commands directly when AI is enabled", async () => {
    const store = useDrawingStore.getState();

    store.setAiEnabled(true);
    const result = await useDrawingStore.getState().runVoiceCommandText("画一个红色圆形");
    const state = useDrawingStore.getState();

    expect(result).toMatchObject({
      ok: true,
      changed: true,
      source: "rules",
      commandCount: 1,
    });
    expect(state.aiStatus).toBe("idle");
    expect(state.objects[0]).toMatchObject({
      type: "circle",
      style: {
        fill: "#ef4444",
      },
    });
  });

  it("creates and confirms an AI command plan from voice input", async () => {
    const store = useDrawingStore.getState();

    store.setAiEnabled(true);
    const planResult = await useDrawingStore.getState().runVoiceCommandText("帮我生成一个用户登录流程图");
    const plannedState = useDrawingStore.getState();

    expect(planResult).toMatchObject({
      ok: true,
      changed: false,
      source: "ai",
      awaitingConfirmation: true,
      commandCount: 5,
    });
    expect(plannedState.aiStatus).toBe("waiting-confirmation");
    expect(plannedState.pendingAiPlan).toMatchObject({
      commandCount: 5,
      resolvedText: "帮我生成一个用户登录流程图",
    });
    expect(plannedState.objects).toHaveLength(0);

    const confirmResult = await useDrawingStore.getState().runVoiceCommandText("确认执行");
    const confirmedState = useDrawingStore.getState();

    expect(confirmResult).toMatchObject({
      ok: true,
      changed: true,
      source: "ai",
      message: "AI 已执行 5 个操作。",
      commandCount: 5,
    });
    expect(confirmedState.aiStatus).toBe("idle");
    expect(confirmedState.pendingAiPlan).toBeUndefined();
    expect(confirmedState.objects).toHaveLength(5);
  });

  it("creates a one sentence order diagram through the AI voice flow", async () => {
    const store = useDrawingStore.getState();

    store.setAiEnabled(true);
    const planResult = await useDrawingStore.getState().runVoiceCommandText("帮我生成一个订单支付流程图");
    const plannedState = useDrawingStore.getState();

    expect(planResult).toMatchObject({
      ok: true,
      changed: false,
      source: "ai",
      awaitingConfirmation: true,
      commandCount: 7,
    });
    expect(plannedState.pendingAiPlan).toMatchObject({
      commandCount: 7,
      resolvedText: "帮我生成一个订单支付流程图",
    });

    const confirmResult = await useDrawingStore.getState().runVoiceCommandText("确认执行");
    const confirmedState = useDrawingStore.getState();

    expect(confirmResult).toMatchObject({
      ok: true,
      changed: true,
      source: "ai",
      message: "AI 已执行 7 个操作。",
      commandCount: 7,
    });
    expect(confirmedState.objects).toHaveLength(7);
    expect(confirmedState.objects.filter((object) => object.type === "text").map((object) => object.text)).toEqual([
      "选择商品",
      "提交订单",
      "完成支付",
      "等待发货",
    ]);
  });

  it("returns canvas insight feedback without AI confirmation", async () => {
    const store = useDrawingStore.getState();

    store.setAiEnabled(true);
    store.runCommandText("画一个红色圆形");
    const result = await useDrawingStore.getState().runVoiceCommandText("现在画布里有什么");
    const state = useDrawingStore.getState();

    expect(result).toMatchObject({
      ok: true,
      changed: false,
      source: "ai",
      commandCount: 0,
    });
    expect(result.message).toContain("当前画布共有 1 个对象");
    expect(state.aiStatus).toBe("idle");
    expect(state.pendingAiPlan).toBeUndefined();
    expect(state.feedback[0].message).toContain("当前画布共有 1 个对象");
    expect(state.objects).toHaveLength(1);
  });

  it("asks for clarification and resolves it before AI confirmation", async () => {
    const store = useDrawingStore.getState();

    store.runCommandText("画两个圆");
    useDrawingStore.setState({
      activeObjectId: undefined,
      lastCreatedObjectId: undefined,
    });
    useDrawingStore.getState().setAiEnabled(true);

    const clarificationResult = await useDrawingStore.getState().runVoiceCommandText("帮我高亮这个图形");
    const clarificationState = useDrawingStore.getState();

    expect(clarificationResult).toMatchObject({
      ok: true,
      changed: false,
      source: "ai",
      message: "你想操作哪个对象？",
    });
    expect(clarificationState.aiStatus).toBe("waiting-clarification");
    expect(clarificationState.pendingAiClarification).toMatchObject({
      originalText: "帮我高亮这个图形",
    });

    const answerResult = await useDrawingStore.getState().runVoiceCommandText("左边的圆");
    const plannedState = useDrawingStore.getState();

    expect(answerResult).toMatchObject({
      ok: true,
      changed: false,
      source: "ai",
      awaitingConfirmation: true,
      commandCount: 2,
    });
    expect(plannedState.aiStatus).toBe("waiting-confirmation");
    expect(plannedState.pendingAiPlan).toMatchObject({
      commandCount: 2,
      resolvedText: "帮我高亮左边的圆",
    });

    const confirmResult = await useDrawingStore.getState().runVoiceCommandText("确认执行");
    const confirmedState = useDrawingStore.getState();

    expect(confirmResult).toMatchObject({
      ok: true,
      changed: true,
      message: "AI 已执行 2 个操作。",
    });
    expect(confirmedState.aiStatus).toBe("idle");
    expect(confirmedState.objects.find((object) => object.x === 260)).toMatchObject({
      style: {
        fill: "#facc15",
      },
    });
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
