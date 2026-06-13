import { describe, expect, it } from "vitest";
import { createMockAiCommandProvider } from "../src/ai";
import type { AiCommandContext } from "../src/ai";

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

    if (!result.ok) {
      throw new Error(result.reason);
    }

    expect(result.commands).toHaveLength(4);
    expect(result.commands[0]).toMatchObject({
      type: "create",
      shape: "text",
      text: "输入账号",
      position: {
        region: "left",
      },
    });
    expect(result.commands[3]).toMatchObject({
      type: "create",
      shape: "arrow",
      connection: {
        mode: "connect",
      },
    });
  });

  it("creates a three step flow command plan", async () => {
    const provider = createMockAiCommandProvider();
    const result = await provider.parseCommand("生成一个三步流程图", emptyContext);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.reason);
    }

    expect(result.explanation).toContain("三步流程图");
    expect(result.commands.map((command) => command.type)).toEqual(["create", "create", "create", "create"]);
    expect(result.commands[2]).toMatchObject({
      type: "create",
      text: "第三步",
    });
  });

  it("creates highlight commands when an active object exists", async () => {
    const provider = createMockAiCommandProvider();
    const result = await provider.parseCommand("帮我强调当前图形", {
      objects: [],
      activeObjectId: "object-1",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.reason);
    }

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
  });
});
