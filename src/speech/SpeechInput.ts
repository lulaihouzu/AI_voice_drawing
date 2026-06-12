export type SpeechStatus = "idle" | "listening" | "error" | "unsupported";

export type SpeechResult = {
  text: string;
  confidence?: number;
  isFinal: boolean;
};

type SpeechInputOptions = {
  onResult: (result: SpeechResult) => void;
  onError: (message: string) => void;
  onStatusChange?: (status: SpeechStatus) => void;
  continuous?: boolean;
  lang?: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error?: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: {
        transcript: string;
        confidence?: number;
      };
    };
  };
};

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

export class SpeechInput {
  private recognition: BrowserSpeechRecognition | null = null;
  private readonly options: SpeechInputOptions;
  private endedWithError = false;

  constructor(options: SpeechInputOptions) {
    this.options = options;
  }

  static isSupported() {
    return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  start() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!Recognition) {
      this.options.onError("当前浏览器不支持语音识别。");
      this.options.onStatusChange?.("unsupported");
      return;
    }

    this.stop();
    this.endedWithError = false;
    this.recognition = new Recognition();
    this.recognition.lang = this.options.lang ?? "zh-CN";
    this.recognition.continuous = this.options.continuous ?? true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    this.recognition.onresult = (event) => this.handleResult(event);
    this.recognition.onerror = (event) => {
      this.endedWithError = true;
      this.options.onError(getSpeechErrorMessage(event.error, event.message));
      this.options.onStatusChange?.("error");
    };
    this.recognition.onend = () => {
      this.recognition = null;
      this.options.onStatusChange?.(this.endedWithError ? "error" : "idle");
    };

    this.options.onStatusChange?.("listening");

    try {
      this.recognition.start();
    } catch {
      this.options.onError("语音识别启动失败，请稍后重试。");
      this.options.onStatusChange?.("error");
      this.recognition = null;
    }
  }

  stop() {
    if (!this.recognition) {
      return;
    }

    const recognition = this.recognition;
    recognition.onend = null;
    recognition.stop();
    this.recognition = null;
    this.options.onStatusChange?.("idle");
  }

  private handleResult(event: BrowserSpeechRecognitionEvent) {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const alternative = result[0];

      this.options.onResult({
        text: alternative.transcript,
        confidence: alternative.confidence,
        isFinal: result.isFinal,
      });
    }
  }
}

function getSpeechErrorMessage(error?: string, message?: string) {
  if (message) {
    return message;
  }

  if (error === "not-allowed" || error === "service-not-allowed") {
    return "麦克风权限未开启，无法使用语音输入。";
  }

  if (error === "no-speech") {
    return "没有识别到语音，请再说一次。";
  }

  if (error === "audio-capture") {
    return "没有检测到可用麦克风。";
  }

  if (error === "network") {
    return "语音识别网络异常，请稍后重试。";
  }

  return `语音识别失败：${error ?? "unknown"}`;
}
