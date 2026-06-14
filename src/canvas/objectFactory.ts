import { resolveTargetQuery } from "../commands/targetQueries";
import type {
  CanvasObject,
  ConnectionSpec,
  Direction,
  DrawingCommand,
  PositionRegion,
  PositionSpec,
  ShapeSize,
  ShapeType,
  TargetSpec,
} from "../commands/types";
import { normalizeObjectName } from "../commands/objectNames";

const positionMap: Record<PositionRegion, { x: number; y: number }> = {
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

const circleRadiusMap: Record<ShapeSize, number> = {
  small: 32,
  normal: 48,
  large: 72,
};

const rectSizeMap: Record<ShapeSize, { width: number; height: number }> = {
  small: { width: 96, height: 60 },
  normal: { width: 128, height: 84 },
  large: { width: 176, height: 112 },
};

const triangleSizeMap: Record<ShapeSize, { width: number; height: number }> = {
  small: { width: 96, height: 84 },
  normal: { width: 128, height: 112 },
  large: { width: 176, height: 152 },
};

const lineLengthMap: Record<ShapeSize, number> = {
  small: 120,
  normal: 180,
  large: 240,
};

const textFontSizeMap: Record<ShapeSize, number> = {
  small: 22,
  normal: 28,
  large: 36,
};

const canvasWidth = 960;
const canvasHeight = 620;
const canvasPadding = 16;
const placementGap = 40;
const overlapMargin = 8;

type Bounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export function createCanvasObject(
  command: Extract<DrawingCommand, { type: "create" }>,
  existingObjects: CanvasObject[] = [],
  activeObjectId?: string,
): CanvasObject {
  const now = Date.now();
  const size = command.size ?? "normal";
  const position = resolveCreatePosition(command, existingObjects, size, activeObjectId);
  const base = {
    id: createId(),
    type: command.shape,
    x: position.x,
    y: position.y,
    style: {
      stroke: "#1f2937",
      strokeWidth: 2,
      ...command.style,
    },
    createdAt: now,
    updatedAt: now,
  };

  if (command.shape === "circle") {
    return { ...base, radius: circleRadiusMap[size] };
  }

  if (command.shape === "rect") {
    return { ...base, ...rectSizeMap[size] };
  }

  if (command.shape === "triangle") {
    return { ...base, ...triangleSizeMap[size] };
  }

  if (command.shape === "arrow") {
    const connection = resolveConnection(command.connection, existingObjects);

    if (connection) {
      return {
        ...base,
        x: connection.from.x,
        y: connection.from.y,
        width: connection.to.x - connection.from.x,
        height: connection.to.y - connection.from.y,
      };
    }

    return { ...base, width: lineLengthMap[size], height: 0 };
  }

  if (command.shape === "line") {
    return { ...base, width: lineLengthMap[size], height: 0 };
  }

  return {
    ...base,
    text: command.text ?? "文本",
    style: {
      ...base.style,
      fill: undefined,
      fontSize: command.style?.fontSize ?? textFontSizeMap[size],
    },
  };
}

function resolvePosition(region: PositionRegion = "center") {
  return positionMap[region];
}

function resolveCreatePosition(
  command: Extract<DrawingCommand, { type: "create" }>,
  existingObjects: CanvasObject[],
  size: ShapeSize,
  activeObjectId?: string,
) {
  const regionPosition = resolvePosition(command.position?.region);
  const requestedPosition = {
    x: command.position?.x ?? regionPosition.x,
    y: command.position?.y ?? regionPosition.y,
  };

  if (command.position?.x !== undefined || command.position?.y !== undefined) {
    return requestedPosition;
  }

  const relativePosition = resolveRelativePosition(command.position?.relative, existingObjects, getCommandBoxSize(command, size), activeObjectId);

  if (relativePosition) {
    return relativePosition;
  }

  if (!shouldAutoPlace(command, existingObjects)) {
    return requestedPosition;
  }

  const anchor = findAutoPlacementAnchor(existingObjects);

  if (!anchor) {
    return requestedPosition;
  }

  return findNonOverlappingPlacement(anchor, getCommandBoxSize(command, size), existingObjects) ?? requestedPosition;
}

function shouldAutoPlace(command: Extract<DrawingCommand, { type: "create" }>, existingObjects: CanvasObject[]) {
  if (existingObjects.length === 0 || command.shape === "arrow" || command.shape === "line") {
    return false;
  }

  if (command.position?.x !== undefined || command.position?.y !== undefined) {
    return false;
  }

  return command.position?.region === undefined || command.position.region === "center";
}

function findAutoPlacementAnchor(objects: CanvasObject[]) {
  return [...objects].reverse().find((object) => object.type !== "arrow" && object.type !== "line");
}

function resolveRelativePosition(
  relative: PositionSpec["relative"],
  objects: CanvasObject[],
  size: { width: number; height: number },
  activeObjectId?: string,
) {
  if (!relative) {
    return undefined;
  }

  const anchor = resolvePositionTarget(objects, relative.target, activeObjectId);

  return anchor ? findNonOverlappingPlacement(anchor, size, objects, relative.direction) : undefined;
}

function resolvePositionTarget(objects: CanvasObject[], target: TargetSpec, activeObjectId?: string) {
  if (target.ref === "active") {
    return objects.find((object) => object.id === activeObjectId) ?? findAutoPlacementAnchor(objects);
  }

  if (target.ref === "last-created") {
    return findAutoPlacementAnchor(objects);
  }

  if (target.ref === "name") {
    return [...objects].reverse().find((object) => normalizeObjectName(object.name) === target.name);
  }

  if (target.ref === "query") {
    return resolveTargetQuery(objects, target.query);
  }

  return undefined;
}

function findNonOverlappingPlacement(
  anchor: CanvasObject,
  size: { width: number; height: number },
  objects: CanvasObject[],
  preferredDirection?: Direction,
) {
  const anchorBounds = getObjectBounds(anchor);
  const candidateMap: Record<Direction, { x: number; y: number }> = {
    right: { x: anchorBounds.right + placementGap + size.width / 2, y: anchor.y },
    left: { x: anchorBounds.left - placementGap - size.width / 2, y: anchor.y },
    down: { x: anchor.x, y: anchorBounds.bottom + placementGap + size.height / 2 },
    up: { x: anchor.x, y: anchorBounds.top - placementGap - size.height / 2 },
  };
  const directions = preferredDirection
    ? [preferredDirection, ...(["right", "left", "down", "up"] as Direction[]).filter((direction) => direction !== preferredDirection)]
    : (["right", "left", "down", "up"] as Direction[]);
  const candidates = directions.map((direction) => clampCenter(candidateMap[direction], size));

  return candidates.find((point) => !overlapsAny(toBounds(point, size), objects)) ?? candidates[0];
}

function clampCenter(point: { x: number; y: number }, size: { width: number; height: number }) {
  return {
    x: clamp(point.x, canvasPadding + size.width / 2, canvasWidth - canvasPadding - size.width / 2),
    y: clamp(point.y, canvasPadding + size.height / 2, canvasHeight - canvasPadding - size.height / 2),
  };
}

function overlapsAny(bounds: Bounds, objects: CanvasObject[]) {
  return objects.some((object) => intersects(bounds, getObjectBounds(object)));
}

function intersects(a: Bounds, b: Bounds) {
  return (
    a.left - overlapMargin < b.right &&
    a.right + overlapMargin > b.left &&
    a.top - overlapMargin < b.bottom &&
    a.bottom + overlapMargin > b.top
  );
}

function toBounds(point: { x: number; y: number }, size: { width: number; height: number }): Bounds {
  return {
    left: point.x - size.width / 2,
    right: point.x + size.width / 2,
    top: point.y - size.height / 2,
    bottom: point.y + size.height / 2,
  };
}

function getCommandBoxSize(command: Extract<DrawingCommand, { type: "create" }>, size: ShapeSize) {
  if (command.shape === "circle") {
    const radius = circleRadiusMap[size];

    return { width: radius * 2, height: radius * 2 };
  }

  if (command.shape === "rect") {
    return rectSizeMap[size];
  }

  if (command.shape === "triangle") {
    return triangleSizeMap[size];
  }

  if (command.shape === "text") {
    const fontSize = command.style?.fontSize ?? textFontSizeMap[size];

    return {
      width: Math.max(64, (command.text ?? "文本").length * fontSize),
      height: fontSize * 1.4,
    };
  }

  const length = lineLengthMap[size];

  return { width: length, height: 16 };
}

function getObjectBounds(object: CanvasObject): Bounds {
  if (object.type === "circle") {
    const radius = object.radius ?? circleRadiusMap.normal;

    return {
      left: object.x - radius,
      right: object.x + radius,
      top: object.y - radius,
      bottom: object.y + radius,
    };
  }

  if (object.type === "rect") {
    const width = object.width ?? rectSizeMap.normal.width;
    const height = object.height ?? rectSizeMap.normal.height;

    return toBounds({ x: object.x, y: object.y }, { width, height });
  }

  if (object.type === "triangle") {
    const width = object.width ?? triangleSizeMap.normal.width;
    const height = object.height ?? triangleSizeMap.normal.height;

    return toBounds({ x: object.x, y: object.y }, { width, height });
  }

  if (object.type === "text") {
    const fontSize = object.style.fontSize ?? textFontSizeMap.normal;
    const width = Math.max(64, (object.text ?? "文本").length * fontSize);
    const height = fontSize * 1.4;

    return toBounds({ x: object.x, y: object.y }, { width, height });
  }

  const x2 = object.x + (object.width ?? lineLengthMap.normal);
  const y2 = object.y + (object.height ?? 0);

  return {
    left: Math.min(object.x, x2),
    right: Math.max(object.x, x2),
    top: Math.min(object.y, y2) - 8,
    bottom: Math.max(object.y, y2) + 8,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function resolveConnection(connection: ConnectionSpec | undefined, objects: CanvasObject[]) {
  if (!connection) {
    return undefined;
  }

  const source = connection.from ? findObjectByReference(objects, connection.from) : undefined;
  const target = connection.to ? findObjectByReference(objects, connection.to) : undefined;
  const fallbackPair = getLastDrawablePair(objects);
  const from = source ?? (target ? findLatestOtherObject(objects, target.id) : fallbackPair?.from);
  const to = target ?? (source ? findLatestOtherObject(objects, source.id) : fallbackPair?.to);

  if (!from || !to) {
    return undefined;
  }

  return {
    from: getObjectAnchor(from),
    to: getObjectAnchor(to),
  };
}

function findObjectByReference(objects: CanvasObject[], reference: string) {
  const expectedName = normalizeObjectName(reference);
  const namedObject = expectedName
    ? [...objects].reverse().find((object) => normalizeObjectName(object.name) === expectedName)
    : undefined;

  if (namedObject) {
    return namedObject;
  }

  const expectedType = inferShapeType(reference);

  if (!expectedType) {
    return undefined;
  }

  return [...objects].reverse().find((object) => object.type === expectedType);
}

function inferShapeType(reference: string): ShapeType | undefined {
  if (/圆|圈/.test(reference)) {
    return "circle";
  }

  if (/矩形|方形|方块|方框|框/.test(reference)) {
    return "rect";
  }

  if (/三角形|三角/.test(reference)) {
    return "triangle";
  }

  if (/箭头/.test(reference)) {
    return "arrow";
  }

  if (/直线|线条|线/.test(reference)) {
    return "line";
  }

  if (/文字|文本|字/.test(reference)) {
    return "text";
  }

  return undefined;
}

function getLastDrawablePair(objects: CanvasObject[]) {
  const drawableObjects = objects.filter((object) => object.type !== "arrow");

  if (drawableObjects.length < 2) {
    return undefined;
  }

  return {
    from: drawableObjects[drawableObjects.length - 2],
    to: drawableObjects[drawableObjects.length - 1],
  };
}

function findLatestOtherObject(objects: CanvasObject[], excludedId: string) {
  return [...objects].reverse().find((object) => object.id !== excludedId && object.type !== "arrow");
}

function getObjectAnchor(object: CanvasObject) {
  if (object.type === "line" || object.type === "arrow") {
    return {
      x: object.x + (object.width ?? 0) / 2,
      y: object.y + (object.height ?? 0) / 2,
    };
  }

  return {
    x: object.x,
    y: object.y,
  };
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `object-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
