import { create } from "zustand";
import type { StateCreator } from "zustand";
import { createCanvasExportRequest, type CanvasExportRequest } from "../canvas/export";
import { executeDrawingCommand } from "../commands/executor";
import { normalizeCommands } from "../commands/normalizer";
import { parseCommand } from "../commands/parser";
import type { CanvasObject, CanvasSnapshot, FeedbackLevel, FeedbackMessage } from "../commands/types";
import type { SpeechStatus } from "../speech/SpeechInput";

export type CommandRunResult = {
  ok: boolean;
  changed: boolean;
  message: string;
  level: FeedbackLevel;
  commandCount: number;
  exportRequested?: boolean;
};

type DrawingState = {
  objects: CanvasObject[];
  activeObjectId?: string;
  lastCreatedObjectId?: string;
  lastTranscript: string;
  lastInterimTranscript: string;
  voiceStatus: SpeechStatus;
  undoStack: CanvasSnapshot[];
  redoStack: CanvasSnapshot[];
  pendingExport?: CanvasExportRequest;
  feedback: FeedbackMessage[];
  runCommandText: (text: string) => CommandRunResult;
  addFeedback: (message: string, level?: FeedbackLevel) => void;
  completeExport: (message: string, level: FeedbackLevel) => void;
  setInterimTranscript: (text: string) => void;
  setVoiceStatus: (status: SpeechStatus) => void;
};

export const useDrawingStore = create<DrawingState>((set, get) => ({
  objects: [],
  activeObjectId: undefined,
  lastCreatedObjectId: undefined,
  lastTranscript: "",
  lastInterimTranscript: "",
  voiceStatus: "idle",
  undoStack: [],
  redoStack: [],
  pendingExport: undefined,
  feedback: [createFeedback("工作台已就绪。", "info")],

  runCommandText: (text) => {
    const currentState = get();
    set({ lastTranscript: text, lastInterimTranscript: "" });

    const parsed = parseCommand(text);

    if (!parsed.ok) {
      const message = `${parsed.reason} 可尝试：${parsed.suggestions.join("、")}`;
      get().addFeedback(message, "error");
      return {
        ok: false,
        changed: false,
        message,
        level: "error",
        commandCount: 0,
      };
    }

    const commands = normalizeCommands(parsed.commands, {
      activeObjectId: currentState.activeObjectId,
      lastCreatedObjectId: currentState.lastCreatedObjectId,
    });

    if (commands.some((command) => command.type === "undo")) {
      return runUndo(set, get);
    }

    if (commands.some((command) => command.type === "redo")) {
      return runRedo(set, get);
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

    commands.forEach((command) => {
      const result = executeDrawingCommand(command, {
        objects: nextObjects,
        activeObjectId: nextActiveObjectId,
      });

      nextObjects = result.objects;
      nextActiveObjectId = result.activeObjectId;
      changed = changed || result.changed;
      message = result.message;

      if (command.type === "export" && nextObjects.length > 0) {
        pendingExport = createCanvasExportRequest(nextObjects, command.format);
      }
    });

    const feedbackMessage =
      changed && commands.length > 1 && !pendingExport ? `已执行 ${commands.length} 个操作。` : message;
    const feedbackLevel: FeedbackLevel = changed ? "success" : "info";

    set((state) => ({
      objects: nextObjects,
      activeObjectId: nextActiveObjectId,
      lastCreatedObjectId: nextActiveObjectId,
      undoStack: changed ? [...state.undoStack, before] : state.undoStack,
      redoStack: changed ? [] : state.redoStack,
      pendingExport,
      feedback: [createFeedback(feedbackMessage, feedbackLevel), ...state.feedback].slice(0, 6),
    }));

    return {
      ok: true,
      changed,
      message: feedbackMessage,
      level: feedbackLevel,
      commandCount: commands.length,
      exportRequested: Boolean(pendingExport),
    };
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

function runUndo(set: StoreSet, get: StoreGet): CommandRunResult {
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
  };
}

function runRedo(set: StoreSet, get: StoreGet): CommandRunResult {
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
  };
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
