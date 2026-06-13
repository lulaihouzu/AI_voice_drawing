import type { CanvasObject, DrawingCommand } from "../commands/types";

export type AiCommandContext = {
  objects: CanvasObject[];
  activeObjectId?: string;
  lastCreatedObjectId?: string;
  locale?: "zh-CN";
};

export type AiCommandSuccess = {
  ok: true;
  providerId: string;
  commands: DrawingCommand[];
  explanation: string;
  confidence: number;
  requiresConfirmation: boolean;
};

export type AiCommandFailure = {
  ok: false;
  providerId: string;
  reason: string;
  suggestions: string[];
  retryable: boolean;
};

export type AiCommandResult = AiCommandSuccess | AiCommandFailure;

export interface AiCommandProvider {
  readonly id: string;
  parseCommand(text: string, context: AiCommandContext): Promise<AiCommandResult>;
}
