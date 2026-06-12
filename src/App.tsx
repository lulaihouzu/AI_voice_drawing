import { CanvasView } from "./components/CanvasView";
import { FeedbackPanel } from "./components/FeedbackPanel";
import { VoicePanel } from "./components/VoicePanel";
import { useDrawingStore } from "./state/store";

export default function App() {
  const objects = useDrawingStore((state) => state.objects);
  const activeObjectId = useDrawingStore((state) => state.activeObjectId);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-kicker">AI Voice Drawing</p>
          <h1>AI 语音绘图工具</h1>
        </div>
        <div className="app-meta" aria-label="画布状态">
          <span>{objects.length} 个对象</span>
          <span>{activeObjectId ? "已选中" : "未选中"}</span>
        </div>
      </header>

      <section className="workspace" aria-label="语音绘图工作台">
        <CanvasView />
        <aside className="side-panel" aria-label="语音与反馈">
          <VoicePanel />
          <FeedbackPanel />
        </aside>
      </section>
    </main>
  );
}
