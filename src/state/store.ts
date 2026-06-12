import { create } from "zustand";
import type { StateCreator } from "zustand";
import { executeDrawingCommand } from "../commands/executor";
import { normalizeCommands } from "../commands/normalizer";
import { parseCommand } from "../commands/parser";
import type { CanvasObject, CanvasSnapshot, FeedbackLevel, FeedbackMessage } from "../commands/types";

type DrawingState = {
  objects: CanvasObject[];
  activeObjectId?: string;
  lastCreatedObjectId?: string;
  lastTranscript: string;
  undoStack: CanvasSnapshot[];
  redoStack: CanvasSnapshot[];
  feedback: FeedbackMessage[];
  runCommandText: (text: string) => void;
  addFeedback: (message: string, level?: FeedbackLevel) => void;
};

export const useDrawingStore = create<DrawingState>((set, get) => ({
  objects: [],
  activeObjectId: undefined,
  lastCreatedObjectId: undefined,
  lastTranscript: "",
  undoStack: [],
  redoStack: [],
  feedback: [createFeedback("工作台已就绪。", "info")],

  runCommandText: (text) => {
    const currentState = get();
    set({ lastTranscript: text });

    const parsed = parseCommand(text);

    if (!parsed.ok) {
      get().addFeedback(`${parsed.reason} 可尝试：${parsed.suggestions.join("、")}`, "error");
      return;
    }

    const commands = normalizeCommands(parsed.commands, {
      activeObjectId: currentState.activeObjectId,
      lastCreatedObjectId: currentState.lastCreatedObjectId,
    });

    if (commands.some((command) => command.type === "undo")) {
      runUndo(set, get);
      return;
    }

    if (commands.some((command) => command.type === "redo")) {
      runRedo(set, get);
      return;
    }

    const before: CanvasSnapshot = {
      objects: currentState.objects,
      activeObjectId: currentState.activeObjectId,
    };

    let nextObjects = currentState.objects;
    let nextActiveObjectId = currentState.activeObjectId;
    let changed = false;
    let message = "指令已执行。";

    commands.forEach((command) => {
      const result = executeDrawingCommand(command, {
        objects: nextObjects,
        activeObjectId: nextActiveObjectId,
      });

      nextObjects = result.objects;
      nextActiveObjectId = result.activeObjectId;
      changed = changed || result.changed;
      message = result.message;
    });

    set((state) => ({
      objects: nextObjects,
      activeObjectId: nextActiveObjectId,
      lastCreatedObjectId: nextActiveObjectId,
      undoStack: changed ? [...state.undoStack, before] : state.undoStack,
      redoStack: changed ? [] : state.redoStack,
      feedback: [createFeedback(message, changed ? "success" : "info"), ...state.feedback].slice(0, 6),
    }));
  },

  addFeedback: (message, level = "info") => {
    set((state) => ({
      feedback: [createFeedback(message, level), ...state.feedback].slice(0, 6),
    }));
  },
}));

function runUndo(set: StoreSet, get: StoreGet) {
  const state = get();
  const snapshot = state.undoStack[state.undoStack.length - 1];

  if (!snapshot) {
    state.addFeedback("没有可撤销的操作。", "info");
    return;
  }

  set({
    objects: snapshot.objects,
    activeObjectId: snapshot.activeObjectId,
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, { objects: state.objects, activeObjectId: state.activeObjectId }],
    feedback: [createFeedback("已撤销。", "success"), ...state.feedback].slice(0, 6),
  });
}

function runRedo(set: StoreSet, get: StoreGet) {
  const state = get();
  const snapshot = state.redoStack[state.redoStack.length - 1];

  if (!snapshot) {
    state.addFeedback("没有可重做的操作。", "info");
    return;
  }

  set({
    objects: snapshot.objects,
    activeObjectId: snapshot.activeObjectId,
    redoStack: state.redoStack.slice(0, -1),
    undoStack: [...state.undoStack, { objects: state.objects, activeObjectId: state.activeObjectId }],
    feedback: [createFeedback("已重做。", "success"), ...state.feedback].slice(0, 6),
  });
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
