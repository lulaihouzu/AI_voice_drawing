import type { DrawingCommand, PositionRegion } from "../commands/types";

const flowRegions: PositionRegion[] = ["top-left", "top-right", "bottom-right", "bottom-left"];
const flowColors = ["#dbeafe", "#dcfce7", "#fef3c7", "#fee2e2"];

type DiagramTemplate = {
  title: string;
  keywords: string[];
  steps: string[];
  confidence: number;
};

export type DiagramTemplatePlan = {
  title: string;
  commands: DrawingCommand[];
  confidence: number;
};

const diagramTemplates: DiagramTemplate[] = [
  {
    title: "用户登录流程图",
    keywords: ["登录", "登陆"],
    steps: ["输入账号", "校验身份", "进入系统"],
    confidence: 0.86,
  },
  {
    title: "用户注册流程图",
    keywords: ["注册", "开户"],
    steps: ["填写信息", "验证手机号", "创建账号", "完成注册"],
    confidence: 0.84,
  },
  {
    title: "订单支付流程图",
    keywords: ["订单", "下单", "购物", "支付"],
    steps: ["选择商品", "提交订单", "完成支付", "等待发货"],
    confidence: 0.84,
  },
  {
    title: "客服工单流程图",
    keywords: ["客服", "工单", "售后"],
    steps: ["提交问题", "分配客服", "处理反馈", "关闭工单"],
    confidence: 0.82,
  },
  {
    title: "审批流程图",
    keywords: ["审批", "请假", "报销"],
    steps: ["提交申请", "主管审批", "结果通知", "完成归档"],
    confidence: 0.82,
  },
  {
    title: "项目发布流程图",
    keywords: ["发布", "上线", "部署", "项目"],
    steps: ["需求确认", "开发实现", "测试验收", "上线发布"],
    confidence: 0.8,
  },
];

export function createDiagramTemplatePlan(text: string): DiagramTemplatePlan | undefined {
  const normalizedText = normalizeInput(text);

  if (!isDiagramGenerationRequest(normalizedText)) {
    return undefined;
  }

  if (isThreeStepFlowRequest(normalizedText)) {
    return {
      title: "三步流程图",
      commands: createFlowDiagramCommands(["第一步", "第二步", "第三步"], ["left", "center", "right"], flowColors),
      confidence: 0.8,
    };
  }

  const template = diagramTemplates.find((item) => item.keywords.some((keyword) => normalizedText.includes(keyword)));

  if (!template) {
    return undefined;
  }

  return {
    title: template.title,
    commands: createFlowDiagramCommands(template.steps, pickRegions(template.steps.length), flowColors),
    confidence: template.confidence,
  };
}

function createFlowDiagramCommands(steps: string[], regions: PositionRegion[], colors: string[]): DrawingCommand[] {
  const nodeCommands = steps.flatMap((step, index) => {
    const region = regions[index] ?? "center";

    return [
      createStepBox(region, colors[index % colors.length]),
      ...(index === 0 ? [] : [createArrow()]),
    ];
  });
  const labelCommands = steps.map((step, index) => createStepLabel(step, regions[index] ?? "center"));

  return [...nodeCommands, ...labelCommands];
}

function createStepBox(region: PositionRegion, fill: string): DrawingCommand {
  return {
    type: "create",
    shape: "rect",
    size: "normal",
    position: {
      region,
    },
    style: {
      fill,
      stroke: "#1f2937",
      strokeWidth: 2,
    },
  };
}

function createStepLabel(text: string, region: PositionRegion): DrawingCommand {
  return {
    type: "create",
    shape: "text",
    text,
    size: "small",
    position: {
      region,
    },
    style: {
      stroke: "#111827",
      fontSize: 22,
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
  return text.includes("三步") || text.includes("3步") || text.includes("三个步骤");
}

function normalizeInput(text: string) {
  return text.trim().replace(/\s+/g, "");
}
