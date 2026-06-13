import http from "node:http";
import { pathToFileURL } from "node:url";

const defaultPort = 8787;
const defaultDeepSeekBaseUrl = "https://api.deepseek.com";
const defaultDeepSeekModel = "deepseek-chat";
const maxRequestBytes = 1024 * 1024;

const allowedCommandTypes = ["create", "update", "move", "delete", "rename", "layer", "undo", "redo", "clear", "export", "project"];
const allowedShapes = ["circle", "rect", "line", "arrow", "text"];
const allowedRegions = ["center", "left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"];

export function buildDeepSeekMessages(text, context) {
  return [
    {
      role: "system",
      content: buildSystemPrompt(),
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          text,
          context: sanitizeContext(context),
        },
        null,
        2,
      ),
    },
  ];
}

export function buildDeepSeekRequestBody(text, context, options = {}) {
  return {
    model: options.model ?? defaultDeepSeekModel,
    messages: buildDeepSeekMessages(text, context),
    temperature: options.temperature ?? 0.2,
    response_format: {
      type: "json_object",
    },
    stream: false,
  };
}

export function parseDeepSeekContent(content) {
  if (typeof content !== "string" || !content.trim()) {
    return {
      ok: false,
      reason: "DeepSeek 返回内容为空。",
      suggestions: ["请稍后重试"],
      retryable: true,
    };
  }

  try {
    return normalizeAiServicePayload(JSON.parse(stripJsonFence(content)));
  } catch {
    const extracted = extractJsonObject(content);

    if (!extracted) {
      return {
        ok: false,
        reason: "DeepSeek 返回的不是有效 JSON。",
        suggestions: ["请换一种说法重试", "或降低指令复杂度"],
        retryable: true,
      };
    }

    try {
      return normalizeAiServicePayload(JSON.parse(extracted));
    } catch {
      return {
        ok: false,
        reason: "DeepSeek 返回的 JSON 无法解析。",
        suggestions: ["请稍后重试"],
        retryable: true,
      };
    }
  }
}

export function normalizeAiServicePayload(payload) {
  if (!isRecord(payload)) {
    return {
      ok: false,
      reason: "模型输出必须是 JSON 对象。",
      suggestions: ["请调整模型提示词"],
      retryable: true,
    };
  }

  if (payload.ok === false) {
    return {
      ok: false,
      reason: readString(payload.reason, "模型暂时无法生成结果。"),
      suggestions: readStringArray(payload.suggestions, ["请换一种说法重试"]),
      retryable: typeof payload.retryable === "boolean" ? payload.retryable : true,
    };
  }

  if (payload.kind === "insight") {
    const message = readString(payload.message, "");

    if (!message) {
      return {
        ok: false,
        reason: "模型洞察结果缺少 message 字段。",
        suggestions: ["请重新生成"],
        retryable: true,
      };
    }

    return {
      kind: "insight",
      message,
      explanation: readString(payload.explanation, "DeepSeek 生成了画布洞察。"),
      confidence: readConfidence(payload.confidence),
    };
  }

  if (!Array.isArray(payload.commands)) {
    return {
      ok: false,
      reason: "模型没有返回 commands 数组。",
      suggestions: ["请尝试更明确地描述绘图需求"],
      retryable: true,
    };
  }

  if (payload.commands.length === 0 || payload.commands.length > 20) {
    return {
      ok: false,
      reason: "模型返回的命令数量必须在 1 到 20 条之间。",
      suggestions: ["请缩小绘图范围后重试"],
      retryable: true,
    };
  }

  const invalidCommand = payload.commands.find((command) => !isAllowedCommand(command));

  if (invalidCommand) {
    return {
      ok: false,
      reason: `模型返回了不支持的命令类型：${readString(invalidCommand.type, "未知")}`,
      suggestions: ["请换一种说法重试"],
      retryable: true,
    };
  }

  return {
    commands: payload.commands,
    explanation: readString(payload.explanation, "DeepSeek 生成了命令草案。"),
    confidence: readConfidence(payload.confidence),
    requiresConfirmation: typeof payload.requiresConfirmation === "boolean" ? payload.requiresConfirmation : true,
  };
}

export function createDeepSeekProxyServer(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return http.createServer(async (request, response) => {
    writeCorsHeaders(response, options.corsOrigin);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method !== "POST" || request.url !== "/api/ai/commands") {
      writeJson(response, 404, {
        ok: false,
        reason: "未找到 AI 代理接口。",
        suggestions: ["请 POST /api/ai/commands"],
        retryable: false,
      });
      return;
    }

    const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      writeJson(response, 200, {
        ok: false,
        reason: "未配置 DEEPSEEK_API_KEY。",
        suggestions: ["在启动代理服务前设置 DEEPSEEK_API_KEY"],
        retryable: false,
      });
      return;
    }

    try {
      const requestBody = await readJsonBody(request);
      const text = readString(requestBody.text, "");

      if (!text) {
        writeJson(response, 200, {
          ok: false,
          reason: "没有收到可解析的文本。",
          suggestions: ["请描述要生成或修改的图示"],
          retryable: true,
        });
        return;
      }

      const deepSeekResponse = await callDeepSeek(fetchImpl, apiKey, text, requestBody.context, options);

      if (!deepSeekResponse.ok) {
        writeJson(response, 502, {
          ok: false,
          reason: `DeepSeek 服务返回错误（HTTP ${deepSeekResponse.status}）。`,
          suggestions: ["请检查 API Key、模型名称和账户余额"],
          retryable: deepSeekResponse.status >= 500,
        });
        return;
      }

      const deepSeekPayload = await deepSeekResponse.json();
      const content = readDeepSeekContent(deepSeekPayload);

      writeJson(response, 200, parseDeepSeekContent(content));
    } catch (error) {
      writeJson(response, 200, {
        ok: false,
        reason: error instanceof Error ? error.message : "DeepSeek 代理请求失败。",
        suggestions: ["请检查代理服务日志后重试"],
        retryable: true,
      });
    }
  });
}

async function callDeepSeek(fetchImpl, apiKey, text, context, options) {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? defaultDeepSeekBaseUrl);
  const model = options.model ?? process.env.DEEPSEEK_MODEL ?? defaultDeepSeekModel;
  const temperature = readNumber(options.temperature ?? process.env.DEEPSEEK_TEMPERATURE, 0.2);

  return fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildDeepSeekRequestBody(text, context, { model, temperature })),
  });
}

function buildSystemPrompt() {
  return [
    "你是 AI 语音绘图工具的命令规划器，只能输出 JSON，不要输出 Markdown。",
    "你的任务是把中文语音文本转换为安全的绘图命令、画布洞察，或失败反馈。",
    "可执行命令必须放在 commands 数组中，前端会再次做 schema 校验，用户确认后才执行。",
    "如果用户询问画布内容、总结、状态、建议、优化，请返回 kind 为 insight 的对象，不要修改画布。",
    "如果无法可靠理解，请返回 ok:false、reason、suggestions、retryable。",
    "",
    "命令响应格式：",
    '{"commands":[{"type":"create","shape":"text","text":"开始","position":{"region":"left"}}],"explanation":"生成命令草案。","confidence":0.8,"requiresConfirmation":true}',
    "",
    "洞察响应格式：",
    '{"kind":"insight","message":"当前画布共有 3 个对象，建议补充箭头连接。","explanation":"生成画布建议。","confidence":0.8}',
    "",
    "失败响应格式：",
    '{"ok":false,"reason":"无法确定目标对象。","suggestions":["请说明要操作哪个图形"],"retryable":true}',
    "",
    `允许的命令类型：${allowedCommandTypes.join(", ")}。`,
    `允许创建的 shape：${allowedShapes.join(", ")}。`,
    `允许的位置 region：${allowedRegions.join(", ")}。`,
    "颜色必须使用 #RRGGBB 十六进制值。",
    "文本长度不要超过 80 个字符，命令数量不要超过 20 条。",
    "不要输出代码、脚本、HTML、CSS、URL 或任何 commands 以外的可执行内容。",
  ].join("\n");
}

function sanitizeContext(context) {
  if (!isRecord(context)) {
    return {
      objects: [],
      locale: "zh-CN",
    };
  }

  const objects = Array.isArray(context.objects) ? context.objects : [];

  return {
    activeObjectId: readString(context.activeObjectId, undefined),
    lastCreatedObjectId: readString(context.lastCreatedObjectId, undefined),
    locale: readString(context.locale, "zh-CN"),
    objects: objects.slice(0, 30).map((object) => {
      if (!isRecord(object)) {
        return {};
      }

      return {
        id: readString(object.id, undefined),
        type: readString(object.type, undefined),
        x: readNumber(object.x, undefined),
        y: readNumber(object.y, undefined),
        width: readNumber(object.width, undefined),
        height: readNumber(object.height, undefined),
        radius: readNumber(object.radius, undefined),
        text: readString(object.text, undefined),
        name: readString(object.name, undefined),
        style: isRecord(object.style) ? object.style : undefined,
      };
    }),
  };
}

function readDeepSeekContent(payload) {
  if (!isRecord(payload)) {
    return "";
  }

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return "";
  }

  return readString(firstChoice.message.content, "");
}

function isAllowedCommand(command) {
  return isRecord(command) && allowedCommandTypes.includes(command.type);
}

function stripJsonFence(content) {
  return content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractJsonObject(content) {
  const start = content.indexOf("{");

  if (start < 0) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return content.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > maxRequestBytes) {
        reject(new Error("请求体过大。"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("请求体不是有效 JSON。"));
      }
    });
    request.on("error", reject);
  });
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function writeCorsHeaders(response, corsOrigin = process.env.AI_PROXY_CORS_ORIGIN ?? "*") {
  response.setHeader("Access-Control-Allow-Origin", corsOrigin);
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl).replace(/\/+$/, "");
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function readString(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readStringArray(value, fallback) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const strings = value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());

  return strings.length > 0 ? strings.slice(0, 3) : fallback;
}

function readNumber(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }

  return fallback;
}

function readConfidence(value) {
  const confidence = readNumber(value, 0.6);

  return confidence >= 0 && confidence <= 1 ? confidence : 0.6;
}

function startServer() {
  const port = readNumber(process.env.AI_PROXY_PORT ?? process.env.PORT, defaultPort);
  const server = createDeepSeekProxyServer();

  server.listen(port, () => {
    console.log(`DeepSeek AI proxy is running at http://localhost:${port}/api/ai/commands`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
