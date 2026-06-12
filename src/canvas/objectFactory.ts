import type { CanvasObject, DrawingCommand, PositionRegion } from "../commands/types";

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

export function createCanvasObject(command: Extract<DrawingCommand, { type: "create" }>): CanvasObject {
  const now = Date.now();
  const position = resolvePosition(command.position?.region);
  const base = {
    id: createId(),
    type: command.shape,
    x: command.position?.x ?? position.x,
    y: command.position?.y ?? position.y,
    style: command.style ?? {},
    createdAt: now,
    updatedAt: now,
  };

  if (command.shape === "circle") {
    return { ...base, radius: 48 };
  }

  if (command.shape === "rect") {
    return { ...base, width: 128, height: 84 };
  }

  if (command.shape === "line" || command.shape === "arrow") {
    return { ...base, width: 180, height: 0 };
  }

  return { ...base, text: command.text ?? "文本", style: { stroke: "#1f2937", fontSize: 28, ...command.style } };
}

function resolvePosition(region: PositionRegion = "center") {
  return positionMap[region];
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `object-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
