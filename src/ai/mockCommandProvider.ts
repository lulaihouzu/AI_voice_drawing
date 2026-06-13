import type { AiCommandContext, AiCommandProvider, AiCommandResult } from "./types";
import type { DrawingCommand } from "../commands/types";

const mockProviderId = "mock-ai-command-provider";

export class MockAiCommandProvider implements AiCommandProvider {
  readonly id = mockProviderId;

  async parseCommand(text: string, context: AiCommandContext): Promise<AiCommandResult> {
    const normalizedText = normalizeInput(text);

    if (!normalizedText) {
      return failure("没有收到可解析的文本。", ["请描述要生成的图示", "例如：生成一个用户登录流程图"], true);
    }

    if (isLoginFlowRequest(normalizedText)) {
      return success({
        commands: createLoginFlowCommands(),
        explanation: "mock provider 生成了用户登录流程图草案。",
        confidence: 0.82,
      });
    }

    if (isThreeStepFlowRequest(normalizedText)) {
      return success({
        commands: createThreeStepFlowCommands(),
        explanation: "mock provider 生成了三步流程图草案。",
        confidence: 0.78,
      });
    }

    if (isHighlightRequest(normalizedText)) {
      if (!context.activeObjectId) {
        return failure("没有当前对象，无法生成强调当前对象的命令。", ["先说：画一个红色圆形", "再说：帮我强调当前图形"], true);
      }

      return success({
        commands: [
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
        ],
        explanation: "mock provider 生成了强调当前对象的命令草案。",
        confidence: 0.74,
      });
    }

    return failure("mock provider 暂未覆盖这类复杂指令。", ["生成一个用户登录流程图", "生成一个三步流程图", "帮我强调当前图形"], false);
  }
}

export function createMockAiCommandProvider() {
  return new MockAiCommandProvider();
}

function success(result: Omit<Extract<AiCommandResult, { ok: true }>, "ok" | "providerId" | "requiresConfirmation">): AiCommandResult {
  return {
    ok: true,
    providerId: mockProviderId,
    requiresConfirmation: true,
    ...result,
  };
}

function failure(reason: string, suggestions: string[], retryable: boolean): AiCommandResult {
  return {
    ok: false,
    providerId: mockProviderId,
    reason,
    suggestions,
    retryable,
  };
}

function createLoginFlowCommands(): DrawingCommand[] {
  return [
    createStepNode("输入账号", "left", "#dbeafe"),
    createStepNode("校验身份", "center", "#dcfce7"),
    createStepNode("进入系统", "right", "#fef3c7"),
    createArrow(),
  ];
}

function createThreeStepFlowCommands(): DrawingCommand[] {
  return [
    createStepNode("第一步", "left", "#e0f2fe"),
    createStepNode("第二步", "center", "#f3e8ff"),
    createStepNode("第三步", "right", "#fee2e2"),
    createArrow(),
  ];
}

function createStepNode(text: string, region: "left" | "center" | "right", fill: string): DrawingCommand {
  return {
    type: "create",
    shape: "text",
    text,
    position: {
      region,
    },
    style: {
      fill,
      stroke: "#1f2937",
      fontSize: 28,
    },
  };
}

function createArrow(): DrawingCommand {
  return {
    type: "create",
    shape: "arrow",
    connection: {
      mode: "connect",
    },
  };
}

function isLoginFlowRequest(text: string) {
  return (text.includes("登录") || text.includes("登陆")) && (text.includes("流程") || text.includes("图示") || text.includes("流程图"));
}

function isThreeStepFlowRequest(text: string) {
  return (text.includes("三步") || text.includes("3步")) && (text.includes("流程") || text.includes("流程图"));
}

function isHighlightRequest(text: string) {
  return (text.includes("强调") || text.includes("高亮") || text.includes("突出")) && (text.includes("当前") || text.includes("这个") || text.includes("它"));
}

function normalizeInput(text: string) {
  return text
    .trim()
    .replace(/\s+/g, "")
    .replace(/[，。！？、,.!?；;]/g, "")
    .toLowerCase();
}
