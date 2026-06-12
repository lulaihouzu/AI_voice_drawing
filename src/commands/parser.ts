import type { Direction, DrawingCommand, ParseResult, PositionRegion, ShapeType } from "./types";

const colorMap: Record<string, string> = {
  红: "#ef4444",
  红色: "#ef4444",
  蓝: "#2563eb",
  蓝色: "#2563eb",
  绿: "#16a34a",
  绿色: "#16a34a",
  黄: "#facc15",
  黄色: "#facc15",
  黑: "#111827",
  黑色: "#111827",
  白: "#ffffff",
  白色: "#ffffff",
};

const positionMap: Record<string, PositionRegion> = {
  中间: "center",
  中央: "center",
  左边: "left",
  右边: "right",
  上方: "top",
  下方: "bottom",
  左上角: "top-left",
  右上角: "top-right",
  左下角: "bottom-left",
  右下角: "bottom-right",
};

const directionMap: Record<string, Direction> = {
  上: "up",
  下: "down",
  左: "left",
  右: "right",
};

const shapeKeywords: Array<[ShapeType, string[]]> = [
  ["circle", ["圆形", "圆", "圈"]],
  ["rect", ["矩形", "方形", "方框", "框"]],
  ["arrow", ["箭头"]],
  ["line", ["直线", "线条", "线"]],
  ["text", ["文字", "文本", "写"]],
];

export function parseCommand(rawText: string): ParseResult {
  const text = rawText.trim().replace(/\s+/g, "");

  if (!text) {
    return unsupported(rawText, "没有识别到有效语音。");
  }

  if (text.includes("撤销")) {
    return ok(rawText, [{ type: "undo" }]);
  }

  if (text.includes("重做") || text.includes("恢复")) {
    return ok(rawText, [{ type: "redo" }]);
  }

  if (text.includes("清空")) {
    return ok(rawText, [{ type: "clear" }]);
  }

  if (text.includes("导出") || text.includes("保存为图片")) {
    return ok(rawText, [{ type: "export", format: "png" }]);
  }

  if (text.includes("删除")) {
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

  if (shape && (text.includes("画") || text.includes("创建") || text.includes("写"))) {
    return ok(rawText, [
      {
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
      },
    ]);
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
    suggestions: ["画一个红色圆形", "把它向右移动一点", "撤销", "导出为图片"],
  };
}

function findColor(text: string) {
  return Object.entries(colorMap).find(([keyword]) => text.includes(keyword))?.[1];
}

function findPosition(text: string) {
  return Object.entries(positionMap).find(([keyword]) => text.includes(keyword))?.[1];
}

function findDirection(text: string) {
  return Object.entries(directionMap).find(([keyword]) => text.includes(`向${keyword}`) || text.includes(`${keyword}移`))?.[1];
}

function findShape(text: string) {
  return shapeKeywords.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))?.[0];
}

function extractText(text: string) {
  const match = text.match(/(?:写上|写|添加文字|文字)(.+?)(?:两个字|几个字|文字)?$/);
  return match?.[1] || "文本";
}
