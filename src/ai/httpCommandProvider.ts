import { validateDrawingCommands } from "./commandSchema";
import type { AiCommandContext, AiCommandProvider, AiCommandResult } from "./types";
import type { CanvasObject } from "../commands/types";

export type HttpAiCommandProviderOptions = {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  providerId?: string;
  timeoutMs?: number;
};

type AiServiceSuccessResponse = {
  kind?: unknown;
  commands?: unknown;
  message?: unknown;
  explanation?: unknown;
  confidence?: unknown;
  requiresConfirmation?: unknown;
};

type AiServiceFailureResponse = {
  ok?: false;
  reason?: unknown;
  suggestions?: unknown;
  retryable?: unknown;
};

const defaultProviderId = "http-ai-command-provider";
const defaultTimeoutMs = 12_000;

export class HttpAiCommandProvider implements AiCommandProvider {
  readonly id: string;

  private readonly endpoint?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HttpAiCommandProviderOptions = {}) {
    this.id = options.providerId ?? defaultProviderId;
    this.endpoint = options.endpoint?.trim();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  }

  async parseCommand(text: string, context: AiCommandContext): Promise<AiCommandResult> {
    const normalizedText = text.trim();

    if (!normalizedText) {
      return this.failure("没有收到可解析的文本。", ["请描述要生成或修改的图示"], true);
    }

    if (!this.endpoint) {
      return this.failure("未配置 AI 解析服务地址。", ["配置后端代理地址后再开启 AI 解析"], false);
    }

    try {
      const response = await this.fetchWithTimeout(normalizedText, context);

      if (!response.ok) {
        return this.failure(`AI 解析服务返回错误（HTTP ${response.status}）。`, ["稍后重试，或切回本地规则指令"], response.status >= 500);
      }

      const payload = await parseJsonResponse(response);

      if (isServiceFailure(payload)) {
        return this.failure(
          typeof payload.reason === "string" ? payload.reason : "AI 解析服务未能生成命令。",
          readSuggestions(payload.suggestions),
          typeof payload.retryable === "boolean" ? payload.retryable : true,
        );
      }

      return this.parseSuccessPayload(payload);
    } catch (error) {
      return this.failure(toNetworkErrorMessage(error), ["检查 AI 解析服务是否可用", "稍后重试"], true);
    }
  }

  private async fetchWithTimeout(text: string, context: AiCommandContext) {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchImpl(this.endpoint!, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          context: serializeContext(context),
        }),
        signal: controller.signal,
      });
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  }

  private parseSuccessPayload(payload: unknown): AiCommandResult {
    if (!isRecord(payload)) {
      return this.failure("AI 解析服务返回格式无效。", ["请检查服务返回的 JSON 结构"], false);
    }

    const response = payload as AiServiceSuccessResponse;

    if (response.kind === "insight") {
      if (typeof response.message !== "string" || !response.message.trim()) {
        return this.failure("AI 洞察反馈缺少 message 字段。", ["请调整 AI 服务输出为合法洞察结构"], false);
      }

      return {
        ok: true,
        kind: "insight",
        providerId: this.id,
        message: response.message.trim(),
        explanation: typeof response.explanation === "string" ? response.explanation : "AI 解析服务生成了画布洞察。",
        confidence: readConfidence(response.confidence),
      };
    }

    const validation = validateDrawingCommands(response.commands);

    if (!validation.ok) {
      return this.failure(
        `AI 命令未通过 schema 校验：${validation.errors[0].path || "root"} ${validation.errors[0].message}`,
        ["请调整 AI 服务输出为合法命令数组"],
        false,
      );
    }

    return {
      ok: true,
      kind: "commands",
      providerId: this.id,
      commands: validation.commands,
      explanation: typeof response.explanation === "string" ? response.explanation : "AI 解析服务生成了命令草案。",
      confidence: readConfidence(response.confidence),
      requiresConfirmation: typeof response.requiresConfirmation === "boolean" ? response.requiresConfirmation : true,
    };
  }

  private failure(reason: string, suggestions: string[], retryable: boolean): AiCommandResult {
    return {
      ok: false,
      providerId: this.id,
      reason,
      suggestions,
      retryable,
    };
  }
}

export function createHttpAiCommandProvider(options: HttpAiCommandProviderOptions = {}) {
  return new HttpAiCommandProvider(options);
}

function serializeContext(context: AiCommandContext) {
  return {
    activeObjectId: context.activeObjectId,
    lastCreatedObjectId: context.lastCreatedObjectId,
    locale: context.locale ?? "zh-CN",
    objects: context.objects.map(serializeCanvasObject),
  };
}

function serializeCanvasObject(object: CanvasObject) {
  return {
    id: object.id,
    type: object.type,
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    radius: object.radius,
    rotation: object.rotation,
    style: object.style,
    text: object.text,
    name: object.name,
  };
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("AI 解析服务返回的不是有效 JSON。");
  }
}

function isServiceFailure(payload: unknown): payload is AiServiceFailureResponse {
  return isRecord(payload) && payload.ok === false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readSuggestions(value: unknown) {
  if (!Array.isArray(value)) {
    return ["请换一种说法重试"];
  }

  return value.filter((item): item is string => typeof item === "string").slice(0, 3);
}

function readConfidence(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.6;
}

function toNetworkErrorMessage(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") {
    return "AI 解析服务请求超时。";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "AI 解析服务请求失败。";
}
