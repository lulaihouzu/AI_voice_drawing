import type { CanvasObject, DrawingCommand } from "../commands/types";

export type AiCommandContext = {
  objects: CanvasObject[];
  activeObjectId?: string;
  lastCreatedObjectId?: string;
  locale?: "zh-CN";
};

export type AiCommandSuccess = {
  ok: true;
  kind: "commands";
  providerId: string;
  commands: DrawingCommand[];
  explanation: string;
  confidence: number;
  requiresConfirmation: boolean;
};

export type AiInsightSuccess = {
  ok: true;
  kind: "insight";
  providerId: string;
  message: string;
  explanation: string;
  confidence: number;
};

export type AiCommandFailure = {
  ok: false;
  providerId: string;
  reason: string;
  suggestions: string[];
  retryable: boolean;
};

export type AiCommandResult = AiCommandSuccess | AiInsightSuccess | AiCommandFailure;

export interface AiCommandProvider {
  readonly id: string;
  parseCommand(text: string, context: AiCommandContext): Promise<AiCommandResult>;
}
