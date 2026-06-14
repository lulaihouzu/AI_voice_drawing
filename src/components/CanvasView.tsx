import { useMemo } from "react";
import { useDrawingStore } from "../state/store";
import type { CanvasObject } from "../commands/types";

function renderObject(object: CanvasObject, isActive: boolean) {
  const stroke = object.style.stroke ?? "#1f2937";
  const strokeWidth = isActive ? (object.style.strokeWidth ?? 2) + 1 : object.style.strokeWidth ?? 2;
  const fill = object.style.fill ?? "transparent";
  const activeClassName = isActive ? "canvas-object is-active" : "canvas-object";

  if (object.type === "circle") {
    return (
      <circle
        key={object.id}
        className={activeClassName}
        cx={object.x}
        cy={object.y}
        r={object.radius ?? 48}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }

  if (object.type === "rect") {
    const width = object.width ?? 120;
    const height = object.height ?? 80;

    return (
      <rect
        key={object.id}
        className={activeClassName}
        x={object.x - width / 2}
        y={object.y - height / 2}
        width={width}
        height={height}
        rx={8}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }

  if (object.type === "triangle") {
    const width = object.width ?? 128;
    const height = object.height ?? 112;
    const points = [
      `${object.x},${object.y - height / 2}`,
      `${object.x + width / 2},${object.y + height / 2}`,
      `${object.x - width / 2},${object.y + height / 2}`,
    ].join(" ");

    return (
      <polygon
        key={object.id}
        className={activeClassName}
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    );
  }

  if (object.type === "line" || object.type === "arrow") {
    return (
      <line
        key={object.id}
        className={activeClassName}
        x1={object.x}
        y1={object.y}
        x2={object.x + (object.width ?? 160)}
        y2={object.y + (object.height ?? 0)}
        stroke={stroke}
        strokeWidth={strokeWidth}
        markerEnd={object.type === "arrow" ? "url(#arrow-head)" : undefined}
      />
    );
  }

  return (
    <text
      key={object.id}
      className={activeClassName}
      x={object.x}
      y={object.y}
      fill={stroke}
      fontSize={object.style.fontSize ?? 28}
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {object.text ?? "文本"}
    </text>
  );
}

export function CanvasView() {
  const objects = useDrawingStore((state) => state.objects);
  const activeObjectId = useDrawingStore((state) => state.activeObjectId);

  const renderedObjects = useMemo(
    () => objects.map((object) => renderObject(object, object.id === activeObjectId)),
    [activeObjectId, objects],
  );

  return (
    <section className="canvas-panel" aria-label="绘图画布">
      <svg className="drawing-canvas" viewBox="0 0 960 620" role="img" aria-label="当前绘图内容">
        <defs>
          <marker id="arrow-head" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto">
            <path d="M 0 0 L 14 7 L 0 14 z" fill="#1f2937" />
          </marker>
          <pattern id="canvas-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 H 0 V 32" fill="none" stroke="#e5e7eb" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="960" height="620" fill="#f8fafc" />
        <rect width="960" height="620" fill="url(#canvas-grid)" />
        {objects.length === 0 ? (
          <text className="canvas-empty" x="480" y="310" textAnchor="middle">
            等待语音创建图形
          </text>
        ) : (
          renderedObjects
        )}
      </svg>
    </section>
  );
}
