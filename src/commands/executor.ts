import { CanvasEngine } from "../canvas/CanvasEngine";
import { normalizeObjectName } from "./objectNames";
import { describeTargetQuery, resolveTargetQuery } from "./targetQueries";
import type { CanvasObject, DrawingCommand, TargetSpec } from "./types";

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
    const object = canvasEngine.createObject(command, state.objects, state.activeObjectId);

    return {
      objects: [...state.objects, object],
      activeObjectId: object.id,
      changed: true,
      message: "已创建图形。",
    };
  }

  if (command.type === "update") {
    const targetId = resolveTargetId(state, command.target);

    if (!targetId) {
      return { ...state, changed: false, message: getMissingTargetMessage(command.target, "编辑") };
    }

    return {
      ...canvasEngine.updateObject(state.objects, targetId, command.patch),
      changed: true,
      message: "已更新图形。",
    };
  }

  if (command.type === "move") {
    const targetId = resolveTargetId(state, command.target);

    if (!targetId) {
      return { ...state, changed: false, message: getMissingTargetMessage(command.target, "移动") };
    }

    return {
      ...canvasEngine.moveObject(state.objects, targetId, command.direction, command.distance ?? 36),
      changed: true,
      message: "已移动图形。",
    };
  }

  if (command.type === "delete") {
    const targetId = resolveTargetId(state, command.target);

    if (!targetId) {
      return { ...state, changed: false, message: getMissingTargetMessage(command.target, "删除") };
    }

    return {
      objects: state.objects.filter((object) => object.id !== targetId),
      activeObjectId: undefined,
      changed: true,
      message: "已删除图形。",
    };
  }

  if (command.type === "rename") {
    const targetId = resolveTargetId(state, command.target);
    const name = normalizeObjectName(command.name);

    if (!targetId) {
      return { ...state, changed: false, message: getMissingTargetMessage(command.target, "命名") };
    }

    if (!name) {
      return { ...state, changed: false, message: "请说明要使用的对象名称。" };
    }

    if (isNameUsedByOtherObject(state.objects, targetId, name)) {
      return { ...state, changed: false, message: `名称“${name}”已被使用。` };
    }

    return {
      ...canvasEngine.renameObject(state.objects, targetId, name),
      changed: true,
      message: `已将图形命名为“${name}”。`,
    };
  }

  if (command.type === "layer") {
    const targetId = resolveTargetId(state, command.target);

    if (!targetId) {
      return { ...state, changed: false, message: getMissingTargetMessage(command.target, "调整层级") };
    }

    const result = canvasEngine.reorderObject(state.objects, targetId, command.action);

    return {
      ...result,
      message: result.changed ? getLayerSuccessMessage(command.action) : getLayerBoundaryMessage(command.action),
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
    const formatLabel = command.format.toUpperCase();

    return {
      ...state,
      changed: false,
      message: state.objects.length > 0 ? `正在导出 ${formatLabel} 文件。` : `画布为空，无法导出 ${formatLabel} 文件。`,
    };
  }

  if (command.type === "project") {
    return {
      ...state,
      changed: false,
      message: "该命令由状态模块处理。",
    };
  }

  return {
    ...state,
    changed: false,
    message: "该命令由状态模块处理。",
  };
}

function resolveTargetId(state: ExecutionState, target: TargetSpec) {
  if (target.ref === "active") {
    return state.activeObjectId;
  }

  if (target.ref === "last-created") {
    return state.activeObjectId;
  }

  if (target.ref === "name") {
    return [...state.objects].reverse().find((object) => normalizeObjectName(object.name) === target.name)?.id;
  }

  if (target.ref === "query") {
    return resolveTargetQuery(state.objects, target.query)?.id;
  }

  return undefined;
}

function getMissingTargetMessage(target: TargetSpec, action: string) {
  if (target.ref === "name") {
    return `没有找到名为“${target.name}”的对象，无法${action}。`;
  }

  if (target.ref === "query") {
    return `没有找到符合“${describeTargetQuery(target.query)}”的对象，无法${action}。`;
  }

  return `没有可${action}的当前对象。`;
}

function isNameUsedByOtherObject(objects: CanvasObject[], targetId: string, name: string) {
  return objects.some((object) => object.id !== targetId && normalizeObjectName(object.name) === name);
}

function getLayerSuccessMessage(action: Extract<DrawingCommand, { type: "layer" }>["action"]) {
  if (action === "front") {
    return "已将图形置于顶层。";
  }

  if (action === "back") {
    return "已将图形置于底层。";
  }

  if (action === "forward") {
    return "已上移一层。";
  }

  return "已下移一层。";
}

function getLayerBoundaryMessage(action: Extract<DrawingCommand, { type: "layer" }>["action"]) {
  if (action === "front" || action === "forward") {
    return "图形已经在顶层。";
  }

  return "图形已经在底层。";
}
