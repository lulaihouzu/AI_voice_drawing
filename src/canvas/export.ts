import type { CanvasObject } from "../commands/types";

export function serializeCanvas(objects: CanvasObject[]) {
  return JSON.stringify({ version: 1, objects }, null, 2);
}
