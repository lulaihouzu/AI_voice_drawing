import { describe, expect, it } from "vitest";
import { createMockAiCommandProvider } from "../src/ai";
import type { AiCommandContext, AiCommandResult } from "../src/ai";

const emptyContext: AiCommandContext = {
  objects: [],
};

describe("MockAiCommandProvider", () => {
  it("creates a deterministic login flow command plan", async () => {
    const provider = createMockAiCommandProvider();
    const result = await provider.parseCommand("帮我生成一个用户登录流程图", emptyContext);

    expect(result).toMatchObject({
      ok: true,
      providerId: "mock-ai-command-provider",
      requiresConfirmation: true,
    });

    expectCommandSuccess(result);

    expect(result.commands).toHaveLength(8);
    expect(result.commands[0]).toMatchObject({
      type: "create",
      shape: "rect",
      position: {
        region: "left",
      },
    });
    expect(result.commands[2]).toMatchObject({
      type: "create",
      shape: "arrow",
      connection: {
        mode: "connect",
      },
    });
    expect(result.commands[4]).toMatchObject({
      type: "create",
      shape: "arrow",
    });
    expect(result.commands.slice(5).map((command) => (command.type === "create" ? command.text : undefined))).toEqual([
      "输入账号",
      "校验身份",
      "进入系统",
    ]);
  });

  it("creates a three step flow command plan", async () => {
    const provider = createMockAiCommandProvider();
    const result = await provider.parseCommand("生成一个三步流程图", emptyContext);

    expect(result.ok).toBe(true);

    expectCommandSuccess(result);

    expect(result.explanation).toContain("三步流程图");
    expect(result.commands).toHaveLength(8);
    expect(result.commands.map((command) => command.type)).toEqual(["create", "create", "create", "create", "create", "create", "create", "create"]);
    expect(result.commands[7]).toMatchObject({
      type: "create",
      text: "第三步",
    });
  });

  it("creates a topic-specific one sentence diagram", async () => {
    const provider = createMockAiCommandProvider();
    const result = await provider.parseCommand("帮我生成一个订单支付流程图", emptyContext);

    expect(result.ok).toBe(true);

    expectCommandSuccess(result);

    expect(result.explanation).toContain("订单支付流程图");
    expect(result.commands).toHaveLength(11);
    const nodeTexts = result.commands.flatMap((command) => {
      if (command.type === "create" && command.shape === "text") {
        return [command.text];
      }

      return [];
    });

    expect(nodeTexts).toEqual(["选择商品", "提交订单", "完成支付", "等待发货"]);
    expect(result.commands.filter((command) => command.type === "create" && command.shape === "rect")).toHaveLength(4);
    expect(result.commands.filter((command) => command.type === "create" && command.shape === "arrow")).toHaveLength(3);
  });

  it("creates highlight commands when an active object exists", async () => {
    const provider = createMockAiCommandProvider();
    const result = await provider.parseCommand("帮我强调当前图形", {
      objects: [],
      activeObjectId: "object-1",
    });

    expect(result.ok).toBe(true);

    expectCommandSuccess(result);

    expect(result.commands).toEqual([
      {
        type: "update",
        target: {
          ref: "active",
        },
        patch: {
          fill: "#facc15",
          stroke: "#111827",
        },
      },
      {
        type: "layer",
        target: {
          ref: "active",
        },
        action: "front",
      },
    ]);
  });

  it("rejects highlight commands without an active object", async () => {
    const provider = createMockAiCommandProvider();
    const result = await provider.parseCommand("帮我高亮这个图形", emptyContext);

    expect(result).toMatchObject({
      ok: false,
      retryable: true,
      reason: "没有当前对象，无法生成强调当前对象的命令。",
    });
  });

  it("summarizes the current canvas as an AI insight", async () => {
    const provider = createMockAiCommandProvider();
    const result = await provider.parseCommand("现在画布里有什么", {
      objects: [
        {
          id: "object-1",
          type: "text",
          text: "开始",
          x: 260,
          y: 310,
          style: {},
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "object-2",
          type: "arrow",
          x: 480,
          y: 310,
          style: {},
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      activeObjectId: "object-1",
    });

    expect(result.ok).toBe(true);
    expectInsightSuccess(result);
    expect(result.message).toContain("当前画布共有 2 个对象");
    expect(result.message).toContain("1 个文本");
    expect(result.message).toContain("当前选中的是“开始”文本");
  });

  it("returns canvas optimization advice as an AI insight", async () => {
    const provider = createMockAiCommandProvider();
    const result = await provider.parseCommand("帮我优化这个流程图", {
      objects: [
        {
          id: "object-1",
          type: "circle",
          x: 260,
          y: 310,
          radius: 48,
          style: {},
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "object-2",
          type: "rect",
          x: 280,
          y: 320,
          width: 120,
          height: 80,
          style: {},
          createdAt: 2,
          updatedAt: 2,
        },
      ],
    });

    expect(result.ok).toBe(true);
    expectInsightSuccess(result);
    expect(result.message).toContain("优化建议");
    expect(result.message).toContain("拉开重叠对象的距离");
    expect(result.message).toContain("增加箭头连接");
  });

  it("returns suggestions for unsupported mock requests", async () => {
    const provider = createMockAiCommandProvider();
    const result = await provider.parseCommand("帮我生成一个很复杂的商业架构图", emptyContext);

    expect(result).toMatchObject({
      ok: false,
      retryable: false,
      reason: "mock provider 暂未覆盖这类复杂指令。",
    });

    if (result.ok) {
      throw new Error("Expected unsupported request to fail.");
    }

    expect(result.suggestions).toContain("生成一个用户登录流程图");
    expect(result.suggestions).toContain("生成一个订单支付流程图");
    expect(result.suggestions).toContain("现在画布里有什么");
  });
});

function expectCommandSuccess(result: AiCommandResult): asserts result is Extract<AiCommandResult, { ok: true; kind: "commands" }> {
  if (!result.ok) {
    throw new Error(result.reason);
  }

  if (result.kind !== "commands") {
    throw new Error("Expected a command result.");
  }
}

function expectInsightSuccess(result: AiCommandResult): asserts result is Extract<AiCommandResult, { ok: true; kind: "insight" }> {
  if (!result.ok) {
    throw new Error(result.reason);
  }

  if (result.kind !== "insight") {
    throw new Error("Expected an insight result.");
  }
}
