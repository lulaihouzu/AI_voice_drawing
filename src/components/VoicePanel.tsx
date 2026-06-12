import { useMemo, useRef, useState } from "react";
import { Download, Mic, MicOff, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { SpeechInput } from "../speech/SpeechInput";
import { useDrawingStore } from "../state/store";

type VoiceStatus = "idle" | "listening";

export function VoicePanel() {
  const runCommandText = useDrawingStore((state) => state.runCommandText);
  const addFeedback = useDrawingStore((state) => state.addFeedback);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const speechInputRef = useRef<SpeechInput | null>(null);
  const isSupported = useMemo(() => SpeechInput.isSupported(), []);

  function getSpeechInput() {
    if (!speechInputRef.current) {
      speechInputRef.current = new SpeechInput({
        onResult: (result) => {
          if (result.isFinal && result.text.trim()) {
            runCommandText(result.text);
          }
        },
        onError: (message) => {
          addFeedback(message, "error");
        },
        onStatusChange: (nextStatus) => {
          setStatus(nextStatus === "listening" ? "listening" : "idle");
        },
      });
    }

    return speechInputRef.current;
  }

  function toggleListening() {
    if (!isSupported) {
      addFeedback("当前浏览器不支持语音识别。", "error");
      return;
    }

    const speechInput = getSpeechInput();

    if (status === "listening") {
      speechInput.stop();
      return;
    }

    speechInput.start();
  }

  return (
    <section className="panel" aria-label="语音控制">
      <div className="panel-title">
        <Mic aria-hidden="true" size={18} />
        <h2>语音</h2>
      </div>

      <button className="voice-button" type="button" onClick={toggleListening} disabled={!isSupported}>
        {status === "listening" ? <MicOff aria-hidden="true" size={28} /> : <Mic aria-hidden="true" size={28} />}
        <span>{status === "listening" ? "停止" : "开始"}</span>
      </button>

      <div className="quick-actions" aria-label="全局操作">
        <button type="button" onClick={() => runCommandText("撤销")} title="撤销">
          <RotateCcw aria-hidden="true" size={18} />
        </button>
        <button type="button" onClick={() => runCommandText("重做")} title="重做">
          <RotateCw aria-hidden="true" size={18} />
        </button>
        <button type="button" onClick={() => runCommandText("清空画布")} title="清空画布">
          <Trash2 aria-hidden="true" size={18} />
        </button>
        <button type="button" onClick={() => runCommandText("导出为图片")} title="导出图片">
          <Download aria-hidden="true" size={18} />
        </button>
      </div>
    </section>
  );
}
