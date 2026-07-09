"use client";

import { createMockCopilotResponse, parseCopilotProviderOutput, type CopilotRequestContext, type CopilotResult } from "@/lib/ai/copilot-service";

export async function requestCopilotResponse(context: CopilotRequestContext): Promise<CopilotResult> {
  try {
    const response = await fetch("/api/copilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(context)
    });
    if (!response.ok) return createMockCopilotResponse(context);
    const payload = await response.json();
    return parseCopilotProviderOutput(payload, context);
  } catch {
    return createMockCopilotResponse(context);
  }
}
