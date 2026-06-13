import { useEffect, useMemo, useRef } from "react";
import { Mic, MicOff, Volume2 } from "lucide-react";
import { SpeechInput } from "../speech/SpeechInput";
import { useDrawingStore } from "../state/store";

export function VoicePanel() {
  const runVoiceCommandText = useDrawingStore((state) => state.runVoiceCommandText);
  const addFeedback = useDrawingStore((state) => state.addFeedback);
  const setInterimTranscript = useDrawingStore((state) => state.setInterimTranscript);
  const setVoiceStatus = useDrawingStore((state) => state.setVoiceStatus);
  const setAiEnabled = useDrawingStore((state) => state.setAiEnabled);
  const voiceStatus = useDrawingStore((state) => state.voiceStatus);
  const aiEnabled = useDrawingStore((state) => state.aiEnabled);
  const aiStatus = useDrawingStore((state) => state.aiStatus);
  const speechInputRef = useRef<SpeechInput | null>(null);
  const isSupported = useMemo(() => SpeechInput.isSupported(), []);

  async function handleFinalTranscript(text: string) {
    const runResult = await runVoiceCommandText(text);
    speakFeedback(runResult.message);
  }

  function getSpeechInput() {
    if (!speechInputRef.current) {
      speechInputRef.current = new SpeechInput({
        onResult: (result) => {
          if (result.isFinal && result.text.trim()) {
            void handleFinalTranscript(result.text);
            return;
          }

          setInterimTranscript(result.text);
        },
        onError: (message) => {
          addFeedback(message, "error");
        },
        onStatusChange: (nextStatus) => {
          setVoiceStatus(nextStatus);
        },
      });
    }

    return speechInputRef.current;
  }

  function toggleListening() {
    if (!isSupported) {
      addFeedback("当前浏览器不支持语音识别。", "error");
      setVoiceStatus("unsupported");
      return;
    }

    const speechInput = getSpeechInput();

    if (voiceStatus === "listening") {
      speechInput.stop();
      return;
    }

    speechInput.start();
  }

  useEffect(() => {
    return () => {
      speechInputRef.current?.stop();
    };
  }, []);

  return (
    <section className="panel" aria-label="语音控制">
      <div className="panel-title">
        <Mic aria-hidden="true" size={18} />
        <h2>语音</h2>
      </div>

      <button
        aria-pressed={voiceStatus === "listening"}
        className="voice-button"
        type="button"
        onClick={toggleListening}
        disabled={!isSupported}
      >
        {voiceStatus === "listening" ? <MicOff aria-hidden="true" size={28} /> : <Mic aria-hidden="true" size={28} />}
        <span>{voiceStatus === "listening" ? "停止监听" : "开始监听"}</span>
      </button>

      <div className="voice-state">
        <span className={`voice-pill status-${voiceStatus}`}>{getVoiceStatusLabel(voiceStatus)}</span>
        <span className={`voice-pill ai-status-${aiStatus}`}>{getAiStatusLabel(aiStatus)}</span>
        <span className="voice-audio">
          <Volume2 aria-hidden="true" size={16} />
          反馈播报
        </span>
      </div>

      <label className="ai-toggle">
        <input type="checkbox" checked={aiEnabled} onChange={(event) => setAiEnabled(event.currentTarget.checked)} />
        <span>AI 解析</span>
      </label>
    </section>
  );
}

function speakFeedback(message: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "zh-CN";
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

function getVoiceStatusLabel(status: ReturnType<typeof useDrawingStore.getState>["voiceStatus"]) {
  if (status === "listening") {
    return "正在监听";
  }

  if (status === "error") {
    return "识别异常";
  }

  if (status === "unsupported") {
    return "不支持语音";
  }

  return "待机";
}

function getAiStatusLabel(status: ReturnType<typeof useDrawingStore.getState>["aiStatus"]) {
  if (status === "planning") {
    return "AI 解析中";
  }

  if (status === "waiting-clarification") {
    return "AI 待补充";
  }

  if (status === "waiting-confirmation") {
    return "AI 待确认";
  }

  if (status === "error") {
    return "AI 异常";
  }

  if (status === "off") {
    return "AI 关闭";
  }

  return "AI 就绪";
}
