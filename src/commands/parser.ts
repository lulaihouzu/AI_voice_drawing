import type {
  ConnectionSpec,
  Direction,
  DrawingCommand,
  ParseResult,
  PositionRegion,
  ShapeSize,
  ShapeType,
} from "./types";

const suggestions = ["画一个红色圆形", "在右边画一个蓝色矩形", "把它向右移动一点", "撤销", "导出为图片"];

const colorMap: Array<[string, string]> = [
  ["红色", "#ef4444"],
  ["红", "#ef4444"],
  ["蓝色", "#2563eb"],
  ["蓝", "#2563eb"],
  ["绿色", "#16a34a"],
  ["绿", "#16a34a"],
  ["黄色", "#facc15"],
  ["黄", "#facc15"],
  ["黑色", "#111827"],
  ["黑", "#111827"],
  ["白色", "#ffffff"],
  ["白", "#ffffff"],
  ["紫色", "#9333ea"],
  ["紫", "#9333ea"],
  ["橙色", "#f97316"],
  ["橙", "#f97316"],
  ["灰色", "#64748b"],
  ["灰", "#64748b"],
];

const positionMap: Array<[string, PositionRegion]> = [
  ["左上角", "top-left"],
  ["右上角", "top-right"],
  ["左下角", "bottom-left"],
  ["右下角", "bottom-right"],
  ["中央", "center"],
  ["中间", "center"],
  ["正中间", "center"],
  ["左边", "left"],
  ["左侧", "left"],
  ["右边", "right"],
  ["右侧", "right"],
  ["上方", "top"],
  ["上面", "top"],
  ["下方", "bottom"],
  ["下面", "bottom"],
];

const directionMap: Array<[string, Direction]> = [
  ["上", "up"],
  ["下", "down"],
  ["左", "left"],
  ["右", "right"],
];

const shapeKeywords: Array<[ShapeType, string[]]> = [
  ["arrow", ["箭头"]],
  ["text", ["文字", "文本", "写"]],
  ["circle", ["圆形", "圆", "圈"]],
  ["rect", ["矩形", "长方形", "方形", "方块", "方框", "框"]],
  ["line", ["直线", "线条", "线"]],
];

export function parseCommand(rawText: string): ParseResult {
  const text = normalizeText(rawText);

  if (!text) {
    return unsupported(rawText, "没有识别到有效语音。");
  }

  const clauses = splitClauses(text);

  if (clauses.length > 1) {
    const commands: DrawingCommand[] = [];

    for (const clause of clauses) {
      const result = parseSingleClause(clause, rawText);

      if (!result.ok) {
        return unsupported(rawText, `无法解析片段“${clause}”。`);
      }

      commands.push(...result.commands);
    }

    return ok(rawText, commands);
  }

  return parseSingleClause(text, rawText);
}

function parseSingleClause(text: string, rawText: string): ParseResult {
  if (text.includes("撤销")) {
    return ok(rawText, [{ type: "undo" }]);
  }

  if (text.includes("重做") || text.includes("恢复") || text.includes("再做一次")) {
    return ok(rawText, [{ type: "redo" }]);
  }

  if (text.includes("清空") || text.includes("清除画布")) {
    return ok(rawText, [{ type: "clear" }]);
  }

  if (text.includes("导出") || text.includes("保存为图片") || text.includes("下载图片")) {
    return ok(rawText, [{ type: "export", format: "png" }]);
  }

  if (text.includes("删除") || text.includes("删掉") || text.includes("移除") || text.includes("去掉")) {
    return ok(rawText, [{ type: "delete", target: { ref: "active" } }]);
  }

  const color = findColor(text);

  if ((text.includes("改成") || text.includes("变成")) && color) {
    return ok(rawText, [{ type: "update", target: { ref: "active" }, patch: { fill: color } }]);
  }

  if (text.includes("放大") || text.includes("变大")) {
    return ok(rawText, [{ type: "update", target: { ref: "active" }, patch: { scale: 1.2 } }]);
  }

  if (text.includes("缩小") || text.includes("变小")) {
    return ok(rawText, [{ type: "update", target: { ref: "active" }, patch: { scale: 0.8 } }]);
  }

  const direction = findDirection(text);

  if ((text.includes("移动") || text.startsWith("向")) && direction) {
    return ok(rawText, [{ type: "move", target: { ref: "active" }, direction, distance: 36 }]);
  }

  const shape = findShape(text);

  if (shape && isCreateLike(text, shape)) {
    return ok(rawText, buildCreateCommands(text, shape, color));
  }

  return unsupported(rawText, "暂时无法解析这条指令。");
}

function ok(rawText: string, commands: DrawingCommand[]): ParseResult {
  return { ok: true, rawText, commands };
}

function unsupported(rawText: string, reason: string): ParseResult {
  return {
    ok: false,
    rawText,
    reason,
    suggestions,
  };
}

function findColor(text: string) {
  return colorMap.find(([keyword]) => text.includes(keyword))?.[1];
}

function findPosition(text: string) {
  return positionMap.find(([keyword]) => text.includes(keyword))?.[1];
}

function findDirection(text: string) {
  return directionMap.find(
    ([keyword]) =>
      text.includes(`向${keyword}`) ||
      text.includes(`往${keyword}`) ||
      text.includes(`${keyword}移`) ||
      text.includes(`${keyword}边移`) ||
      text.includes(`${keyword}一点`),
  )?.[1];
}

function findShape(text: string) {
  return shapeKeywords.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))?.[0];
}

function buildCreateCommands(text: string, shape: ShapeType, color?: string): DrawingCommand[] {
  const quantity = findQuantity(text);
  const baseCommand = buildCreateCommand(text, shape, color);

  if (quantity === 2 && shape !== "text") {
    return [
      { ...baseCommand, position: { region: "left" } },
      { ...baseCommand, position: { region: "right" } },
    ];
  }

  return [baseCommand];
}

function buildCreateCommand(text: string, shape: ShapeType, color?: string): Extract<DrawingCommand, { type: "create" }> {
  return {
    type: "create",
    shape,
    style: {
      fill: shape === "line" || shape === "arrow" || shape === "text" ? undefined : color,
      stroke: color ?? "#1f2937",
    },
    position: {
      region: findPosition(text) ?? "center",
    },
    text: shape === "text" ? extractText(text) : undefined,
    size: findSize(text),
    connection: shape === "arrow" ? extractConnection(text) : undefined,
  };
}

function findQuantity(text: string) {
  if (/(两个|两[个条只]?|2个|2条)/.test(text)) {
    return 2;
  }

  return 1;
}

function findSize(text: string): ShapeSize | undefined {
  if (text.includes("小一点") || text.includes("小的") || text.includes("小号") || text.includes("小圆") || text.includes("小矩形")) {
    return "small";
  }

  if (text.includes("大一点") || text.includes("大的") || text.includes("大号") || text.includes("大圆") || text.includes("大矩形")) {
    return "large";
  }

  return undefined;
}

function extractConnection(text: string): ConnectionSpec | undefined {
  if (!text.includes("连接") && !text.includes("指向") && !text.includes("从")) {
    return undefined;
  }

  const from = cleanReference(text.match(/从(.+?)(?:到|至|指向|连接)/)?.[1]);
  const to = cleanReference(text.match(/(?:到|至|指向|连接)(.+?)(?:画|添加|创建|一个|一条|箭头|它们|$)/)?.[1]);

  return {
    mode: text.includes("指向") ? "point-to" : "connect",
    from,
    to,
  };
}

function cleanReference(value?: string) {
  return value
    ?.replace(/^(一个|一条|这个|那个)/, "")
    .replace(/(的)?$/, "")
    .trim();
}

function isCreateLike(text: string, shape: ShapeType) {
  if (shape === "text" && (text.includes("写") || text.includes("添加") || text.includes("输入"))) {
    return true;
  }

  if (shape === "arrow" && (text.includes("连接") || text.includes("指向"))) {
    return true;
  }

  return text.includes("画") || text.includes("创建") || text.includes("添加");
}

function splitClauses(text: string) {
  return text
    .split(/(?:然后|接着|并且|并)/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function normalizeText(rawText: string) {
  return rawText
    .trim()
    .replace(/\s+/g, "")
    .replace(/[，。！？、,.!?；;]/g, "")
    .replace(/^(请|帮我|请帮我|麻烦你|麻烦)/, "");
}

function extractText(text: string) {
  const payload = text
    .replace(/^(请|帮我|请帮我|添加|输入)?(写上|写下|写|文字|文本|添加文字|添加文本|输入文字|输入文本)/, "")
    .replace(/^(一个|一段|一句)/, "")
    .replace(/(这几个字|几个字|两个字|三个字|四个字|五个字|六个字|文字|文本)$/, "")
    .replace(/[“”"'「」]/g, "");

  return payload || "文本";
}
