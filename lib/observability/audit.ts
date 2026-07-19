export type AuditAction =
  | "dashboard.create"
  | "dashboard.update"
  | "dashboard.revision.create"
  | "dashboard.revision.restore"
  | "copilot.action.execute"
  | "export.create"
  | "export.download.blocked"
  | "share.create"
  | "share.revoke"
  | "share.access.denied"
  | "permission.denied"
  | "rate_limit.hit";

export type AuditResult = "success" | "denied" | "failed";

export interface AuditEvent {
  id: string;
  action: AuditAction;
  actorId: string;
  actorType: "user" | "public" | "system";
  resourceType: string;
  resourceId: string;
  result: AuditResult;
  reason?: string;
  correlationId: string;
  revisionId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const sensitiveKeyPattern = /(secret|token|password|api[_-]?key|service[_-]?role|authorization|row|rows|prompt)/i;
const inMemoryAuditEvents: AuditEvent[] = [];

function createAuditId() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `audit_${random}`;
}

export function redactAuditMetadata(metadata: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      sensitiveKeyPattern.test(key) ? "[redacted]" : value
    ])
  );
}

export function recordAuditEvent(input: Omit<AuditEvent, "id" | "createdAt" | "metadata"> & { metadata?: Record<string, unknown>; createdAt?: string }) {
  const event: AuditEvent = {
    ...input,
    id: createAuditId(),
    metadata: redactAuditMetadata(input.metadata),
    createdAt: input.createdAt ?? new Date().toISOString()
  };
  inMemoryAuditEvents.push(event);
  return event;
}

export function listInMemoryAuditEvents() {
  return [...inMemoryAuditEvents];
}

export function clearInMemoryAuditEvents() {
  inMemoryAuditEvents.length = 0;
}
