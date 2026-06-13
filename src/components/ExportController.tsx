import { useEffect } from "react";
import { downloadCanvasAsPng, downloadCanvasAsSvg } from "../canvas/export";
import { useDrawingStore } from "../state/store";

export function ExportController() {
  const pendingExport = useDrawingStore((state) => state.pendingExport);
  const completeExport = useDrawingStore((state) => state.completeExport);

  useEffect(() => {
    if (!pendingExport) {
      return;
    }

    let cancelled = false;

    const formatLabel = pendingExport.format.toUpperCase();

    Promise.resolve()
      .then(() => {
        if (pendingExport.format === "svg") {
          downloadCanvasAsSvg(pendingExport);
          return;
        }

        return downloadCanvasAsPng(pendingExport);
      })
      .then(() => {
        if (!cancelled) {
          completeExport(`已导出 ${formatLabel} 文件。`, "success");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : `导出 ${formatLabel} 文件失败。`;
          completeExport(message, "error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [completeExport, pendingExport]);

  return null;
}
