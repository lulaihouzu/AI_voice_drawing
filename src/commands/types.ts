export type ShapeType = "circle" | "rect" | "triangle" | "line" | "arrow" | "text";

export type Direction = "up" | "down" | "left" | "right";

export type LayerAction = "front" | "back" | "forward" | "backward";

export type ShapeSize = "small" | "normal" | "large";

export type PositionRegion =
  | "center"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type ShapeStyle = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fontSize?: number;
};

export type PositionSpec = {
  region?: PositionRegion;
  x?: number;
  y?: number;
  relative?: {
    target: TargetSpec;
    direction: Direction;
  };
};

export type TargetSpec = {
  ref: "active" | "last-created";
} | {
  ref: "name";
  name: string;
} | {
  ref: "query";
  query: TargetQuery;
};

export type TargetQuery = {
  shape?: ShapeType;
  region?: PositionRegion;
  sizeRank?: "largest" | "smallest";
};

export type ShapePatch = {
  fill?: string;
  stroke?: string;
  scale?: number;
};

export type ConnectionSpec = {
  mode: "connect" | "point-to";
  from?: string;
  to?: string;
};

export type DrawingCommand =
  | {
      type: "create";
      shape: ShapeType;
      style?: ShapeStyle;
      position?: PositionSpec;
      text?: string;
      size?: ShapeSize;
      connection?: ConnectionSpec;
    }
  | { type: "update"; target: TargetSpec; patch: ShapePatch }
  | { type: "move"; target: TargetSpec; direction: Direction; distance?: number }
  | { type: "delete"; target: TargetSpec }
  | { type: "rename"; target: TargetSpec; name: string }
  | { type: "layer"; target: TargetSpec; action: LayerAction }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" }
  | { type: "export"; format: "png" | "svg" | "json" }
  | { type: "project"; action: "save" | "load" };

export type ParseResult =
  | { ok: true; rawText: string; commands: DrawingCommand[] }
  | { ok: false; rawText: string; reason: string; suggestions: string[] };

export type CanvasObject = {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  rotation?: number;
  style: ShapeStyle;
  text?: string;
  name?: string;
  createdAt: number;
  updatedAt: number;
};

export type CanvasSnapshot = {
  objects: CanvasObject[];
  activeObjectId?: string;
};

export type FeedbackLevel = "info" | "success" | "error";

export type FeedbackMessage = {
  id: string;
  level: FeedbackLevel;
  message: string;
  createdAt: number;
};
