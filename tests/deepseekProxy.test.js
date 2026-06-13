import { afterEach, describe, expect, it } from "vitest";
import { buildDeepSeekRequestBody, createDeepSeekProxyServer, normalizeAiServicePayload, parseDeepSeekContent } from "../server/deepseekProxy.mjs";

let openServer;

afterEach(async () => {
  if (openServer) {
    await new Promise((resolve, reject) => openServer.close((error) => (error ? reject(error) : resolve())));
    openServer = undefined;
  }
});

describe("DeepSeek AI proxy", () => {
  it("builds a json-mode DeepSeek request body", () => {
    const body = buildDeepSeekRequestBody(
      "帮我生成一个用户登录流程图",
      {
        locale: "zh-CN",
        objects: [],
      },
      {
        model: "deepseek-test",
        temperature: 0.1,
      },
    );

    expect(body).toMatchObject({
      model: "deepseek-test",
      temperature: 0.1,
      response_format: {
        type: "json_object",
      },
      stream: false,
    });
    expect(body.messages[0].content).toContain("只能输出 JSON");
    expect(body.messages[1].content).toContain("帮我生成一个用户登录流程图");
  });

  it("parses command json from fenced model output", () => {
    const result = parseDeepSeekContent(`
      \`\`\`json
      {
        "commands": [
          {
            "type": "create",
            "shape": "text",
            "text": "输入账号"
          }
        ],
        "explanation": "生成登录流程。",
        "confidence": 0.82,
        "requiresConfirmation": true
      }
      \`\`\`
    `);

    expect(result).toEqual({
      commands: [
        {
          type: "create",
          shape: "text",
          text: "输入账号",
        },
      ],
      explanation: "生成登录流程。",
      confidence: 0.82,
      requiresConfirmation: true,
    });
  });

  it("normalizes insight and invalid model payloads", () => {
    expect(
      normalizeAiServicePayload({
        kind: "insight",
        message: "当前画布共有 3 个对象。",
        confidence: 0.9,
      }),
    ).toEqual({
      kind: "insight",
      message: "当前画布共有 3 个对象。",
      explanation: "DeepSeek 生成了画布洞察。",
      confidence: 0.9,
    });

    expect(
      normalizeAiServicePayload({
        commands: [
          {
            type: "eval",
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      retryable: true,
      reason: "模型返回了不支持的命令类型：eval",
    });
  });

  it("returns a configuration failure when api key is missing", async () => {
    const server = await listen(createDeepSeekProxyServer({ apiKey: "" }));
    const response = await fetch(server.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "生成一个流程图",
        context: {
          objects: [],
        },
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: false,
      retryable: false,
      reason: "未配置 DEEPSEEK_API_KEY。",
    });
  });

  it("proxies a request to DeepSeek and returns normalized insight json", async () => {
    const fetchCalls = [];
    const server = await listen(
      createDeepSeekProxyServer({
        apiKey: "test-key",
        model: "deepseek-test",
        fetchImpl: async (url, init) => {
          fetchCalls.push({
            url,
            headers: init.headers,
            body: JSON.parse(init.body),
          });

          return jsonResponse({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    kind: "insight",
                    message: "当前画布为空，可以先生成流程图。",
                    confidence: 0.74,
                  }),
                },
              },
            ],
          });
        },
      }),
    );

    const response = await fetch(server.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "现在画布里有什么",
        context: {
          objects: [],
        },
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe("https://api.deepseek.com/chat/completions");
    expect(fetchCalls[0].headers.Authorization).toBe("Bearer test-key");
    expect(fetchCalls[0].body).toMatchObject({
      model: "deepseek-test",
      response_format: {
        type: "json_object",
      },
    });
    expect(payload).toEqual({
      kind: "insight",
      message: "当前画布为空，可以先生成流程图。",
      explanation: "DeepSeek 生成了画布洞察。",
      confidence: 0.74,
    });
  });
});

async function listen(server) {
  openServer = server;

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();

  return {
    url: `http://127.0.0.1:${address.port}/api/ai/commands`,
  };
}

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
