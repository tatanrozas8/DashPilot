"use client";

import { type CopilotRequestContext, type CopilotResult } from "@/lib/ai/copilot-service";
import { DomainError, toDomainError, type PublicDomainError } from "@/lib/observability/domain-error";

function payloadError(payload: unknown): PublicDomainError | null {
  if (typeof payload !== "object" || !payload || !("error" in payload)) return null;
  const error = (payload as { error?: Partial<PublicDomainError> }).error;
  if (!error || typeof error.code !== "string" || typeof error.message !== "string" || typeof error.correlationId !== "string") return null;
  return {
    code: error.code as PublicDomainError["code"],
    message: error.message,
    correlationId: error.correlationId,
    recoverable: error.recoverable ?? true,
    executionMode: error.executionMode,
    syncStatus: error.syncStatus
  };
}

export async function requestCopilotResponse(context: CopilotRequestContext): Promise<CopilotResult> {
  try {
    const response = await fetch("/api/copilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(context)
    });
    const payload = await response.json();
    const error = payloadError(payload);
    if (error) {
      throw new DomainError({
        code: error.code,
        message: error.message,
        userMessage: error.message,
        correlationId: error.correlationId,
        recoverable: error.recoverable,
        executionMode: error.executionMode,
        syncStatus: error.syncStatus
      });
    }
    if (!response.ok) {
      throw new DomainError({
        code: "ai_provider_unavailable",
        message: `Copiloto respondio HTTP ${response.status}.`,
        userMessage: "No se pudo completar la accion con IA. No se aplicaron cambios.",
        executionMode: "provider",
        syncStatus: "failed"
      });
    }
    return payload as CopilotResult;
  } catch (error) {
    throw toDomainError(error, {
      code: typeof navigator !== "undefined" && !navigator.onLine ? "network_offline" : "ai_provider_unavailable",
      fallbackMessage: "No se pudo completar la accion con IA. No se aplicaron cambios.",
      executionMode: typeof navigator !== "undefined" && !navigator.onLine ? "offline/local" : "provider",
      syncStatus: "failed"
    });
  }
}
