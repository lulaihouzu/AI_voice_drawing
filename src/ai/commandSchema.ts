import type {
  ConnectionSpec,
  Direction,
  DrawingCommand,
  LayerAction,
  PositionSpec,
  PositionRegion,
  ShapePatch,
  ShapeSize,
  ShapeStyle,
  ShapeType,
  TargetQuery,
  TargetSpec,
} from "../commands/types";

export type CommandSchemaValidationError = {
  path: string;
  message: string;
};

export type CommandSchemaValidationResult =
  | {
      ok: true;
      commands: DrawingCommand[];
    }
  | {
      ok: false;
      errors: CommandSchemaValidationError[];
    };

const maxAiCommandCount = 20;
const shapeTypes: ShapeType[] = ["circle", "rect", "triangle", "line", "arrow", "text"];
const shapeSizes: ShapeSize[] = ["small", "normal", "large"];
const positionRegions: PositionRegion[] = [
  "center",
  "left",
  "right",
  "top",
  "bottom",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];
const directions: Direction[] = ["up", "down", "left", "right"];
const layerActions: LayerAction[] = ["front", "back", "forward", "backward"];

export function validateDrawingCommands(payload: unknown): CommandSchemaValidationResult {
  if (!Array.isArray(payload)) {
    return failed("", "AI 输出必须是命令数组。");
  }

  if (payload.length === 0) {
    return failed("", "AI 输出至少需要包含一条命令。");
  }

  if (payload.length > maxAiCommandCount) {
    return failed("", `AI 输出命令数量不能超过 ${maxAiCommandCount} 条。`);
  }

  const errors: CommandSchemaValidationError[] = [];
  const commands: DrawingCommand[] = [];

  payload.forEach((value, index) => {
    const parsed = parseCommand(value, `[${index}]`);

    if (parsed.ok) {
      commands.push(parsed.command);
    } else {
      errors.push(...parsed.errors);
    }
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, commands };
}

function parseCommand(value: unknown, path: string): { ok: true; command: DrawingCommand } | { ok: false; errors: CommandSchemaValidationError[] } {
  if (!isRecord(value)) {
    return { ok: false, errors: [{ path, message: "命令必须是对象。" }] };
  }

  if (typeof value.type !== "string") {
    return { ok: false, errors: [{ path: `${path}.type`, message: "命令类型必须是字符串。" }] };
  }

  const type = value.type;

  if (type === "create") {
    return parseCreateCommand(value, path);
  }

  if (type === "update") {
    return parseTargetCommand(value, path, "update", (target) => {
      const patch = parseShapePatch(value.patch, `${path}.patch`);

      return patch.ok ? { ok: true, command: { type, target, patch: patch.value } } : patch;
    });
  }

  if (type === "move") {
    return parseTargetCommand(value, path, "move", (target) => {
      const direction = readEnum(value.direction, directions, `${path}.direction`, "移动方向无效。");

      if (!direction.ok) {
        return direction;
      }

      const distance = readOptionalNumber(value.distance, `${path}.distance`, "移动距离必须是 1 到 500 之间的数字。", 1, 500);

      if (!distance.ok) {
        return distance;
      }

      return { ok: true, command: { type, target, direction: direction.value, distance: distance.value } };
    });
  }

  if (type === "delete") {
    return parseTargetCommand(value, path, "delete", (target) => ({ ok: true, command: { type, target } }));
  }

  if (type === "rename") {
    return parseTargetCommand(value, path, "rename", (target) => {
      const name = readRequiredString(value.name, `${path}.name`, "对象名称不能为空。", 24);

      return name.ok ? { ok: true, command: { type, target, name: name.value } } : name;
    });
  }

  if (type === "layer") {
    return parseTargetCommand(value, path, "layer", (target) => {
      const action = readEnum(value.action, layerActions, `${path}.action`, "层级动作无效。");

      return action.ok ? { ok: true, command: { type, target, action: action.value } } : action;
    });
  }

  if (type === "undo" || type === "redo" || type === "clear") {
    return { ok: true, command: { type } };
  }

  if (type === "export") {
    const format = readEnum(value.format, ["png", "svg", "json"], `${path}.format`, "导出格式无效。");

    return format.ok ? { ok: true, command: { type, format: format.value } } : format;
  }

  if (type === "project") {
    const action = readEnum(value.action, ["save", "load"], `${path}.action`, "工程动作无效。");

    return action.ok ? { ok: true, command: { type, action: action.value } } : action;
  }

  return { ok: false, errors: [{ path: `${path}.type`, message: `不支持的命令类型“${type}”。` }] };
}

function parseCreateCommand(value: Record<string, unknown>, path: string): ReturnType<typeof parseCommand> {
  const shape = readEnum(value.shape, shapeTypes, `${path}.shape`, "图形类型无效。");

  if (!shape.ok) {
    return shape;
  }

  const style = parseShapeStyle(value.style, `${path}.style`);
  const position = parsePosition(value.position, `${path}.position`);
  const text = readOptionalString(value.text, `${path}.text`, "文本内容必须是字符串。", 80);
  const size = value.size === undefined ? okValue(undefined) : readEnum(value.size, shapeSizes, `${path}.size`, "尺寸值无效。");
  const connection = parseConnection(value.connection, `${path}.connection`);

  if (!style.ok) return style;
  if (!position.ok) return position;
  if (!text.ok) return text;
  if (!size.ok) return size;
  if (!connection.ok) return connection;

  return {
    ok: true,
    command: {
      type: "create",
      shape: shape.value,
      style: style.value,
      position: position.value,
      text: text.value,
      size: size.value,
      connection: connection.value,
    },
  };
}

function parseTargetCommand(
  value: Record<string, unknown>,
  path: string,
  type: string,
  build: (target: TargetSpec) => ReturnType<typeof parseCommand>,
): ReturnType<typeof parseCommand> {
  const target = parseTarget(value.target, `${path}.target`);

  if (!target.ok) {
    return target;
  }

  return build(target.value);
}

function parseTarget(value: unknown, path: string): Result<TargetSpec> {
  if (!isRecord(value)) {
    return fail(path, "目标必须是对象。");
  }

  if (value.ref === "active" || value.ref === "last-created") {
    return okValue({ ref: value.ref });
  }

  if (value.ref === "name") {
    const name = readRequiredString(value.name, `${path}.name`, "目标名称不能为空。", 24);

    return name.ok ? okValue({ ref: "name", name: name.value }) : name;
  }

  if (value.ref === "query") {
    const query = parseTargetQuery(value.query, `${path}.query`);

    return query.ok ? okValue({ ref: "query", query: query.value }) : query;
  }

  return fail(`${path}.ref`, "目标引用类型无效。");
}

function parseTargetQuery(value: unknown, path: string): Result<TargetQuery> {
  if (!isRecord(value)) {
    return fail(path, "目标查询必须是对象。");
  }

  const shape = value.shape === undefined ? okValue(undefined) : readEnum(value.shape, shapeTypes, `${path}.shape`, "查询图形类型无效。");
  const region =
    value.region === undefined ? okValue(undefined) : readEnum(value.region, positionRegions, `${path}.region`, "查询位置无效。");
  const sizeRank =
    value.sizeRank === undefined
      ? okValue(undefined)
      : readEnum(value.sizeRank, ["largest", "smallest"], `${path}.sizeRank`, "查询尺寸排序无效。");

  if (!shape.ok) return shape;
  if (!region.ok) return region;
  if (!sizeRank.ok) return sizeRank;

  if (!shape.value && !region.value && !sizeRank.value) {
    return fail(path, "目标查询至少需要一个条件。");
  }

  return okValue({
    shape: shape.value,
    region: region.value,
    sizeRank: sizeRank.value,
  });
}

function parseShapePatch(value: unknown, path: string): Result<ShapePatch> {
  if (!isRecord(value)) {
    return fail(path, "样式修改必须是对象。");
  }

  const fill = readOptionalColor(value.fill, `${path}.fill`);
  const stroke = readOptionalColor(value.stroke, `${path}.stroke`);
  const scale = readOptionalNumber(value.scale, `${path}.scale`, "缩放比例必须是 0.1 到 4 之间的数字。", 0.1, 4);

  if (!fill.ok) return fill;
  if (!stroke.ok) return stroke;
  if (!scale.ok) return scale;

  if (!fill.value && !stroke.value && scale.value === undefined) {
    return fail(path, "样式修改至少需要一个字段。");
  }

  return okValue({
    fill: fill.value,
    stroke: stroke.value,
    scale: scale.value,
  });
}

function parseShapeStyle(value: unknown, path: string): Result<ShapeStyle | undefined> {
  if (value === undefined) {
    return okValue(undefined);
  }

  if (!isRecord(value)) {
    return fail(path, "图形样式必须是对象。");
  }

  const fill = readOptionalColor(value.fill, `${path}.fill`);
  const stroke = readOptionalColor(value.stroke, `${path}.stroke`);
  const strokeWidth = readOptionalNumber(value.strokeWidth, `${path}.strokeWidth`, "描边宽度必须是 0 到 16 之间的数字。", 0, 16);
  const fontSize = readOptionalNumber(value.fontSize, `${path}.fontSize`, "字号必须是 8 到 96 之间的数字。", 8, 96);

  if (!fill.ok) return fill;
  if (!stroke.ok) return stroke;
  if (!strokeWidth.ok) return strokeWidth;
  if (!fontSize.ok) return fontSize;

  return okValue({
    fill: fill.value,
    stroke: stroke.value,
    strokeWidth: strokeWidth.value,
    fontSize: fontSize.value,
  });
}

function parsePosition(value: unknown, path: string): Result<PositionSpec | undefined> {
  if (value === undefined) {
    return okValue(undefined);
  }

  if (!isRecord(value)) {
    return fail(path, "位置必须是对象。");
  }

  const region = value.region === undefined ? okValue(undefined) : readEnum(value.region, positionRegions, `${path}.region`, "位置区域无效。");
  const x = readOptionalNumber(value.x, `${path}.x`, "x 坐标必须是 0 到 960 之间的数字。", 0, 960);
  const y = readOptionalNumber(value.y, `${path}.y`, "y 坐标必须是 0 到 620 之间的数字。", 0, 620);
  const relative = parseRelativePosition(value.relative, `${path}.relative`);

  if (!region.ok) return region;
  if (!x.ok) return x;
  if (!y.ok) return y;
  if (!relative.ok) return relative;

  return okValue({
    region: region.value,
    x: x.value,
    y: y.value,
    relative: relative.value,
  });
}

function parseRelativePosition(value: unknown, path: string): Result<PositionSpec["relative"]> {
  if (value === undefined) {
    return okValue(undefined);
  }

  if (!isRecord(value)) {
    return fail(path, "相对位置必须是对象。");
  }

  const target = parseTarget(value.target, `${path}.target`);
  const direction = readEnum(value.direction, directions, `${path}.direction`, "相对方向无效。");

  if (!target.ok) return target;
  if (!direction.ok) return direction;

  return okValue({
    target: target.value,
    direction: direction.value,
  });
}

function parseConnection(value: unknown, path: string): Result<ConnectionSpec | undefined> {
  if (value === undefined) {
    return okValue(undefined);
  }

  if (!isRecord(value)) {
    return fail(path, "连接配置必须是对象。");
  }

  const mode = readEnum(value.mode, ["connect", "point-to"], `${path}.mode`, "连接模式无效。");
  const from = readOptionalString(value.from, `${path}.from`, "连接起点必须是字符串。", 24);
  const to = readOptionalString(value.to, `${path}.to`, "连接终点必须是字符串。", 24);

  if (!mode.ok) return mode;
  if (!from.ok) return from;
  if (!to.ok) return to;

  return okValue({
    mode: mode.value,
    from: from.value,
    to: to.value,
  });
}

function readEnum<T extends string>(value: unknown, values: readonly T[], path: string, message: string): Result<T> {
  return typeof value === "string" && values.includes(value as T) ? okValue(value as T) : fail(path, message);
}

function readRequiredString(value: unknown, path: string, message: string, maxLength: number): Result<string> {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    return fail(path, message);
  }

  return okValue(value);
}

function readOptionalString(value: unknown, path: string, message: string, maxLength: number): Result<string | undefined> {
  if (value === undefined) {
    return okValue(undefined);
  }

  if (typeof value !== "string" || value.length > maxLength) {
    return fail(path, message);
  }

  return okValue(value);
}

function readOptionalColor(value: unknown, path: string): Result<string | undefined> {
  if (value === undefined) {
    return okValue(undefined);
  }

  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value)
    ? okValue(value)
    : fail(path, "颜色必须是十六进制颜色值。");
}

function readOptionalNumber(
  value: unknown,
  path: string,
  message: string,
  min: number,
  max: number,
): Result<number | undefined> {
  if (value === undefined) {
    return okValue(undefined);
  }

  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? okValue(value) : fail(path, message);
}

function failed(path: string, message: string): CommandSchemaValidationResult {
  return {
    ok: false,
    errors: [{ path, message }],
  };
}

function fail(path: string, message: string): Result<never> {
  return {
    ok: false,
    errors: [{ path, message }],
  };
}

function okValue<T>(value: T): Result<T> {
  return {
    ok: true,
    value,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type Result<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      errors: CommandSchemaValidationError[];
    };
