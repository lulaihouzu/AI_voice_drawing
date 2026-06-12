type SpeechStatus = "idle" | "listening" | "error";

type SpeechResult = {
  text: string;
  confidence?: number;
  isFinal: boolean;
};

type SpeechInputOptions = {
  onResult: (result: SpeechResult) => void;
  onError: (message: string) => void;
  onStatusChange?: (status: SpeechStatus) => void;
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
      this.options.onStatusChange?.("error");
      return;
    }

    this.stop();
    this.recognition = new Recognition();
    this.recognition.lang = "zh-CN";
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    this.recognition.onresult = (event) => this.handleResult(event);
    this.recognition.onerror = (event) => {
      this.options.onError(event.message || `语音识别失败：${event.error ?? "unknown"}`);
      this.options.onStatusChange?.("error");
    };
    this.recognition.onend = () => {
      this.options.onStatusChange?.("idle");
    };

    this.options.onStatusChange?.("listening");
    this.recognition.start();
  }

  stop() {
    if (!this.recognition) {
      return;
    }

    this.recognition.stop();
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
