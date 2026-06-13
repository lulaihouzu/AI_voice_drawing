import { useEffect } from "react";
import { downloadCanvasAsPng } from "../canvas/export";
import { useDrawingStore } from "../state/store";

export function ExportController() {
  const pendingExport = useDrawingStore((state) => state.pendingExport);
  const completeExport = useDrawingStore((state) => state.completeExport);

  useEffect(() => {
    if (!pendingExport) {
      return;
    }

    let cancelled = false;

    downloadCanvasAsPng(pendingExport)
      .then(() => {
        if (!cancelled) {
          completeExport("已导出 PNG 图片。", "success");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "导出图片失败。";
          completeExport(message, "error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [completeExport, pendingExport]);

  return null;
}
