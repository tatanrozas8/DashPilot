import { NextResponse } from "next/server";
import { datasetProfileSchema, dashboardSpecSchema, presentationSpecSchema } from "@/lib/validation/schemas";
import { buildCopilotPrompt, copilotOutputJsonSchema, createMockCopilotResponse, parseCopilotProviderOutput, type CopilotRequestContext } from "@/lib/ai/copilot-service";
import { DomainError, createCorrelationId, logDomainError, publicDomainError, toDomainError } from "@/lib/observability/domain-error";
import { apiErrorResponse, createApiRequestContext, enforceApiRateLimit, readJsonBody } from "@/lib/security/api";
import { apiRateLimitRules } from "@/lib/security/rate-limit";
import { recordAuditEvent } from "@/lib/observability/audit";

const PROVIDER_TIMEOUT_MS = 15_000;

function outputText(payload: unknown) {
  if (typeof payload !== "object" || !payload) return null;
  if ("output_text" in payload && typeof payload.output_text === "string") return payload.output_text;
  const output = "output" in payload && Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    const content = typeof item === "object" && item && "content" in item && Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (typeof part === "object" && part && "text" in part && typeof part.text === "string") return part.text;
    }
  }
  return null;
}

function parseContext(raw: unknown): CopilotRequestContext | null {
  if (typeof raw !== "object" || !raw) return null;
  const input = raw as Record<string, unknown>;
  const datasetProfile = datasetProfileSchema.safeParse(input.datasetProfile);
  const dashboardSpec = dashboardSpecSchema.safeParse(input.dashboardSpec);
  const presentationSpec = input.presentationSpec ? presentationSpecSchema.safeParse(input.presentationSpec) : null;
  if (!datasetProfile.success || !dashboardSpec.success || typeof input.prompt !== "string" || typeof input.semanticModel !== "object" || !input.semanticModel || typeof input.viewState !== "object" || !input.viewState) {
    return null;
  }
  return {
    prompt: input.prompt,
    datasetProfile: datasetProfile.data,
    semanticModel: input.semanticModel as CopilotRequestContext["semanticModel"],
    dashboardSpec: dashboardSpec.data,
    viewState: input.viewState as CopilotRequestContext["viewState"],
    presentationSpec: presentationSpec?.success ? presentationSpec.data : undefined,
    messages: Array.isArray(input.messages) ? input.messages as CopilotRequestContext["messages"] : undefined,
    copilotContext: typeof input.copilotContext === "object" && input.copilotContext ? input.copilotContext as CopilotRequestContext["copilotContext"] : undefined,
    rows: Array.isArray(input.rows) ? input.rows as CopilotRequestContext["rows"] : undefined
  };
}

export async function POST(request: Request) {
  const apiContext = createApiRequestContext(request, "api/copilot");
  const rateLimit = enforceApiRateLimit(request, "copilot", apiRateLimitRules.copilot, apiContext);
  if (rateLimit) {
    recordAuditEvent({
      action: "rate_limit.hit",
      actorId: "anonymous",
      actorType: "system",
      resourceType: "api_route",
      resourceId: "api/copilot",
      result: "denied",
      reason: "rate_limit",
      correlationId: apiContext.correlationId
    });
    return rateLimit;
  }
  let rawBody: unknown;
  try {
    rawBody = await readJsonBody(request, apiContext);
  } catch (error) {
    const domainError = toDomainError(error, {
      code: "validation_failed",
      fallbackMessage: "Solicitud invalida.",
      correlationId: apiContext.correlationId,
      recoverable: false,
      executionMode: "provider",
      syncStatus: "failed"
    });
    return NextResponse.json({ error: publicDomainError(domainError) }, { status: 400 });
  }
  const context = parseContext(rawBody);
  if (!context) {
    const domainError = new DomainError({
      code: "validation_failed",
      message: "La solicitud del Copiloto no coincide con el contrato esperado.",
      userMessage: "Solicitud invalida.",
      correlationId: apiContext.correlationId,
      recoverable: false,
      executionMode: "provider",
      syncStatus: "failed"
    });
    return NextResponse.json({ error: publicDomainError(domainError) }, { status: 400 });
  }

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    const correlationId = createCorrelationId("ai_local");
    recordAuditEvent({
      action: "copilot.action.execute",
      actorId: "local-user",
      actorType: "user",
      resourceType: "dashboard",
      resourceId: context.dashboardSpec.id,
      result: "success",
      reason: "deterministic_fallback",
      correlationId,
      metadata: { mode: "deterministic", widgetCount: context.dashboardSpec.widgets.length }
    });
    return NextResponse.json({ ...createMockCopilotResponse(context), executionMode: "deterministic", correlationId }, { headers: { "x-correlation-id": correlationId } });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? "gpt-5.5",
        input: buildCopilotPrompt(context),
        text: {
          format: {
            type: "json_schema",
            name: "dashpilot_copilot_action",
            schema: copilotOutputJsonSchema,
            strict: true
          }
        }
      })
    });
    if (!response.ok) {
      const domainError = new DomainError({
        code: "ai_provider_unavailable",
        message: `Proveedor IA respondio HTTP ${response.status}.`,
        userMessage: "El proveedor de IA no esta disponible. No se aplicaron cambios.",
        correlationId: apiContext.correlationId,
        executionMode: "provider",
        syncStatus: "failed"
      });
      logDomainError(domainError, "copilot.provider.http");
      return NextResponse.json({ error: publicDomainError(domainError) }, { status: 502 });
    }
    const providerPayload = await response.json();
    const text = outputText(providerPayload);
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : providerPayload;
    } catch (error) {
      const domainError = toDomainError(error, {
        code: "ai_provider_invalid_response",
        fallbackMessage: "El proveedor de IA devolvio una respuesta invalida. No se aplicaron cambios.",
        correlationId: apiContext.correlationId,
        executionMode: "provider",
        syncStatus: "failed"
      });
      logDomainError(domainError, "copilot.provider.parse");
      return NextResponse.json({ error: publicDomainError(domainError) }, { status: 502 });
    }
    const result = parseCopilotProviderOutput(parsed, context);
    if (result.rejectedActionReason === "output_schema") {
      const domainError = new DomainError({
        code: "ai_provider_invalid_response",
        message: "La respuesta del proveedor no paso validacion estructurada.",
        userMessage: "El proveedor de IA devolvio una respuesta invalida. No se aplicaron cambios.",
        correlationId: apiContext.correlationId,
        executionMode: "provider",
        syncStatus: "failed"
      });
      logDomainError(domainError, "copilot.provider.schema");
      return NextResponse.json({ error: publicDomainError(domainError) }, { status: 502 });
    }
    recordAuditEvent({
      action: "copilot.action.execute",
      actorId: "provider-user",
      actorType: "user",
      resourceType: "dashboard",
      resourceId: context.dashboardSpec.id,
      result: "success",
      reason: "provider",
      correlationId: apiContext.correlationId,
      metadata: { mode: "provider", widgetCount: context.dashboardSpec.widgets.length }
    });
    return NextResponse.json({ ...result, executionMode: "provider", correlationId: apiContext.correlationId }, { headers: { "x-correlation-id": apiContext.correlationId } });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    const domainError = toDomainError(error, {
      code: aborted ? "ai_provider_timeout" : "ai_provider_unavailable",
      fallbackMessage: aborted ? "El proveedor de IA excedio el tiempo de espera. No se aplicaron cambios." : "No se pudo contactar al proveedor de IA. No se aplicaron cambios.",
      correlationId: apiContext.correlationId,
      executionMode: "provider",
      syncStatus: "failed"
    });
    logDomainError(domainError, "copilot.provider.fetch");
    return apiErrorResponse(domainError, apiContext, aborted ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }
}
