import { createCanvasProject, parseCanvasProject, serializeCanvasProject, type CanvasProject } from "./project";
import type { CanvasObject } from "../commands/types";

const projectStorageKey = "ai-voice-drawing.project.v1";
let memoryProjectJson: string | undefined;

export function saveProjectSnapshot(objects: CanvasObject[], activeObjectId?: string) {
  const project = createCanvasProject(objects, activeObjectId);
  const serialized = serializeCanvasProject(project);
  const storage = getLocalStorage();

  if (storage) {
    storage.setItem(projectStorageKey, serialized);
  } else {
    memoryProjectJson = serialized;
  }

  return project;
}

export function loadProjectSnapshot(): CanvasProject | undefined {
  const storage = getLocalStorage();
  const serialized = storage ? storage.getItem(projectStorageKey) : memoryProjectJson;

  if (!serialized) {
    return undefined;
  }

  return parseCanvasProject(serialized);
}

export function clearProjectSnapshot() {
  const storage = getLocalStorage();

  if (storage) {
    storage.removeItem(projectStorageKey);
  }

  memoryProjectJson = undefined;
}

function getLocalStorage() {
  try {
    if (typeof localStorage === "undefined") {
      return undefined;
    }

    return localStorage;
  } catch {
    return undefined;
  }
}
