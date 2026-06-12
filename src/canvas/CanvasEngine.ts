import { createCanvasObject } from "./objectFactory";
import type { CanvasObject, Direction, DrawingCommand, ShapePatch } from "../commands/types";

export class CanvasEngine {
  createObject(command: Extract<DrawingCommand, { type: "create" }>) {
    return createCanvasObject(command);
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
