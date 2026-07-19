import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError, createCorrelationId, publicDomainError, toDomainError } from "@/lib/observability/domain-error";
import { checkRateLimit, type RateLimitRule } from "@/lib/security/rate-limit";

export const MAX_API_BODY_BYTES = 1_000_000;

export interface ApiRequestContext {
  correlationId: string;
  route: string;
  requestId: string;
}

export function createApiRequestContext(request: Request, route: string): ApiRequestContext {
  const inboundId = request.headers.get("x-request-id") ?? request.headers.get("x-correlation-id");
  return {
    route,
    requestId: inboundId ?? createCorrelationId("req"),
    correlationId: inboundId ?? createCorrelationId("api")
  };
}

export function clientRateLimitKey(request: Request, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const client = forwarded || request.headers.get("x-real-ip") || "local";
  return `${scope}:${client}`;
}

export function enforceApiRateLimit(request: Request, scope: string, rule: RateLimitRule, context: ApiRequestContext) {
  if (process.env.NODE_ENV === "test" || process.env.DASHPILOT_DISABLE_RATE_LIMIT === "true") {
    return null;
  }
  const decision = checkRateLimit(clientRateLimitKey(request, scope), rule);
  if (decision.allowed) return null;
  const error = new DomainError({
    code: "rate_limited",
    message: `Rate limit exceeded for ${scope}.`,
    userMessage: "Demasiadas solicitudes. Intenta nuevamente en unos segundos.",
    correlationId: context.correlationId,
    recoverable: true,
    executionMode: "provider",
    syncStatus: "failed"
  });
  return NextResponse.json({ error: publicDomainError(error), rateLimit: decision }, {
    status: 429,
    headers: {
      "x-correlation-id": context.correlationId,
      "retry-after": String(Math.ceil(decision.retryAfterMs / 1000))
    }
  });
}

export async function readJsonBody(request: Request, context: ApiRequestContext, maxBytes = MAX_API_BODY_BYTES) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) {
    throw new DomainError({
      code: "validation_failed",
      message: `Payload exceeds ${maxBytes} bytes.`,
      userMessage: "La solicitud excede el tamano permitido.",
      correlationId: context.correlationId,
      recoverable: false,
      executionMode: "provider",
      syncStatus: "failed"
    });
  }
  try {
    const text = await request.text();
    if (text.length > maxBytes) {
      throw new DomainError({
        code: "validation_failed",
        message: `Payload exceeds ${maxBytes} characters.`,
        userMessage: "La solicitud excede el tamano permitido.",
        correlationId: context.correlationId,
        recoverable: false,
        executionMode: "provider",
        syncStatus: "failed"
      });
    }
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw toDomainError(error, {
      code: "validation_failed",
      fallbackMessage: "Solicitud invalida.",
      correlationId: context.correlationId,
      recoverable: false,
      executionMode: "provider",
      syncStatus: "failed"
    });
  }
}

export function parseApiBody<TSchema extends z.ZodType>(schema: TSchema, body: unknown, context: ApiRequestContext): z.infer<TSchema> {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  throw new DomainError({
    code: "validation_failed",
    message: parsed.error.message,
    userMessage: "La solicitud no coincide con el contrato esperado.",
    correlationId: context.correlationId,
    recoverable: false,
    executionMode: "provider",
    syncStatus: "failed"
  });
}

export function apiErrorResponse(error: unknown, context: ApiRequestContext, status = 400) {
  const domainError = error instanceof DomainError
    ? error
    : toDomainError(error, {
        code: "unknown",
        fallbackMessage: "No se pudo procesar la solicitud.",
        correlationId: context.correlationId,
        executionMode: "provider",
        syncStatus: "failed"
      });
  return NextResponse.json({ error: publicDomainError(domainError) }, {
    status,
    headers: { "x-correlation-id": domainError.correlationId }
  });
}
