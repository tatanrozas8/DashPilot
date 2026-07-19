"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";
import type { AuditAction, AuditResult } from "@/lib/observability/audit";
import { redactAuditMetadata } from "@/lib/observability/audit";

export interface SupabaseAuditInput {
  userId?: string | null;
  projectId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: AuditAction;
  result: AuditResult;
  reason?: string;
  correlationId: string;
  revisionId?: string;
  metadata?: Record<string, unknown>;
}

export async function insertAuditEvent(supabase: SupabaseClient<Database>, input: SupabaseAuditInput) {
  const metadata = redactAuditMetadata(input.metadata);
  const { error } = await supabase.from("audit_events").insert({
    user_id: input.userId ?? null,
    project_id: input.projectId ?? null,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    action: input.action,
    result: input.result,
    reason: input.reason,
    correlation_id: input.correlationId,
    revision_id: input.revisionId,
    metadata: JSON.parse(JSON.stringify(metadata)) as Json
  });
  if (error) throw new Error(`No se pudo registrar auditoria: ${error.message}`);
}
