import type { ExecutionMode, SyncStatus } from "@/lib/observability/modes";

export type DomainErrorCode =
  | "ai_provider_unavailable"
  | "ai_provider_timeout"
  | "ai_provider_invalid_response"
  | "network_offline"
  | "supabase_unavailable"
  | "persistence_failed"
  | "validation_failed"
  | "permission_denied"
  | "rate_limited"
  | "method_not_allowed"
  | "conflict"
  | "unknown";

export interface DomainErrorOptions {
  code: DomainErrorCode;
  message: string;
  userMessage?: string;
  correlationId?: string;
  recoverable?: boolean;
  executionMode?: ExecutionMode;
  syncStatus?: SyncStatus;
  cause?: unknown;
}

export interface PublicDomainError {
  code: DomainErrorCode;
  message: string;
  correlationId: string;
  recoverable: boolean;
  executionMode?: ExecutionMode;
  syncStatus?: SyncStatus;
}

export function createCorrelationId(prefix = "dp") {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function sanitizeErrorMessage(value: unknown) {
  const raw = value instanceof Error ? value.message : typeof value === "string" ? value : "Error desconocido.";
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/(api[_-]?key|service[_-]?role[_-]?key|authorization)\s*[:=]\s*[^,\s]+/gi, "$1=[redacted]")
    .slice(0, 500);
}

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly correlationId: string;
  readonly recoverable: boolean;
  readonly userMessage: string;
  readonly executionMode?: ExecutionMode;
  readonly syncStatus?: SyncStatus;

  constructor(options: DomainErrorOptions) {
    super(sanitizeErrorMessage(options.message));
    this.name = "DomainError";
    this.code = options.code;
    this.correlationId = options.correlationId ?? createCorrelationId();
    this.recoverable = options.recoverable ?? true;
    this.userMessage = options.userMessage ?? this.message;
    this.executionMode = options.executionMode;
    this.syncStatus = options.syncStatus;
    if (options.cause) this.cause = options.cause;
  }
}

export function toDomainError(error: unknown, options: Omit<DomainErrorOptions, "message"> & { fallbackMessage: string }) {
  if (error instanceof DomainError) return error;
  return new DomainError({
    ...options,
    message: sanitizeErrorMessage(error instanceof Error ? error.message : options.fallbackMessage),
    userMessage: options.fallbackMessage,
    cause: error
  });
}

export function publicDomainError(error: DomainError): PublicDomainError {
  return {
    code: error.code,
    message: error.userMessage,
    correlationId: error.correlationId,
    recoverable: error.recoverable,
    executionMode: error.executionMode,
    syncStatus: error.syncStatus
  };
}

export function logDomainError(error: DomainError, context: string) {
  console.error("[DashPilot]", context, {
    code: error.code,
    correlationId: error.correlationId,
    recoverable: error.recoverable,
    executionMode: error.executionMode,
    syncStatus: error.syncStatus,
    message: error.message
  });
}
