import { createCanvasObject } from "./objectFactory";
import type { CanvasObject, Direction, DrawingCommand, LayerAction, ShapePatch } from "../commands/types";

export class CanvasEngine {
  createObject(command: Extract<DrawingCommand, { type: "create" }>, existingObjects: CanvasObject[] = []) {
    return createCanvasObject(command, existingObjects);
  }

  updateObject(objects: CanvasObject[], targetId: string, patch: ShapePatch) {
    const nextObjects = objects.map((object) => {
      if (object.id !== targetId) {
        return object;
      }

      return {
        ...object,
        radius: object.radius && patch.scale ? object.radius * patch.scale : object.radius,
        width: object.width && patch.scale ? object.width * patch.scale : object.width,
        height: object.height && patch.scale ? object.height * patch.scale : object.height,
        style: {
          ...object.style,
          fill: patch.fill ?? object.style.fill,
          stroke: patch.stroke ?? object.style.stroke,
        },
        updatedAt: Date.now(),
      };
    });

    return { objects: nextObjects, activeObjectId: targetId };
  }

  moveObject(objects: CanvasObject[], targetId: string, direction: Direction, distance: number) {
    const vector = toVector(direction, distance);
    const nextObjects = objects.map((object) => {
      if (object.id !== targetId) {
        return object;
      }

      return {
        ...object,
        x: object.x + vector.x,
        y: object.y + vector.y,
        updatedAt: Date.now(),
      };
    });

    return { objects: nextObjects, activeObjectId: targetId };
  }

  renameObject(objects: CanvasObject[], targetId: string, name: string) {
    const nextObjects = objects.map((object) => {
      if (object.id !== targetId) {
        return object;
      }

      return {
        ...object,
        name,
        updatedAt: Date.now(),
      };
    });

    return { objects: nextObjects, activeObjectId: targetId };
  }

  reorderObject(objects: CanvasObject[], targetId: string, action: LayerAction) {
    const currentIndex = objects.findIndex((object) => object.id === targetId);

    if (currentIndex === -1) {
      return { objects, activeObjectId: undefined, changed: false };
    }

    const targetIndex = getLayerTargetIndex(currentIndex, objects.length, action);

    if (targetIndex === currentIndex) {
      return { objects, activeObjectId: targetId, changed: false };
    }

    const nextObjects = [...objects];
    const [targetObject] = nextObjects.splice(currentIndex, 1);
    nextObjects.splice(targetIndex, 0, {
      ...targetObject,
      updatedAt: Date.now(),
    });

    return { objects: nextObjects, activeObjectId: targetId, changed: true };
  }
}

function toVector(direction: Direction, distance: number) {
  if (direction === "up") {
    return { x: 0, y: -distance };
  }

  if (direction === "down") {
    return { x: 0, y: distance };
  }

  if (direction === "left") {
    return { x: -distance, y: 0 };
  }

  return { x: distance, y: 0 };
}

function getLayerTargetIndex(currentIndex: number, objectCount: number, action: LayerAction) {
  if (action === "front") {
    return objectCount - 1;
  }

  if (action === "back") {
    return 0;
  }

  if (action === "forward") {
    return Math.min(currentIndex + 1, objectCount - 1);
  }

  return Math.max(currentIndex - 1, 0);
}
