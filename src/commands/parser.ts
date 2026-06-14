import type {
  ConnectionSpec,
  Direction,
  DrawingCommand,
  LayerAction,
  ParseResult,
  PositionSpec,
  PositionRegion,
  ShapeSize,
  ShapeType,
  TargetQuery,
  TargetSpec,
} from "./types";
import { isActiveReference, normalizeObjectName } from "./objectNames";

const suggestions = ["画一个红色圆形", "把它命名为开始", "把它置顶", "保存工程", "导出为 JSON"];

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
  ["triangle", ["三角形", "三角"]],
  ["circle", ["圆形", "圆", "圈"]],
  ["rect", ["矩形", "长方形", "方形", "方块", "方框", "框"]],
  ["line", ["直线", "线条", "线"]],
];

const layerActionKeywords = [
  "移动到最上层",
  "移到最上层",
  "放到最上层",
  "放在最上层",
  "移动到最前面",
  "移到最前面",
  "放到最前面",
  "放在最前面",
  "移动到顶层",
  "移到顶层",
  "放到顶层",
  "放在顶层",
  "提到最前面",
  "置顶",
  "前置",
  "移动到最下层",
  "移到最下层",
  "放到最下层",
  "放在最下层",
  "移动到最后面",
  "移到最后面",
  "放到最后面",
  "放在最后面",
  "移动到底层",
  "移到底层",
  "放到底层",
  "放在底层",
  "置底",
  "后置",
  "上移一层",
  "前移一层",
  "提升一层",
  "向上一层",
  "往上一层",
  "下移一层",
  "后移一层",
  "降低一层",
  "向下一层",
  "往下一层",
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

  if (isProjectLoadLike(text)) {
    return ok(rawText, [{ type: "project", action: "load" }]);
  }

  if (text.includes("重做") || text.includes("恢复") || text.includes("再做一次")) {
    return ok(rawText, [{ type: "redo" }]);
  }

  if (text.includes("清空") || text.includes("清除画布")) {
    return ok(rawText, [{ type: "clear" }]);
  }

  if (isExportLike(text)) {
    return ok(rawText, [{ type: "export", format: findExportFormat(text) }]);
  }

  if (isProjectSaveLike(text)) {
    return ok(rawText, [{ type: "project", action: "save" }]);
  }

  const renameName = extractRenameName(text);

  if (renameName) {
    return ok(rawText, [{ type: "rename", target: extractRenameTarget(text), name: renameName }]);
  }

  if (text.includes("删除") || text.includes("删掉") || text.includes("移除") || text.includes("去掉")) {
    return ok(rawText, [{ type: "delete", target: extractDeleteTarget(text) }]);
  }

  const layerAction = findLayerAction(text);

  if (layerAction) {
    return ok(rawText, [{ type: "layer", target: extractLayerTarget(text), action: layerAction }]);
  }

  const color = findColor(text);

  if ((text.includes("改成") || text.includes("变成")) && color) {
    return ok(rawText, [{ type: "update", target: extractTargetBeforeAction(text, ["改成", "变成"]), patch: { fill: color } }]);
  }

  if (text.includes("放大") || text.includes("变大")) {
    return ok(rawText, [{ type: "update", target: extractTargetBeforeAction(text, ["放大", "变大"]), patch: { scale: 1.2 } }]);
  }

  if (text.includes("缩小") || text.includes("变小")) {
    return ok(rawText, [{ type: "update", target: extractTargetBeforeAction(text, ["缩小", "变小"]), patch: { scale: 0.8 } }]);
  }

  const direction = findDirection(text);

  if ((text.includes("移动") || text.startsWith("向")) && direction) {
    return ok(rawText, [{ type: "move", target: extractMoveTarget(text), direction, distance: 36 }]);
  }

  const shape = findShape(text);

  if (shape && isCreateLike(text, shape)) {
    return ok(rawText, buildCreateCommands(text, shape, findCreateColor(text)));
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

function isExportLike(text: string) {
  return (
    text.includes("导出") ||
    text.includes("保存为图片") ||
    text.includes("下载图片") ||
    ((text.includes("保存") || text.includes("下载")) && /svg/i.test(text)) ||
    ((text.includes("保存") || text.includes("下载")) && /json/i.test(text)) ||
    ((text.includes("导出") || text.includes("下载")) && (text.includes("工程") || text.includes("项目"))) ||
    text.includes("矢量图")
  );
}

function findExportFormat(text: string): "png" | "svg" | "json" {
  if (/json/i.test(text) || ((text.includes("工程") || text.includes("项目")) && !text.includes("图片"))) {
    return "json";
  }

  if (/svg/i.test(text) || text.includes("矢量图")) {
    return "svg";
  }

  return "png";
}

function isProjectSaveLike(text: string) {
  return (text.includes("保存工程") || text.includes("保存项目") || text.includes("保存画布")) && !text.includes("为");
}

function isProjectLoadLike(text: string) {
  return text.includes("加载工程") || text.includes("加载项目") || text.includes("恢复工程") || text.includes("恢复项目") || text.includes("打开工程") || text.includes("打开项目");
}

function findLayerAction(text: string): LayerAction | undefined {
  if (
    text.includes("置顶") ||
    text.includes("前置") ||
    text.includes("最上层") ||
    text.includes("最前面") ||
    text.includes("顶层")
  ) {
    return "front";
  }

  if (
    text.includes("置底") ||
    text.includes("后置") ||
    text.includes("最下层") ||
    text.includes("最后面") ||
    text.includes("底层")
  ) {
    return "back";
  }

  if (
    text.includes("上移一层") ||
    text.includes("前移一层") ||
    text.includes("提升一层") ||
    text.includes("向上一层") ||
    text.includes("往上一层")
  ) {
    return "forward";
  }

  if (
    text.includes("下移一层") ||
    text.includes("后移一层") ||
    text.includes("降低一层") ||
    text.includes("向下一层") ||
    text.includes("往下一层")
  ) {
    return "backward";
  }

  return undefined;
}

function extractRenameName(text: string) {
  const match = text.match(/(?:命名为|取名为|改名为|叫做|名字叫|名为)(.+)$/);

  return normalizeObjectName(match?.[1]);
}

function extractRenameTarget(text: string): TargetSpec {
  const match = text.match(/^(?:把|将|给)?(.+?)(?:命名为|取名为|改名为|叫做|名字叫|名为)/);

  return toTarget(match?.[1]);
}

function extractDeleteTarget(text: string): TargetSpec {
  const match = text.match(/(?:删除|删掉|移除|去掉)(.+)$/);

  return toTarget(match?.[1]);
}

function extractLayerTarget(text: string): TargetSpec {
  const actionPattern = layerActionKeywords.map(escapeRegExp).join("|");
  const match = text.match(new RegExp(`^(?:把|将|让|给)?(.+?)(?:${actionPattern})`));

  return toTarget(match?.[1]);
}

function extractTargetBeforeAction(text: string, actions: string[]): TargetSpec {
  const actionPattern = actions.join("|");
  const match = text.match(new RegExp(`^(?:把|将)?(.+?)(?:${actionPattern})`));

  return toTarget(match?.[1]);
}

function extractMoveTarget(text: string): TargetSpec {
  const patterns = [
    /^(?:把|将)?(.+?)(?:向|往)[上下左右](?:移动|挪动|挪|移)/,
    /^(?:移动|挪动|挪)(.+?)(?:向|往)[上下左右]/,
    /^(?:向|往)[上下左右](?:移动|挪动|挪|移)(.+?)(?:一点点|一点|一些|$)/,
  ];

  for (const pattern of patterns) {
    const target = toTarget(text.match(pattern)?.[1]);

    if (target.ref === "name" || target.ref === "query") {
      return target;
    }
  }

  return { ref: "active" };
}

function toTarget(value?: string): TargetSpec {
  if (isActiveReference(value)) {
    return { ref: "active" };
  }

  const query = extractTargetQuery(value);

  if (query) {
    return { ref: "query", query };
  }

  const name = normalizeObjectName(value);

  return name ? { ref: "name", name } : { ref: "active" };
}

function extractTargetQuery(value?: string): TargetQuery | undefined {
  if (!value) {
    return undefined;
  }

  const phrase = value.replace(/[的那个这]/g, "");
  const shape = findShape(phrase);
  const region = findPosition(phrase);
  const sizeRank = findTargetSizeRank(phrase);

  if (!shape && !region && !sizeRank) {
    return undefined;
  }

  return {
    shape,
    region,
    sizeRank,
  };
}

function findTargetSizeRank(text: string): TargetQuery["sizeRank"] | undefined {
  if (text.includes("最大") || text.includes("最大的")) {
    return "largest";
  }

  if (text.includes("最小") || text.includes("最小的")) {
    return "smallest";
  }

  return undefined;
}

function findShape(text: string) {
  const createdPhrase = findCreatedPhrase(text);
  const createdShape = createdPhrase ? findAnyShape(createdPhrase) : undefined;

  if (createdShape) {
    return createdShape;
  }

  return findAnyShape(text);
}

function findAnyShape(text: string) {
  return shapeKeywords.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))?.[0];
}

function findCreateColor(text: string) {
  const createdPhrase = findCreatedPhrase(text);

  return createdPhrase ? findColor(createdPhrase) : findColor(text);
}

function findCreatedPhrase(text: string) {
  return text.match(/(?:画|绘制|创建|添加|生成)(.+)$/)?.[1];
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
  const fill = color ?? (text.includes("实心") && shape !== "line" && shape !== "arrow" && shape !== "text" ? "#1f2937" : undefined);
  const position = buildCreatePosition(text);

  return {
    type: "create",
    shape,
    style: {
      fill: shape === "line" || shape === "arrow" || shape === "text" ? undefined : fill,
      stroke: color ?? "#1f2937",
    },
    position,
    text: shape === "text" ? extractText(text) : undefined,
    size: findSize(text),
    connection: shape === "arrow" ? extractConnection(text) : undefined,
  };
}

function buildCreatePosition(text: string): PositionSpec {
  const relative = extractRelativeCreatePosition(text);

  return {
    region: findPosition(text) ?? "center",
    relative,
  };
}

function extractRelativeCreatePosition(text: string): PositionSpec["relative"] {
  const direction = findRelativeCreateDirection(text);
  const target = extractRelativeCreateTarget(text);

  return direction && target ? { target, direction } : undefined;
}

function findRelativeCreateDirection(text: string): Direction | undefined {
  if (text.includes("左边") || text.includes("左侧")) {
    return "left";
  }

  if (text.includes("右边") || text.includes("右侧") || text.includes("旁边")) {
    return "right";
  }

  if (text.includes("上方") || text.includes("上面") || text.includes("之上")) {
    return "up";
  }

  if (text.includes("下方") || text.includes("下面") || text.includes("之下")) {
    return "down";
  }

  return undefined;
}

function extractRelativeCreateTarget(text: string): TargetSpec | undefined {
  const match = text.match(/^(?:在)?(.+?)(?:旁边|左边|左侧|右边|右侧|上方|上面|下面|下方|之上|之下).*?(?:画|绘制|创建|添加|生成)/);
  const target = toTarget(match?.[1]);

  return target.ref === "active" && !match?.[1] ? undefined : target;
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

  return text.includes("画") || text.includes("绘制") || text.includes("创建") || text.includes("添加") || text.includes("生成");
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractText(text: string) {
  const payload = text
    .replace(/^(请|帮我|请帮我|添加|输入)?(写上|写下|写|文字|文本|添加文字|添加文本|输入文字|输入文本)/, "")
    .replace(/^(一个|一段|一句)/, "")
    .replace(/(这几个字|几个字|两个字|三个字|四个字|五个字|六个字|文字|文本)$/, "")
    .replace(/[“”"'「」]/g, "");

  return payload || "文本";
}
