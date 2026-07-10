import type { DashboardAction } from "@/types/dashboard";

export interface CopilotActionEnvelope {
  type: DashboardAction["type"];
  action: DashboardAction;
  reason: string;
  confidence: number;
  requiresConfirmation?: boolean;
}

export function actionEnvelope(action: DashboardAction, reason: string, confidence = 0.78, requiresConfirmation = false): CopilotActionEnvelope {
  return {
    type: action.type,
    action,
    reason,
    confidence,
    requiresConfirmation
  };
}
