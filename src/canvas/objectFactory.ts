import type { CanvasObject, ConnectionSpec, DrawingCommand, PositionRegion, ShapeSize, ShapeType } from "../commands/types";
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

export function createCanvasObject(
  command: Extract<DrawingCommand, { type: "create" }>,
  existingObjects: CanvasObject[] = [],
): CanvasObject {
  const now = Date.now();
  const position = resolvePosition(command.position?.region);
  const size = command.size ?? "normal";
  const base = {
    id: createId(),
    type: command.shape,
    x: command.position?.x ?? position.x,
    y: command.position?.y ?? position.y,
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
