import { CanvasEngine } from "../canvas/CanvasEngine";
import type { CanvasObject, DrawingCommand } from "./types";

export type ExecutionState = {
  objects: CanvasObject[];
  activeObjectId?: string;
};

export type ExecutionResult = ExecutionState & {
  changed: boolean;
  message: string;
  downloadUrl?: string;
};

const canvasEngine = new CanvasEngine();

export function executeDrawingCommand(command: DrawingCommand, state: ExecutionState): ExecutionResult {
  if (command.type === "create") {
    const object = canvasEngine.createObject(command, state.objects);

    return {
      objects: [...state.objects, object],
      activeObjectId: object.id,
      changed: true,
      message: "已创建图形。",
    };
  }

  if (command.type === "update") {
    const targetId = state.activeObjectId;

    if (!targetId) {
      return { ...state, changed: false, message: "没有可编辑的当前对象。" };
    }

    return {
      ...canvasEngine.updateObject(state.objects, targetId, command.patch),
      changed: true,
      message: "已更新图形。",
    };
  }

  if (command.type === "move") {
    const targetId = state.activeObjectId;

    if (!targetId) {
      return { ...state, changed: false, message: "没有可移动的当前对象。" };
    }

    return {
      ...canvasEngine.moveObject(state.objects, targetId, command.direction, command.distance ?? 36),
      changed: true,
      message: "已移动图形。",
    };
  }

  if (command.type === "delete") {
    const targetId = state.activeObjectId;

    if (!targetId) {
      return { ...state, changed: false, message: "没有可删除的当前对象。" };
    }

    return {
      objects: state.objects.filter((object) => object.id !== targetId),
      activeObjectId: undefined,
      changed: true,
      message: "已删除图形。",
    };
  }

  if (command.type === "clear") {
    return {
      objects: [],
      activeObjectId: undefined,
      changed: state.objects.length > 0,
      message: "画布已清空。",
    };
  }

  if (command.type === "export") {
    return {
      ...state,
      changed: false,
      message: state.objects.length > 0 ? "正在导出 PNG 图片。" : "画布为空，无法导出图片。",
    };
  }

  return {
    ...state,
    changed: false,
    message: "该命令由状态模块处理。",
  };
}
