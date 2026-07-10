import { z } from "zod";
import { copilotActionSchema, copilotOutputSchema } from "@/lib/validation/copilot-actions";

export const copilotActionEnvelopeSchema = z.object({
  type: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1),
  requiresConfirmation: z.boolean().optional()
});

export const copilotStructuredOutputSchema = z.object({
  assistantMessage: z.string().min(1),
  actions: z.array(copilotActionSchema).default([]),
  warnings: z.array(z.string()).default([])
});

export { copilotActionSchema, copilotOutputSchema };
