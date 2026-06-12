import { Activity, Info } from "lucide-react";
import { useDrawingStore } from "../state/store";

export function FeedbackPanel() {
  const feedback = useDrawingStore((state) => state.feedback);
  const lastTranscript = useDrawingStore((state) => state.lastTranscript);

  return (
    <section className="panel" aria-label="执行反馈">
      <div className="panel-title">
        <Activity aria-hidden="true" size={18} />
        <h2>反馈</h2>
      </div>

      <div className="transcript-box">
        <span>识别文本</span>
        <strong>{lastTranscript || "暂无"}</strong>
      </div>

      <div className="feedback-list" aria-live="polite">
        {feedback.map((item) => (
          <article className={`feedback-item level-${item.level}`} key={item.id}>
            <Info aria-hidden="true" size={16} />
            <p>{item.message}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
