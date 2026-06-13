import { create } from "zustand";
import type { StateCreator } from "zustand";
import { createAiCommandPlanner, createConfiguredAiCommandProvider } from "../ai";
import type { AiClarification } from "../ai";
import { createCanvasExportRequest, type CanvasExportRequest } from "../canvas/export";
import { loadProjectSnapshot, saveProjectSnapshot } from "../canvas/projectStorage";
import { executeDrawingCommand } from "../commands/executor";
import { normalizeCommands } from "../commands/normalizer";
import { parseCommand } from "../commands/parser";
import type { CanvasObject, CanvasSnapshot, DrawingCommand, FeedbackLevel, FeedbackMessage } from "../commands/types";
import type { SpeechStatus } from "../speech/SpeechInput";

export type AiExecutionStatus = "off" | "idle" | "planning" | "waiting-clarification" | "waiting-confirmation" | "error";

export type CommandRunResult = {
  ok: boolean;
  changed: boolean;
  message: string;
  level: FeedbackLevel;
  commandCount: number;
  exportRequested?: boolean;
  source?: "rules" | "ai";
  awaitingConfirmation?: boolean;
};

export type PendingAiCommandPlan = {
  providerId: string;
  commands: DrawingCommand[];
  commandCount: number;
  explanation: string;
  confidence: number;
  resolvedText: string;
};

type DrawingState = {
  objects: CanvasObject[];
  activeObjectId?: string;
  lastCreatedObjectId?: string;
  lastTranscript: string;
  lastInterimTranscript: string;
  voiceStatus: SpeechStatus;
  aiEnabled: boolean;
  aiStatus: AiExecutionStatus;
  pendingAiClarification?: AiClarification;
  pendingAiPlan?: PendingAiCommandPlan;
  undoStack: CanvasSnapshot[];
  redoStack: CanvasSnapshot[];
  pendingExport?: CanvasExportRequest;
  feedback: FeedbackMessage[];
  runCommandText: (text: string) => CommandRunResult;
  runVoiceCommandText: (text: string) => Promise<CommandRunResult>;
  setAiEnabled: (enabled: boolean) => void;
  toggleAiEnabled: () => void;
  addFeedback: (message: string, level?: FeedbackLevel) => void;
  completeExport: (message: string, level: FeedbackLevel) => void;
  setInterimTranscript: (text: string) => void;
  setVoiceStatus: (status: SpeechStatus) => void;
};

const aiPlanner = createAiCommandPlanner(createConfiguredAiCommandProvider());

export const useDrawingStore = create<DrawingState>((set, get) => ({
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
  feedback: [createFeedback("工作台已就绪。", "info")],

  runCommandText: (text) => {
    set({ lastTranscript: text, lastInterimTranscript: "" });

    const parsed = parseCommand(text);

    if (!parsed.ok) {
      const message = withSuggestions(parsed.reason, parsed.suggestions);
      get().addFeedback(message, "error");

      return {
        ok: false,
        changed: false,
        message,
        level: "error",
        commandCount: 0,
        source: "rules",
      };
    }

    return executeCommandList(parsed.commands, set, get, { source: "rules" });
  },

  runVoiceCommandText: async (text) => {
    const trimmedText = text.trim();
    const normalizedText = trimmedText.replace(/\s+/g, "");
    set({ lastTranscript: text, lastInterimTranscript: "" });

    if (isEnableAiText(normalizedText)) {
      get().setAiEnabled(true);

      return {
        ok: true,
        changed: false,
        message: "AI 解析已开启。",
        level: "info",
        commandCount: 0,
        source: "rules",
      };
    }

    if (isDisableAiText(normalizedText)) {
      get().setAiEnabled(false);

      return {
        ok: true,
        changed: false,
        message: "AI 解析已关闭。",
        level: "info",
        commandCount: 0,
        source: "rules",
      };
    }

    const state = get();

    if (state.pendingAiPlan && isConfirmAiText(normalizedText)) {
      return executePendingAiPlan(set, get);
    }

    if ((state.pendingAiPlan || state.pendingAiClarification) && isCancelAiText(normalizedText)) {
      aiPlanner.clearPendingClarification();
      const message = "已取消 AI 命令计划。";

      set((current) => ({
        pendingAiPlan: undefined,
        pendingAiClarification: undefined,
        aiStatus: current.aiEnabled ? "idle" : "off",
        feedback: [createFeedback(message, "info"), ...current.feedback].slice(0, 6),
      }));

      return {
        ok: true,
        changed: false,
        message,
        level: "info",
        commandCount: 0,
        source: "ai",
      };
    }

    if (state.pendingAiPlan) {
      const message = "请先说“确认执行”或“取消”。";
      get().addFeedback(message, "info");

      return {
        ok: true,
        changed: false,
        message,
        level: "info",
        commandCount: state.pendingAiPlan.commandCount,
        source: "ai",
        awaitingConfirmation: true,
      };
    }

    if (state.aiEnabled && state.pendingAiClarification) {
      return runAiPlanner(trimmedText, set, get);
    }

    const parsed = parseCommand(text);

    if (parsed.ok) {
      return executeCommandList(parsed.commands, set, get, { source: "rules" });
    }

    if (state.aiEnabled) {
      return runAiPlanner(trimmedText, set, get);
    }

    const message = withSuggestions(parsed.reason, parsed.suggestions);
    get().addFeedback(message, "error");

    return {
      ok: false,
      changed: false,
      message,
      level: "error",
      commandCount: 0,
      source: "rules",
    };
  },

  setAiEnabled: (enabled) => {
    aiPlanner.clearPendingClarification();
    const message = enabled ? "AI 解析已开启。" : "AI 解析已关闭。";

    set((state) => ({
      aiEnabled: enabled,
      aiStatus: enabled ? "idle" : "off",
      pendingAiClarification: undefined,
      pendingAiPlan: undefined,
      feedback: [createFeedback(message, "info"), ...state.feedback].slice(0, 6),
    }));
  },

  toggleAiEnabled: () => {
    get().setAiEnabled(!get().aiEnabled);
  },

  addFeedback: (message, level = "info") => {
    set((state) => ({
      feedback: [createFeedback(message, level), ...state.feedback].slice(0, 6),
    }));
  },

  completeExport: (message, level) => {
    set((state) => ({
      pendingExport: undefined,
      feedback: [createFeedback(message, level), ...state.feedback].slice(0, 6),
    }));
  },

  setInterimTranscript: (text) => {
    set({ lastInterimTranscript: text });
  },

  setVoiceStatus: (status) => {
    set({ voiceStatus: status });
  },
}));

async function runAiPlanner(text: string, set: StoreSet, get: StoreGet): Promise<CommandRunResult> {
  if (!text) {
    const message = "没有识别到有效语音。";
    get().addFeedback(message, "error");

    return {
      ok: false,
      changed: false,
      message,
      level: "error",
      commandCount: 0,
      source: "ai",
    };
  }

  set({
    aiStatus: "planning",
    pendingAiPlan: undefined,
  });

  const state = get();
  const plan = await aiPlanner.plan(text, {
    objects: state.objects,
    activeObjectId: state.activeObjectId,
    lastCreatedObjectId: state.lastCreatedObjectId,
    locale: "zh-CN",
  });

  if (plan.status === "needs-clarification") {
    const message = plan.clarification.question;

    set((current) => ({
      aiStatus: "waiting-clarification",
      pendingAiClarification: plan.clarification,
      pendingAiPlan: undefined,
      feedback: [createFeedback(message, "info"), ...current.feedback].slice(0, 6),
    }));

    return {
      ok: true,
      changed: false,
      message,
      level: "info",
      commandCount: 0,
      source: "ai",
    };
  }

  if (plan.status === "failed") {
    const message = withSuggestions(plan.reason, plan.suggestions);

    set((current) => ({
      aiStatus: "error",
      pendingAiClarification: undefined,
      pendingAiPlan: undefined,
      feedback: [createFeedback(message, "error"), ...current.feedback].slice(0, 6),
    }));

    return {
      ok: false,
      changed: false,
      message,
      level: "error",
      commandCount: 0,
      source: "ai",
    };
  }

  if (plan.status === "insight") {
    set((current) => ({
      aiStatus: current.aiEnabled ? "idle" : "off",
      pendingAiClarification: undefined,
      pendingAiPlan: undefined,
      feedback: [createFeedback(plan.message, "info"), ...current.feedback].slice(0, 6),
    }));

    return {
      ok: true,
      changed: false,
      message: plan.message,
      level: "info",
      commandCount: 0,
      source: "ai",
    };
  }

  if (plan.requiresConfirmation) {
    const pendingPlan: PendingAiCommandPlan = {
      providerId: plan.providerId,
      commands: plan.commands,
      commandCount: plan.commandCount,
      explanation: plan.explanation,
      confidence: plan.confidence,
      resolvedText: plan.resolvedText,
    };
    const message = `AI 已生成 ${plan.commandCount} 个操作：${plan.explanation} 请说“确认执行”或“取消”。`;

    set((current) => ({
      aiStatus: "waiting-confirmation",
      pendingAiClarification: undefined,
      pendingAiPlan: pendingPlan,
      feedback: [createFeedback(message, "info"), ...current.feedback].slice(0, 6),
    }));

    return {
      ok: true,
      changed: false,
      message,
      level: "info",
      commandCount: plan.commandCount,
      source: "ai",
      awaitingConfirmation: true,
    };
  }

  set({
    aiStatus: "idle",
    pendingAiClarification: undefined,
    pendingAiPlan: undefined,
  });

  return executeCommandList(plan.commands, set, get, {
    source: "ai",
    successMessage: `AI 已执行 ${plan.commandCount} 个操作。`,
  });
}

function executePendingAiPlan(set: StoreSet, get: StoreGet): CommandRunResult {
  const state = get();
  const plan = state.pendingAiPlan;

  if (!plan) {
    const message = "没有待确认的 AI 命令计划。";
    state.addFeedback(message, "info");

    return {
      ok: true,
      changed: false,
      message,
      level: "info",
      commandCount: 0,
      source: "ai",
    };
  }

  set({
    pendingAiPlan: undefined,
    pendingAiClarification: undefined,
    aiStatus: state.aiEnabled ? "idle" : "off",
  });

  return executeCommandList(plan.commands, set, get, {
    source: "ai",
    successMessage: `AI 已执行 ${plan.commandCount} 个操作。`,
  });
}

function executeCommandList(
  rawCommands: DrawingCommand[],
  set: StoreSet,
  get: StoreGet,
  options: { source: "rules" | "ai"; successMessage?: string },
): CommandRunResult {
  const currentState = get();
  const commands = normalizeCommands(rawCommands, {
    activeObjectId: currentState.activeObjectId,
    lastCreatedObjectId: currentState.lastCreatedObjectId,
  });

  if (commands.some((command) => command.type === "undo")) {
    return runUndo(set, get, options.source);
  }

  if (commands.some((command) => command.type === "redo")) {
    return runRedo(set, get, options.source);
  }

  const before: CanvasSnapshot = {
    objects: currentState.objects,
    activeObjectId: currentState.activeObjectId,
  };

  let nextObjects = currentState.objects;
  let nextActiveObjectId = currentState.activeObjectId;
  let changed = false;
  let message = "指令已执行。";
  let pendingExport: CanvasExportRequest | undefined;
  let feedbackLevel: FeedbackLevel = "info";

  commands.forEach((command) => {
    if (command.type === "project") {
      if (command.action === "save") {
        if (nextObjects.length === 0) {
          message = "画布为空，无法保存工程。";
          return;
        }

        saveProjectSnapshot(nextObjects, nextActiveObjectId);
        message = "已保存工程。";
        feedbackLevel = "success";
        return;
      }

      const project = loadProjectSnapshot();

      if (!project) {
        message = "没有可加载的工程。";
        return;
      }

      nextObjects = project.objects;
      nextActiveObjectId = project.activeObjectId;
      changed = true;
      message = "已加载工程。";
      feedbackLevel = "success";
      return;
    }

    const result = executeDrawingCommand(command, {
      objects: nextObjects,
      activeObjectId: nextActiveObjectId,
    });

    nextObjects = result.objects;
    nextActiveObjectId = result.activeObjectId;
    changed = changed || result.changed;
    message = result.message;

    if (command.type === "export" && nextObjects.length > 0) {
      pendingExport = createCanvasExportRequest(nextObjects, command.format, nextActiveObjectId);
    }
  });

  const fallbackMessage = changed && commands.length > 1 && !pendingExport ? `已执行 ${commands.length} 个操作。` : message;
  const feedbackMessage = options.successMessage && changed && !pendingExport ? options.successMessage : fallbackMessage;
  feedbackLevel = changed ? "success" : feedbackLevel;

  set((state) => ({
    objects: nextObjects,
    activeObjectId: nextActiveObjectId,
    lastCreatedObjectId: nextActiveObjectId,
    undoStack: changed ? [...state.undoStack, before] : state.undoStack,
    redoStack: changed ? [] : state.redoStack,
    pendingExport,
    aiStatus: options.source === "ai" ? (state.aiEnabled ? "idle" : "off") : state.aiStatus,
    pendingAiClarification: options.source === "ai" ? undefined : state.pendingAiClarification,
    pendingAiPlan: options.source === "ai" ? undefined : state.pendingAiPlan,
    feedback: [createFeedback(feedbackMessage, feedbackLevel), ...state.feedback].slice(0, 6),
  }));

  return {
    ok: true,
    changed,
    message: feedbackMessage,
    level: feedbackLevel,
    commandCount: commands.length,
    exportRequested: Boolean(pendingExport),
    source: options.source,
  };
}

function runUndo(set: StoreSet, get: StoreGet, source: "rules" | "ai" = "rules"): CommandRunResult {
  const state = get();
  const snapshot = state.undoStack[state.undoStack.length - 1];

  if (!snapshot) {
    const message = "没有可撤销的操作。";
    state.addFeedback(message, "info");

    return {
      ok: true,
      changed: false,
      message,
      level: "info",
      commandCount: 1,
      source,
    };
  }

  const message = "已撤销。";

  set({
    objects: snapshot.objects,
    activeObjectId: snapshot.activeObjectId,
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, { objects: state.objects, activeObjectId: state.activeObjectId }],
    feedback: [createFeedback(message, "success"), ...state.feedback].slice(0, 6),
  });

  return {
    ok: true,
    changed: true,
    message,
    level: "success",
    commandCount: 1,
    source,
  };
}

function runRedo(set: StoreSet, get: StoreGet, source: "rules" | "ai" = "rules"): CommandRunResult {
  const state = get();
  const snapshot = state.redoStack[state.redoStack.length - 1];

  if (!snapshot) {
    const message = "没有可重做的操作。";
    state.addFeedback(message, "info");

    return {
      ok: true,
      changed: false,
      message,
      level: "info",
      commandCount: 1,
      source,
    };
  }

  const message = "已重做。";

  set({
    objects: snapshot.objects,
    activeObjectId: snapshot.activeObjectId,
    redoStack: state.redoStack.slice(0, -1),
    undoStack: [...state.undoStack, { objects: state.objects, activeObjectId: state.activeObjectId }],
    feedback: [createFeedback(message, "success"), ...state.feedback].slice(0, 6),
  });

  return {
    ok: true,
    changed: true,
    message,
    level: "success",
    commandCount: 1,
    source,
  };
}

function isConfirmAiText(text: string) {
  return /^(确认|确认执行|执行|开始执行|可以|好的|好)$/.test(text);
}

function isEnableAiText(text: string) {
  return /^(开启|打开|启用)(AI|ai)?(解析|助手|模式)?$/.test(text) || /^(开启|打开|启用)AI解析$/.test(text);
}

function isDisableAiText(text: string) {
  return /^(关闭|停用)(AI|ai)?(解析|助手|模式)?$/.test(text) || /^(关闭|停用)AI解析$/.test(text);
}

function isCancelAiText(text: string) {
  return /^(取消|取消执行|不要|不用|算了|停止)$/.test(text);
}

function withSuggestions(reason: string, suggestions: string[]) {
  return suggestions.length > 0 ? `${reason} 可尝试：${suggestions.join("、")}` : reason;
}

function createFeedback(message: string, level: FeedbackLevel): FeedbackMessage {
  return {
    id: `feedback-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    message,
    level,
    createdAt: Date.now(),
  };
}

type StoreSet = Parameters<StateCreator<DrawingState>>[0];
type StoreGet = Parameters<StateCreator<DrawingState>>[1];
