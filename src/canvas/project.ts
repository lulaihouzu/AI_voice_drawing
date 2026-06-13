import type { CanvasObject, ShapeType } from "../commands/types";

export const CANVAS_PROJECT_VERSION = 1;

export type CanvasProject = {
  version: typeof CANVAS_PROJECT_VERSION;
  savedAt: string;
  objects: CanvasObject[];
  activeObjectId?: string;
};

const shapeTypes: ShapeType[] = ["circle", "rect", "line", "arrow", "text"];

export function createCanvasProject(objects: CanvasObject[], activeObjectId?: string): CanvasProject {
  return {
    version: CANVAS_PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    objects: cloneCanvasObjects(objects),
    activeObjectId,
  };
}

export function serializeCanvasProject(project: CanvasProject) {
  return JSON.stringify(project, null, 2);
}

export function parseCanvasProject(rawJson: string): CanvasProject {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("工程文件不是有效 JSON。");
  }

  if (!isRecord(parsed) || parsed.version !== CANVAS_PROJECT_VERSION || !Array.isArray(parsed.objects)) {
    throw new Error("工程文件格式无效。");
  }

  const objects = parsed.objects.map(parseCanvasObject);
  const activeObjectId = typeof parsed.activeObjectId === "string" ? parsed.activeObjectId : undefined;

  return {
    version: CANVAS_PROJECT_VERSION,
    savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
    objects,
    activeObjectId: activeObjectId && objects.some((object) => object.id === activeObjectId) ? activeObjectId : undefined,
  };
}

export function cloneCanvasObjects(objects: CanvasObject[]) {
  return objects.map((object) => ({
    ...object,
    style: {
      ...object.style,
    },
  }));
}

function parseCanvasObject(value: unknown): CanvasObject {
  if (!isRecord(value) || typeof value.id !== "string" || !isShapeType(value.type)) {
    throw new Error("工程文件包含无效画布对象。");
  }

  if (!isRecord(value.style)) {
    throw new Error("工程文件包含无效对象样式。");
  }

  return {
    id: value.id,
    type: value.type,
    x: readNumber(value.x, 480),
    y: readNumber(value.y, 310),
    width: readOptionalNumber(value.width),
    height: readOptionalNumber(value.height),
    radius: readOptionalNumber(value.radius),
    rotation: readOptionalNumber(value.rotation),
    style: {
      fill: readOptionalString(value.style.fill),
      stroke: readOptionalString(value.style.stroke),
      strokeWidth: readOptionalNumber(value.style.strokeWidth),
      fontSize: readOptionalNumber(value.style.fontSize),
    },
    text: readOptionalString(value.text),
    name: readOptionalString(value.name),
    createdAt: readNumber(value.createdAt, Date.now()),
    updatedAt: readNumber(value.updatedAt, Date.now()),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isShapeType(value: unknown): value is ShapeType {
  return typeof value === "string" && shapeTypes.includes(value as ShapeType);
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
