import type { AiCommandContext } from "./types";
import type { CanvasObject, ShapeType } from "../commands/types";

const shapeLabels: Record<ShapeType, string> = {
  circle: "圆形",
  rect: "矩形",
  triangle: "三角形",
  line: "直线",
  arrow: "箭头",
  text: "文本",
};

export function createCanvasSummary(context: AiCommandContext) {
  const objects = context.objects;

  if (objects.length === 0) {
    return "当前画布为空。可以说“生成一个用户登录流程图”或“画一个红色圆形”开始创作。";
  }

  const counts = summarizeShapeCounts(objects);
  const activeObject = findActiveObject(context);
  const activeText = activeObject ? `当前选中的是${describeObject(activeObject)}。` : "当前没有选中对象。";
  const sampleText = summarizeSampleObjects(objects);

  return `当前画布共有 ${objects.length} 个对象，包括${counts}。${activeText}${sampleText}`;
}

export function createCanvasOptimizationAdvice(context: AiCommandContext) {
  const objects = context.objects;

  if (objects.length === 0) {
    return "优化建议：当前画布为空，建议先生成一个流程图草稿，再根据节点数量补充连接和说明。";
  }

  const suggestions = buildOptimizationSuggestions(objects);

  return `优化建议：${suggestions.slice(0, 3).join("；")}。`;
}

function summarizeShapeCounts(objects: CanvasObject[]) {
  const counts = new Map<ShapeType, number>();

  objects.forEach((object) => {
    counts.set(object.type, (counts.get(object.type) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([type, count]) => `${count} 个${shapeLabels[type]}`)
    .join("、");
}

function findActiveObject(context: AiCommandContext) {
  if (!context.activeObjectId) {
    return undefined;
  }

  return context.objects.find((object) => object.id === context.activeObjectId);
}

function summarizeSampleObjects(objects: CanvasObject[]) {
  const labels = objects.slice(0, 4).map(describeObject);

  if (labels.length === 0) {
    return "";
  }

  const suffix = objects.length > labels.length ? "等" : "";

  return `画布中有${labels.join("、")}${suffix}。`;
}

function describeObject(object: CanvasObject) {
  const readableName = object.name || object.text;

  if (readableName) {
    return `“${readableName}”${shapeLabels[object.type]}`;
  }

  return `${getRegionText(object)}的${shapeLabels[object.type]}`;
}

function buildOptimizationSuggestions(objects: CanvasObject[]) {
  const suggestions: string[] = [];
  const nodeCount = objects.filter((object) => object.type !== "arrow" && object.type !== "line").length;
  const arrowCount = objects.filter((object) => object.type === "arrow").length;

  if (hasOverlappingObjects(objects)) {
    suggestions.push("拉开重叠对象的距离，让节点更容易辨认");
  }

  if (nodeCount >= 2 && arrowCount === 0) {
    suggestions.push("为关键节点增加箭头连接，表达流程顺序");
  }

  if (objects.some((object) => !object.name && !object.text && object.type !== "arrow" && object.type !== "line")) {
    suggestions.push("给关键图形命名或补充文本标签，降低语音引用难度");
  }

  if (objects.length >= 4) {
    suggestions.push("按从左到右或从上到下的阅读顺序整理节点");
  }

  if (arrowCount > 0) {
    suggestions.push("检查箭头方向是否和流程实际走向一致");
  }

  if (suggestions.length === 0) {
    suggestions.push("当前结构已经比较清晰，可以继续补充颜色层级或导出作品");
  }

  return suggestions;
}

function hasOverlappingObjects(objects: CanvasObject[]) {
  const boxes = objects
    .filter((object) => object.type !== "arrow" && object.type !== "line")
    .map(getObjectBounds);

  return boxes.some((box, index) => boxes.slice(index + 1).some((otherBox) => isOverlapping(box, otherBox)));
}

function getObjectBounds(object: CanvasObject) {
  const width = object.width ?? (object.radius ? object.radius * 2 : 120);
  const height = object.height ?? (object.radius ? object.radius * 2 : 40);

  return {
    left: object.x - width / 2,
    right: object.x + width / 2,
    top: object.y - height / 2,
    bottom: object.y + height / 2,
  };
}

function isOverlapping(first: ReturnType<typeof getObjectBounds>, second: ReturnType<typeof getObjectBounds>) {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
}

function getRegionText(object: CanvasObject) {
  if (object.x < 320) {
    return object.y < 220 ? "左上方" : object.y > 420 ? "左下方" : "左侧";
  }

  if (object.x > 640) {
    return object.y < 220 ? "右上方" : object.y > 420 ? "右下方" : "右侧";
  }

  if (object.y < 220) {
    return "上方";
  }

  if (object.y > 420) {
    return "下方";
  }

  return "中间";
}
