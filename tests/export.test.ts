import { describe, expect, it } from "vitest";
import { canvasObjectsToSvg, createCanvasExportRequest, serializeCanvas } from "../src/canvas/export";
import type { CanvasObject } from "../src/commands/types";

const baseObject = {
  id: "object-1",
  x: 120,
  y: 140,
  style: {
    stroke: "#111827",
    strokeWidth: 2,
  },
  createdAt: 1,
  updatedAt: 1,
};

describe("canvas export", () => {
  it("serializes canvas objects as project data", () => {
    const objects: CanvasObject[] = [{ ...baseObject, type: "circle", radius: 48, name: "开始" }];

    expect(serializeCanvas(objects)).toContain('"version": 1');
    expect(serializeCanvas(objects)).toContain('"type": "circle"');
    expect(serializeCanvas(objects)).toContain('"name": "开始"');
  });

  it("renders circles, text, and arrows into svg markup", () => {
    const objects: CanvasObject[] = [
      { ...baseObject, id: "circle-1", type: "circle", radius: 48, style: { ...baseObject.style, fill: "#ef4444" } },
      {
        ...baseObject,
        id: "text-1",
        type: "text",
        x: 240,
        text: "开始 <测试>",
        style: { ...baseObject.style, fontSize: 28 },
      },
      { ...baseObject, id: "arrow-1", type: "arrow", x: 120, y: 140, width: 120, height: 0 },
    ];
    const svg = canvasObjectsToSvg(objects);

    expect(svg).toContain("<svg");
    expect(svg).toContain('<circle cx="120" cy="140" r="48"');
    expect(svg).toContain("开始 &lt;测试&gt;");
    expect(svg).toContain('marker-end="url(#arrow-head)"');
    expect(svg).toContain('fill="url(#canvas-grid)"');
  });

  it("creates an immutable png export request", () => {
    const objects: CanvasObject[] = [{ ...baseObject, type: "rect", width: 128, height: 84 }];
    const request = createCanvasExportRequest(objects);

    objects[0].style.stroke = "#000000";

    expect(request.format).toBe("png");
    expect(request.filename).toMatch(/^ai-voice-drawing-\d{8}-\d{6}\.png$/);
    expect(request.objects[0].style.stroke).toBe("#111827");
  });
});
