import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpAiCommandProvider } from "../src/ai";
import type { AiCommandResult } from "../src/ai";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("HttpAiCommandProvider", () => {
  it("posts text and context to the configured endpoint", async () => {
    let requestBody: unknown;
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));

      return jsonResponse({
        commands: [
          {
            type: "create",
            shape: "circle",
            style: {
              fill: "#ef4444",
            },
          },
        ],
        explanation: "服务生成了一个红色圆形。",
        confidence: 0.88,
        requiresConfirmation: false,
      });
    };
    const provider = createHttpAiCommandProvider({
      endpoint: "/api/ai/commands",
      fetchImpl,
      providerId: "test-http-provider",
    });
    const result = await provider.parseCommand("画一个红色圆形", {
      activeObjectId: "object-1",
      objects: [
        {
          id: "object-1",
          type: "rect",
          x: 120,
          y: 140,
          width: 80,
          height: 60,
          style: {
            fill: "#dbeafe",
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    expect(requestBody).toMatchObject({
      text: "画一个红色圆形",
      context: {
        activeObjectId: "object-1",
        locale: "zh-CN",
        objects: [
          {
            id: "object-1",
            type: "rect",
            x: 120,
            y: 140,
            style: {
              fill: "#dbeafe",
            },
          },
        ],
      },
    });
    expect(result).toMatchObject({
      ok: true,
      providerId: "test-http-provider",
      explanation: "服务生成了一个红色圆形。",
      confidence: 0.88,
      requiresConfirmation: false,
    });

    expectCommandSuccess(result);

    expect(result.commands).toEqual([
      {
        type: "create",
        shape: "circle",
        style: {
          fill: "#ef4444",
          stroke: undefined,
          strokeWidth: undefined,
          fontSize: undefined,
        },
        position: undefined,
        text: undefined,
        size: undefined,
        connection: undefined,
      },
    ]);
  });

  it("binds the default browser fetch implementation", async () => {
    let fetchThis: unknown;
    globalThis.fetch = vi.fn(async function (this: unknown, _input: RequestInfo | URL, init?: RequestInit) {
      fetchThis = this;
      expect(JSON.parse(String(init?.body))).toMatchObject({
        text: "生成一个流程图",
      });

      return jsonResponse({
        commands: [
          {
            type: "create",
            shape: "text",
            text: "开始",
          },
        ],
        explanation: "生成流程图。",
      });
    });

    const provider = createHttpAiCommandProvider({
      endpoint: "/api/ai/commands",
    });
    const result = await provider.parseCommand("生成一个流程图", {
      objects: [],
    });

    expect(fetchThis).toBe(globalThis);
    expect(result).toMatchObject({
      ok: true,
      kind: "commands",
      explanation: "生成流程图。",
    });
  });

  it("parses insight responses from the configured endpoint", async () => {
    const provider = createHttpAiCommandProvider({
      endpoint: "/api/ai/commands",
      fetchImpl: async () =>
        jsonResponse({
          kind: "insight",
          message: "当前画布共有 2 个对象，建议补充箭头连接。",
          explanation: "服务生成了画布优化建议。",
          confidence: 0.81,
        }),
      providerId: "test-http-provider",
    });
    const result = await provider.parseCommand("帮我优化这个流程图", {
      objects: [],
    });

    expect(result).toMatchObject({
      ok: true,
      kind: "insight",
      providerId: "test-http-provider",
      message: "当前画布共有 2 个对象，建议补充箭头连接。",
      explanation: "服务生成了画布优化建议。",
      confidence: 0.81,
    });
  });

  it("reports missing endpoint configuration", async () => {
    const provider = createHttpAiCommandProvider();
    const result = await provider.parseCommand("生成一个流程图", {
      objects: [],
    });

    expect(result).toMatchObject({
      ok: false,
      retryable: false,
      reason: "未配置 AI 解析服务地址。",
    });
  });

  it("turns service failures into provider failures", async () => {
    const provider = createHttpAiCommandProvider({
      endpoint: "/api/ai/commands",
      fetchImpl: async () =>
        jsonResponse({
          ok: false,
          reason: "模型暂时不可用。",
          suggestions: ["稍后再试"],
          retryable: true,
        }),
    });
    const result = await provider.parseCommand("生成一个流程图", {
      objects: [],
    });

    expect(result).toMatchObject({
      ok: false,
      retryable: true,
      reason: "模型暂时不可用。",
      suggestions: ["稍后再试"],
    });
  });

  it("rejects commands that fail schema validation", async () => {
    const provider = createHttpAiCommandProvider({
      endpoint: "/api/ai/commands",
      fetchImpl: async () =>
        jsonResponse({
          commands: [
            {
              type: "eval",
              script: "alert(1)",
            },
          ],
        }),
    });
    const result = await provider.parseCommand("生成一个流程图", {
      objects: [],
    });

    expect(result).toMatchObject({
      ok: false,
      retryable: false,
      reason: "AI 命令未通过 schema 校验：[0].type 不支持的命令类型“eval”。",
    });
  });

  it("handles http and invalid json errors", async () => {
    const httpProvider = createHttpAiCommandProvider({
      endpoint: "/api/ai/commands",
      fetchImpl: async () => new Response("server error", { status: 502 }),
    });
    const invalidJsonProvider = createHttpAiCommandProvider({
      endpoint: "/api/ai/commands",
      fetchImpl: async () => new Response("not json", { status: 200 }),
    });
    const httpResult = await httpProvider.parseCommand("生成一个流程图", {
      objects: [],
    });
    const invalidJsonResult = await invalidJsonProvider.parseCommand("生成一个流程图", {
      objects: [],
    });

    expect(httpResult).toMatchObject({
      ok: false,
      retryable: true,
      reason: "AI 解析服务返回错误（HTTP 502）。",
    });
    expect(invalidJsonResult).toMatchObject({
      ok: false,
      retryable: true,
      reason: "AI 解析服务返回的不是有效 JSON。",
    });
  });
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function expectCommandSuccess(result: AiCommandResult): asserts result is Extract<AiCommandResult, { ok: true; kind: "commands" }> {
  if (!result.ok) {
    throw new Error(result.reason);
  }

  if (result.kind !== "commands") {
    throw new Error("Expected a command result.");
  }
}
