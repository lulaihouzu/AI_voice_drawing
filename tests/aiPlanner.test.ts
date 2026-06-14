import { describe, expect, it } from "vitest";
import { createAiCommandPlanner, createMockAiCommandProvider } from "../src/ai";
import type { AiCommandProvider } from "../src/ai";

describe("AiCommandPlanner", () => {
  it("returns a ready plan for complex command arrays", async () => {
    const planner = createAiCommandPlanner(createMockAiCommandProvider());
    const result = await planner.plan("帮我生成一个用户登录流程图", {
      objects: [],
    });

    expect(result).toMatchObject({
      status: "ready",
      providerId: "local-diagram-template",
      commandCount: 8,
      requiresConfirmation: true,
      resolvedText: "帮我生成一个用户登录流程图",
    });

    if (result.status !== "ready") {
      throw new Error("Expected ready AI command plan.");
    }

    expect(result.commands.map((command) => command.type)).toEqual(["create", "create", "create", "create", "create", "create", "create", "create"]);
    expect(result.commands[0]).toMatchObject({
      type: "create",
      shape: "rect",
    });
    expect(result.commands[5]).toMatchObject({
      type: "create",
      shape: "text",
      text: "输入账号",
    });
  });

  it("uses the local template when the spoken text is only a flowchart title", async () => {
    const planner = createAiCommandPlanner(createMockAiCommandProvider());
    const result = await planner.plan("用户登录流程图", {
      objects: [],
    });

    expect(result).toMatchObject({
      status: "ready",
      providerId: "local-diagram-template",
      commandCount: 8,
      requiresConfirmation: true,
      resolvedText: "用户登录流程图",
    });

    if (result.status !== "ready") {
      throw new Error("Expected title-only flowchart prompt to use the local template.");
    }

    const createCommands = result.commands.filter((command) => command.type === "create");

    expect(createCommands.filter((command) => command.shape === "rect")).toHaveLength(3);
    expect(createCommands.filter((command) => command.shape === "text").map((command) => command.text)).toEqual([
      "输入账号",
      "校验身份",
      "进入系统",
    ]);
  });

  it("keeps a pending clarification when the target object is missing", async () => {
    const planner = createAiCommandPlanner(createMockAiCommandProvider(), {
      createClarificationId: () => "clarification-1",
      now: () => 1000,
    });
    const result = await planner.plan("帮我高亮这个图形", {
      objects: [],
    });

    expect(result).toEqual({
      status: "needs-clarification",
      providerId: "mock-ai-command-provider",
      clarification: {
        id: "clarification-1",
        originalText: "帮我高亮这个图形",
        question: "你想操作哪个对象？",
        reason: "没有当前对象，无法生成强调当前对象的命令。",
        suggestions: ["先说：画一个红色圆形", "再说：帮我强调当前图形"],
        createdAt: 1000,
      },
    });

    if (result.status !== "needs-clarification") {
      throw new Error("Expected planner to ask a clarification question.");
    }

    expect(planner.getPendingClarification()).toEqual(result.clarification);
  });

  it("returns an insight result without building a command plan", async () => {
    const planner = createAiCommandPlanner(createMockAiCommandProvider());
    const result = await planner.plan("现在画布里有什么", {
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
      ],
      activeObjectId: "object-1",
    });

    expect(result).toMatchObject({
      status: "insight",
      providerId: "mock-ai-command-provider",
      resolvedText: "现在画布里有什么",
    });

    if (result.status !== "insight") {
      throw new Error("Expected an AI insight result.");
    }

    expect(result.message).toContain("当前画布共有 1 个对象");
    expect(result.message).toContain("当前选中的是“开始”文本");
  });

  it("resolves a pending clarification with a spoken target answer", async () => {
    const planner = createAiCommandPlanner(createMockAiCommandProvider(), {
      createClarificationId: () => "clarification-1",
      now: () => 1000,
    });

    await planner.plan("帮我高亮这个图形", {
      objects: [],
    });

    const result = await planner.plan("左边的圆", {
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
      ],
    });

    expect(result).toMatchObject({
      status: "ready",
      commandCount: 2,
      resolvedText: "帮我高亮左边的圆",
      clarifiedFrom: {
        id: "clarification-1",
      },
    });

    if (result.status !== "ready") {
      throw new Error("Expected clarification to resolve to a ready plan.");
    }

    expect(result.commands).toEqual([
      {
        type: "update",
        target: {
          ref: "query",
          query: {
            shape: "circle",
            region: "left",
            sizeRank: undefined,
          },
        },
        patch: {
          fill: "#facc15",
          stroke: "#111827",
        },
      },
      {
        type: "layer",
        target: {
          ref: "query",
          query: {
            shape: "circle",
            region: "left",
            sizeRank: undefined,
          },
        },
        action: "front",
      },
    ]);
    expect(planner.getPendingClarification()).toBeUndefined();
  });

  it("does not turn network-style failures into clarification questions", async () => {
    const provider: AiCommandProvider = {
      id: "network-provider",
      parseCommand: async () => ({
        ok: false,
        providerId: "network-provider",
        reason: "AI 解析服务请求超时。",
        suggestions: ["稍后重试"],
        retryable: true,
      }),
    };
    const planner = createAiCommandPlanner(provider);
    const result = await planner.plan("生成一个流程图", {
      objects: [],
    });

    expect(result).toEqual({
      status: "failed",
      providerId: "network-provider",
      reason: "AI 解析服务请求超时。",
      suggestions: ["稍后重试"],
      retryable: true,
    });
    expect(planner.getPendingClarification()).toBeUndefined();
  });
});
