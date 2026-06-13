import type { CanvasObject, PositionRegion, ShapeType, TargetQuery } from "./types";

const regionLabels: Record<PositionRegion, string> = {
  center: "中间",
  left: "左边",
  right: "右边",
  top: "上方",
  bottom: "下方",
  "top-left": "左上角",
  "top-right": "右上角",
  "bottom-left": "左下角",
  "bottom-right": "右下角",
};

const regionAnchors: Record<PositionRegion, { x: number; y: number }> = {
  center: { x: 480, y: 310 },
  left: { x: 260, y: 310 },
  right: { x: 700, y: 310 },
  top: { x: 480, y: 160 },
  bottom: { x: 480, y: 460 },
  "top-left": { x: 260, y: 160 },
  "top-right": { x: 700, y: 160 },
  "bottom-left": { x: 260, y: 460 },
  "bottom-right": { x: 700, y: 460 },
};

const shapeLabels: Record<ShapeType, string> = {
  circle: "圆形",
  rect: "矩形",
  line: "直线",
  arrow: "箭头",
  text: "文本",
};

export function resolveTargetQuery(objects: CanvasObject[], query: TargetQuery) {
  const candidates = objects.filter((object) => !query.shape || object.type === query.shape);

  if (candidates.length === 0) {
    return undefined;
  }

  if (query.sizeRank) {
    return [...candidates].sort((left, right) => {
      const leftArea = getObjectMeasure(left);
      const rightArea = getObjectMeasure(right);

      return query.sizeRank === "largest" ? rightArea - leftArea : leftArea - rightArea;
    })[0];
  }

  if (query.region) {
    const anchor = regionAnchors[query.region];

    return [...candidates].sort((left, right) => {
      return getDistance(left, anchor) - getDistance(right, anchor);
    })[0];
  }

  return [...candidates].reverse()[0];
}

export function describeTargetQuery(query: TargetQuery) {
  const parts = [
    query.region ? regionLabels[query.region] : undefined,
    query.sizeRank === "largest" ? "最大" : query.sizeRank === "smallest" ? "最小" : undefined,
    query.shape ? shapeLabels[query.shape] : "对象",
  ].filter(Boolean);

  return parts.join("");
}

function getDistance(object: CanvasObject, point: { x: number; y: number }) {
  const dx = object.x - point.x;
  const dy = object.y - point.y;

  return Math.sqrt(dx * dx + dy * dy);
}

function getObjectMeasure(object: CanvasObject) {
  if (object.type === "circle") {
    return (object.radius ?? 48) * (object.radius ?? 48);
  }

  if (object.type === "rect") {
    return (object.width ?? 120) * (object.height ?? 80);
  }

  if (object.type === "line" || object.type === "arrow") {
    return Math.sqrt((object.width ?? 160) ** 2 + (object.height ?? 0) ** 2);
  }

  return (object.text?.length ?? 2) * (object.style.fontSize ?? 28);
}
