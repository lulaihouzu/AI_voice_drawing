import type { AiCommandContext, AiCommandProvider, AiCommandResult, AiCommandSuccess, AiInsightSuccess } from "./types";
import { createCanvasOptimizationAdvice, createCanvasSummary } from "./canvasInsights";
import { normalizeObjectName } from "../commands/objectNames";
import type { DrawingCommand, PositionRegion, ShapeType, TargetQuery, TargetSpec } from "../commands/types";

const mockProviderId = "mock-ai-command-provider";
const flowRegions: PositionRegion[] = ["top-left", "top-right", "bottom-right", "bottom-left"];
const flowColors = ["#dbeafe", "#dcfce7", "#fef3c7", "#fee2e2"];

type DiagramTemplate = {
  title: string;
  keywords: string[];
  steps: string[];
  confidence: number;
};

const diagramTemplates: DiagramTemplate[] = [
  {
    title: "用户登录流程图",
    keywords: ["登录", "登陆"],
    steps: ["输入账号", "校验身份", "进入系统"],
    confidence: 0.84,
  },
  {
    title: "用户注册流程图",
    keywords: ["注册", "开户"],
    steps: ["填写信息", "验证手机号", "创建账号", "完成注册"],
    confidence: 0.82,
  },
  {
    title: "订单支付流程图",
    keywords: ["订单", "下单", "购物", "支付"],
    steps: ["选择商品", "提交订单", "完成支付", "等待发货"],
    confidence: 0.82,
  },
  {
    title: "客服工单流程图",
    keywords: ["客服", "工单", "售后"],
    steps: ["提交问题", "分配客服", "处理反馈", "关闭工单"],
    confidence: 0.8,
  },
  {
    title: "审批流程图",
    keywords: ["审批", "请假", "报销"],
    steps: ["提交申请", "主管审批", "结果通知", "完成归档"],
    confidence: 0.8,
  },
  {
    title: "项目发布流程图",
    keywords: ["发布", "上线", "部署", "项目"],
    steps: ["需求确认", "开发实现", "测试验收", "上线发布"],
    confidence: 0.78,
  },
];

export class MockAiCommandProvider implements AiCommandProvider {
  readonly id = mockProviderId;

  async parseCommand(text: string, context: AiCommandContext): Promise<AiCommandResult> {
    const normalizedText = normalizeInput(text);

    if (!normalizedText) {
      return failure("没有收到可解析的文本。", ["请描述要生成的图示", "例如：生成一个用户登录流程图"], true);
    }

    if (isCanvasSummaryRequest(normalizedText)) {
      const message = createCanvasSummary(context);

      return insight({
        message,
        explanation: "mock provider 根据当前画布对象生成了内容总结。",
        confidence: 0.76,
      });
    }

    if (isCanvasOptimizationRequest(normalizedText)) {
      const message = createCanvasOptimizationAdvice(context);

      return insight({
        message,
        explanation: "mock provider 根据当前画布对象生成了优化建议。",
        confidence: 0.74,
      });
    }

    const diagramPlan = createDiagramPlan(normalizedText);

    if (diagramPlan) {
      return success({
        commands: diagramPlan.commands,
        explanation: `mock provider 生成了${diagramPlan.title}草案。`,
        confidence: diagramPlan.confidence,
      });
    }

    if (isHighlightRequest(normalizedText)) {
      const target = resolveHighlightTarget(normalizedText, context);

      if (!target) {
        return failure("没有当前对象，无法生成强调当前对象的命令。", ["先说：画一个红色圆形", "再说：帮我强调当前图形"], true);
      }

      return success({
        commands: [
          {
            type: "update",
            target,
            patch: {
              fill: "#facc15",
              stroke: "#111827",
            },
          },
          {
            type: "layer",
            target,
            action: "front",
          },
        ],
        explanation: "mock provider 生成了强调当前对象的命令草案。",
        confidence: 0.74,
      });
    }

    return failure(
      "mock provider 暂未覆盖这类复杂指令。",
      ["生成一个用户登录流程图", "生成一个订单支付流程图", "现在画布里有什么", "帮我优化这个流程图"],
      false,
    );
  }
}

export function createMockAiCommandProvider() {
  return new MockAiCommandProvider();
}

function success(result: Omit<AiCommandSuccess, "ok" | "providerId" | "kind" | "requiresConfirmation">): AiCommandResult {
  return {
    ok: true,
    kind: "commands",
    providerId: mockProviderId,
    requiresConfirmation: true,
    ...result,
  };
}

function insight(result: Omit<AiInsightSuccess, "ok" | "providerId" | "kind">): AiCommandResult {
  return {
    ok: true,
    kind: "insight",
    providerId: mockProviderId,
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

function createDiagramPlan(text: string): { title: string; commands: DrawingCommand[]; confidence: number } | undefined {
  if (!isDiagramGenerationRequest(text)) {
    return undefined;
  }

  if (isThreeStepFlowRequest(text)) {
    return {
      title: "三步流程图",
      commands: createSequentialDiagramCommands(["第一步", "第二步", "第三步"], ["left", "center", "right"], ["#e0f2fe", "#f3e8ff", "#fee2e2"]),
      confidence: 0.78,
    };
  }

  const template = diagramTemplates.find((item) => item.keywords.some((keyword) => text.includes(keyword)));

  if (!template) {
    return undefined;
  }

  return {
    title: template.title,
    commands: createSequentialDiagramCommands(template.steps, pickRegions(template.steps.length), flowColors),
    confidence: template.confidence,
  };
}

function createSequentialDiagramCommands(steps: string[], regions: PositionRegion[], colors: string[]): DrawingCommand[] {
  return steps.flatMap((step, index) => {
    const commands = [createStepNode(step, regions[index] ?? "center", colors[index % colors.length])];

    return index === 0 ? commands : [commands[0], createArrow()];
  });
}

function createStepNode(text: string, region: PositionRegion, fill: string): DrawingCommand {
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

function pickRegions(stepCount: number): PositionRegion[] {
  if (stepCount <= 3) {
    return ["left", "center", "right"];
  }

  return flowRegions;
}

function isDiagramGenerationRequest(text: string) {
  return (
    (text.includes("生成") || text.includes("创建") || text.includes("画") || text.includes("做")) &&
    (text.includes("流程图") || text.includes("图示") || text.includes("流程"))
  );
}

function isThreeStepFlowRequest(text: string) {
  return (text.includes("三步") || text.includes("3步")) && (text.includes("流程") || text.includes("流程图"));
}

function isCanvasSummaryRequest(text: string) {
  return (
    (text.includes("画布") || text.includes("图上") || text.includes("当前")) &&
    (text.includes("有什么") || text.includes("内容") || text.includes("总结") || text.includes("概览") || text.includes("状态"))
  );
}

function isCanvasOptimizationRequest(text: string) {
  return (
    (text.includes("优化") || text.includes("建议") || text.includes("改进") || text.includes("检查")) &&
    (text.includes("画布") || text.includes("流程图") || text.includes("图示") || text.includes("布局"))
  );
}

function isHighlightRequest(text: string) {
  return text.includes("强调") || text.includes("高亮") || text.includes("突出");
}

function resolveHighlightTarget(text: string, context: AiCommandContext): TargetSpec | undefined {
  const phrase = extractHighlightTargetPhrase(text);

  if (!phrase || isGenericTargetPhrase(phrase)) {
    return context.activeObjectId ? { ref: "active" } : undefined;
  }

  const query = extractTargetQuery(phrase);

  if (query) {
    return { ref: "query", query };
  }

  const name = normalizeObjectName(phrase);

  return name ? { ref: "name", name } : undefined;
}

function extractHighlightTargetPhrase(text: string) {
  const match = text.match(/(?:强调|高亮|突出)(.+)$/);

  return match?.[1]?.replace(/^(一下子|一下|这个|那个|当前)/, "").trim();
}

function isGenericTargetPhrase(phrase: string) {
  return /^(它|这个|那个|当前)?(图形|对象|形状|元素)?$/.test(phrase);
}

function extractTargetQuery(phrase: string): TargetQuery | undefined {
  const shape = findTargetShape(phrase);
  const region = findTargetRegion(phrase);
  const sizeRank = findTargetSizeRank(phrase);

  if (!shape && !region && !sizeRank) {
    return undefined;
  }

  return {
    shape,
    region,
    sizeRank,
  };
}

function findTargetShape(phrase: string): ShapeType | undefined {
  if (phrase.includes("圆")) return "circle";
  if (phrase.includes("矩形") || phrase.includes("方框") || phrase.includes("方形")) return "rect";
  if (phrase.includes("箭头")) return "arrow";
  if (phrase.includes("文字") || phrase.includes("文本")) return "text";
  if (phrase.includes("线")) return "line";
  return undefined;
}

function findTargetRegion(phrase: string): PositionRegion | undefined {
  if (phrase.includes("左上")) return "top-left";
  if (phrase.includes("右上")) return "top-right";
  if (phrase.includes("左下")) return "bottom-left";
  if (phrase.includes("右下")) return "bottom-right";
  if (phrase.includes("左边") || phrase.includes("左侧")) return "left";
  if (phrase.includes("右边") || phrase.includes("右侧")) return "right";
  if (phrase.includes("上方") || phrase.includes("上面")) return "top";
  if (phrase.includes("下方") || phrase.includes("下面")) return "bottom";
  if (phrase.includes("中间") || phrase.includes("中央")) return "center";
  return undefined;
}

function findTargetSizeRank(phrase: string): TargetQuery["sizeRank"] | undefined {
  if (phrase.includes("最大")) return "largest";
  if (phrase.includes("最小")) return "smallest";
  return undefined;
}

function normalizeInput(text: string) {
  return text
    .trim()
    .replace(/\s+/g, "")
    .replace(/[，。！？、,.!?；;]/g, "")
    .toLowerCase();
}
