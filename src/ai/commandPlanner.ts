import type { DrawingCommand } from "../commands/types";
import type { AiCommandContext, AiCommandFailure, AiCommandProvider, AiCommandSuccess, AiInsightSuccess } from "./types";

export type AiClarification = {
  id: string;
  originalText: string;
  question: string;
  reason: string;
  suggestions: string[];
  createdAt: number;
};

export type AiCommandPlanResult =
  | {
      status: "ready";
      providerId: string;
      commands: DrawingCommand[];
      commandCount: number;
      explanation: string;
      confidence: number;
      requiresConfirmation: boolean;
      resolvedText: string;
      clarifiedFrom?: AiClarification;
    }
  | {
      status: "needs-clarification";
      providerId: string;
      clarification: AiClarification;
    }
  | {
      status: "insight";
      providerId: string;
      message: string;
      explanation: string;
      confidence: number;
      resolvedText: string;
      clarifiedFrom?: AiClarification;
    }
  | {
      status: "failed";
      providerId: string;
      reason: string;
      suggestions: string[];
      retryable: boolean;
    };

export type AiCommandPlannerOptions = {
  createClarificationId?: () => string;
  now?: () => number;
};

const defaultClarificationId = () => `clarification-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export class AiCommandPlanner {
  private pendingClarification?: AiClarification;
  private readonly createClarificationId: () => string;
  private readonly now: () => number;

  constructor(
    private readonly provider: AiCommandProvider,
    options: AiCommandPlannerOptions = {},
  ) {
    this.createClarificationId = options.createClarificationId ?? defaultClarificationId;
    this.now = options.now ?? Date.now;
  }

  getPendingClarification() {
    return this.pendingClarification;
  }

  clearPendingClarification() {
    this.pendingClarification = undefined;
  }

  async plan(text: string, context: AiCommandContext): Promise<AiCommandPlanResult> {
    const normalizedText = text.trim();

    if (this.pendingClarification) {
      return this.resolvePendingClarification(normalizedText, context);
    }

    const result = await this.provider.parseCommand(normalizedText, context);

    if (result.ok) {
      if (result.kind === "insight") {
        return toInsightPlan(result, normalizedText);
      }

      return toReadyPlan(result, normalizedText);
    }

    return this.handleFailure(normalizedText, result);
  }

  private async resolvePendingClarification(answer: string, context: AiCommandContext): Promise<AiCommandPlanResult> {
    const clarification = this.pendingClarification;

    if (!clarification) {
      return this.plan(answer, context);
    }

    this.pendingClarification = undefined;

    if (!answer) {
      this.pendingClarification = clarification;

      return {
        status: "needs-clarification",
        providerId: this.provider.id,
        clarification,
      };
    }

    const resolvedText = buildClarifiedText(clarification.originalText, answer);
    const result = await this.provider.parseCommand(resolvedText, context);

    if (result.ok) {
      if (result.kind === "insight") {
        return toInsightPlan(result, resolvedText, clarification);
      }

      return toReadyPlan(result, resolvedText, clarification);
    }

    return this.handleFailure(clarification.originalText, result);
  }

  private handleFailure(originalText: string, failure: AiCommandFailure): AiCommandPlanResult {
    if (!shouldAskClarification(failure)) {
      return {
        status: "failed",
        providerId: failure.providerId,
        reason: failure.reason,
        suggestions: failure.suggestions,
        retryable: failure.retryable,
      };
    }

    const clarification: AiClarification = {
      id: this.createClarificationId(),
      originalText,
      question: buildQuestion(failure.reason),
      reason: failure.reason,
      suggestions: failure.suggestions,
      createdAt: this.now(),
    };

    this.pendingClarification = clarification;

    return {
      status: "needs-clarification",
      providerId: failure.providerId,
      clarification,
    };
  }
}

export function createAiCommandPlanner(provider: AiCommandProvider, options: AiCommandPlannerOptions = {}) {
  return new AiCommandPlanner(provider, options);
}

function toReadyPlan(result: AiCommandSuccess, resolvedText: string, clarifiedFrom?: AiClarification): AiCommandPlanResult {
  return {
    status: "ready",
    providerId: result.providerId,
    commands: result.commands,
    commandCount: result.commands.length,
    explanation: result.explanation,
    confidence: result.confidence,
    requiresConfirmation: result.requiresConfirmation,
    resolvedText,
    clarifiedFrom,
  };
}

function toInsightPlan(result: AiInsightSuccess, resolvedText: string, clarifiedFrom?: AiClarification): AiCommandPlanResult {
  return {
    status: "insight",
    providerId: result.providerId,
    message: result.message,
    explanation: result.explanation,
    confidence: result.confidence,
    resolvedText,
    clarifiedFrom,
  };
}

function shouldAskClarification(failure: AiCommandFailure) {
  if (!failure.retryable) {
    return false;
  }

  return /没有当前对象|请说明|缺少|无法确定|哪个|哪一个|目标对象/.test(failure.reason);
}

function buildQuestion(reason: string) {
  if (reason.includes("没有当前对象") || reason.includes("目标对象")) {
    return "你想操作哪个对象？";
  }

  return "请补充这条指令缺少的信息。";
}

function buildClarifiedText(originalText: string, answer: string) {
  const answerText = answer.trim().replace(/[，。！？、,.!?；;]/g, "");
  const replaceableTarget = /(当前图形|这个图形|那个图形|当前对象|这个对象|那个对象|当前|这个|那个|它)/;

  if (replaceableTarget.test(originalText)) {
    return originalText.replace(replaceableTarget, answerText);
  }

  return `${originalText}，补充信息：${answerText}`;
}
