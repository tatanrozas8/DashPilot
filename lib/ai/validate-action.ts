import type { CopilotValidationContext } from "@/lib/validation/copilot-actions";
import type { DashboardAction } from "@/types/dashboard";
import { validateCopilotAction } from "@/lib/validation/copilot-actions";

export function validateAction(action: DashboardAction, context: CopilotValidationContext) {
  return validateCopilotAction(action, context);
}
