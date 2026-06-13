import type { CanvasObject } from "../commands/types";

export const EXPORT_CANVAS_WIDTH = 960;
export const EXPORT_CANVAS_HEIGHT = 620;

export type CanvasExportRequest = {
  id: string;
  format: "png" | "svg";
  filename: string;
  objects: CanvasObject[];
};

export function serializeCanvas(objects: CanvasObject[]) {
  return JSON.stringify({ version: 1, objects }, null, 2);
}

export function createCanvasExportRequest(objects: CanvasObject[], format: CanvasExportRequest["format"] = "png"): CanvasExportRequest {
  return {
    id: `export-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    format,
    filename: `ai-voice-drawing-${formatTimestamp(new Date())}.${format}`,
    objects: cloneCanvasObjects(objects),
  };
}

export function canvasObjectsToSvg(objects: CanvasObject[]) {
  const renderedObjects = objects.map(renderSvgObject).join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${EXPORT_CANVAS_WIDTH}" height="${EXPORT_CANVAS_HEIGHT}" viewBox="0 0 ${EXPORT_CANVAS_WIDTH} ${EXPORT_CANVAS_HEIGHT}">`,
    "<defs>",
    '<marker id="arrow-head" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto">',
    '<path d="M 0 0 L 14 7 L 0 14 z" fill="#1f2937" />',
    "</marker>",
    '<pattern id="canvas-grid" width="32" height="32" patternUnits="userSpaceOnUse">',
    '<path d="M 32 0 H 0 V 32" fill="none" stroke="#e5e7eb" stroke-width="1" />',
    "</pattern>",
    "</defs>",
    `<rect width="${EXPORT_CANVAS_WIDTH}" height="${EXPORT_CANVAS_HEIGHT}" fill="#f8fafc" />`,
    `<rect width="${EXPORT_CANVAS_WIDTH}" height="${EXPORT_CANVAS_HEIGHT}" fill="url(#canvas-grid)" />`,
    renderedObjects,
    "</svg>",
  ].join("");
}

export async function downloadCanvasAsPng(request: CanvasExportRequest) {
  const svg = canvasObjectsToSvg(request.objects);
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = EXPORT_CANVAS_WIDTH;
    canvas.height = EXPORT_CANVAS_HEIGHT;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("浏览器不支持 Canvas 导出。");
    }

    context.drawImage(image, 0, 0, EXPORT_CANVAS_WIDTH, EXPORT_CANVAS_HEIGHT);
    const blob = await canvasToBlob(canvas);
    const pngUrl = URL.createObjectURL(blob);

    try {
      triggerDownload(pngUrl, request.filename);
    } finally {
      URL.revokeObjectURL(pngUrl);
    }
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export function downloadCanvasAsSvg(request: CanvasExportRequest) {
  const svg = canvasObjectsToSvg(request.objects);
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    triggerDownload(svgUrl, request.filename);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function renderSvgObject(object: CanvasObject) {
  const stroke = object.style.stroke ?? "#1f2937";
  const strokeWidth = object.style.strokeWidth ?? 2;
  const fill = object.style.fill ?? "transparent";

  if (object.type === "circle") {
    return `<circle cx="${object.x}" cy="${object.y}" r="${object.radius ?? 48}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" />`;
  }

  if (object.type === "rect") {
    const width = object.width ?? 120;
    const height = object.height ?? 80;

    return `<rect x="${object.x - width / 2}" y="${object.y - height / 2}" width="${width}" height="${height}" rx="8" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" />`;
  }

  if (object.type === "line" || object.type === "arrow") {
    const markerEnd = object.type === "arrow" ? ' marker-end="url(#arrow-head)"' : "";

    return `<line x1="${object.x}" y1="${object.y}" x2="${object.x + (object.width ?? 160)}" y2="${object.y + (object.height ?? 0)}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}"${markerEnd} />`;
  }

  return `<text x="${object.x}" y="${object.y}" fill="${escapeXml(stroke)}" font-size="${object.style.fontSize ?? 28}" text-anchor="middle" dominant-baseline="middle">${escapeXml(object.text ?? "文本")}</text>`;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片导出渲染失败。"));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("PNG 生成失败。"));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
}

function cloneCanvasObjects(objects: CanvasObject[]) {
  return objects.map((object) => ({
    ...object,
    style: {
      ...object.style,
    },
  }));
}

function escapeXml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}
