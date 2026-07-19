import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDashboardDocumentForPersistence, dashboardDocumentToPersistedPayload } from "@/lib/supabase/dashboard-documents";
import { assertLocalBypassAllowed } from "@/lib/security/environment";
import { checkRateLimit, clearRateLimitBuckets } from "@/lib/security/rate-limit";
import { securityHeaders } from "@/lib/security/headers";
import { clearInMemoryAuditEvents, listInMemoryAuditEvents, recordAuditEvent } from "@/lib/observability/audit";
import { createDirectDownloadStorageRecord, durableExportStorageViability } from "@/lib/export/storage-controls";
import { createExportRequest, createQueuedExportJob } from "@/lib/export/contracts";
import { apiErrorResponse, createApiRequestContext, readJsonBody } from "@/lib/security/api";
import { DomainError } from "@/lib/observability/domain-error";
import type { DashboardSpec } from "@/types/dashboard";

function dashboardSpec(): DashboardSpec {
  return {
    id: "dashboard-local",
    title: "Ventas enterprise",
    subtitle: "Persistencia v2",
    datasetId: "11111111-1111-4111-8111-111111111111",
    datasetVersionId: "22222222-2222-4222-8222-222222222222",
    semanticModelId: "semantic-sales",
    globalFilters: [{ id: "region", field: "region", label: "Region", type: "single_select" }],
    pages: [
      { id: "page_main", title: "Principal", order: 0, layout: { mode: "grid_12", columns: 12 }, filters: [], widgetIds: ["sales_kpi"] },
      { id: "page_detail", title: "Detalle", order: 1, layout: { mode: "grid_12", columns: 12 }, filters: [{ field: "region", operator: "eq", value: "RM" }], widgetIds: [] }
    ],
    widgets: [{
      id: "sales_kpi",
      type: "kpi_card",
      title: "Ventas",
      query: { metric: { field: "ventas", aggregation: "sum" }, metricId: "metric.sales" },
      lineage: {
        semanticModelId: "semantic-sales",
        datasetVersionId: "22222222-2222-4222-8222-222222222222",
        metricIds: ["metric.sales"],
        calculatedMetricIds: [],
        dimensionIds: [],
        timeDimensionIds: [],
        sourceColumnIds: ["ventas"],
        filters: [],
        migratedAt: "2026-07-19T00:00:00.000Z",
        warnings: []
      },
      config: { format: "currency" },
      position: { x: 0, y: 0, w: 3, h: 2 }
    }],
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z"
  };
}

describe("enterprise foundation hardening", () => {
  it("builds durable DashboardDocument v2 revisions with pages and reload payloads", () => {
    const document = buildDashboardDocumentForPersistence({
      dashboardId: "33333333-3333-4333-8333-333333333333",
      projectId: "44444444-4444-4444-8444-444444444444",
      userId: "55555555-5555-4555-8555-555555555555",
      spec: dashboardSpec(),
      viewState: { filters: [{ field: "region", operator: "eq", value: "RM" }] },
      reason: "enterprise test",
      source: "manual"
    }, 3);
    const revision = document.revisions[0]!;
    const payload = dashboardDocumentToPersistedPayload({
      document,
      viewStates: new Map([[revision.id, { filters: [{ field: "region", operator: "eq", value: "RM" }] }]])
    });

    expect(document.dashboard.currentRevisionId).toBe("33333333-3333-4333-8333-333333333333_rev_3");
    expect(revision.revisionNumber).toBe(3);
    expect(revision.pages.map((page) => page.id)).toEqual(["page_main", "page_detail"]);
    expect(revision.widgets[0]?.layout.pageId).toBe("page_main");
    expect(payload.spec.pages?.[0]?.widgetIds).toEqual(["sales_kpi"]);
    expect(payload.viewState.filters).toEqual([{ field: "region", operator: "eq", value: "RM" }]);
  });

  it("ships an additive DB/RLS/RPC harness for dashboard v2, export jobs and audit events", () => {
    const migration = readFileSync(join(process.cwd(), "supabase/migrations/0007_enterprise_foundation_hardening.sql"), "utf8");

    for (const objectName of ["dashboard_documents", "dashboard_revisions", "dashboard_pages", "dashboard_widgets", "export_jobs", "audit_events"]) {
      expect(migration).toContain(`public.${objectName}`);
      expect(migration).toContain(`alter table public.${objectName} enable row level security`);
    }
    expect(migration).toContain("create or replace function public.restore_dashboard_revision");
    expect(migration).toContain("auth.uid() = user_id");
    expect(migration).toContain("dashboard.revision.restore");
    const shareMigration = readFileSync(join(process.cwd(), "supabase/migrations/0004_public_share_security.sql"), "utf8");
    expect(shareMigration).toContain("export_snapshot");
    expect(shareMigration).toContain("'export_snapshot' = any(link_row.scopes)");
  });

  it("blocks local/demo persistence bypass in production", () => {
    expect(() => assertLocalBypassAllowed({ nodeEnv: "production", supabaseConfigured: false })).toThrow(/production/i);
    expect(() => assertLocalBypassAllowed({ nodeEnv: "production", supabaseConfigured: true, authenticatedUserId: null })).toThrow(/production/i);
    expect(() => assertLocalBypassAllowed({ nodeEnv: "production", supabaseConfigured: true, authenticatedUserId: "user-1" })).not.toThrow();
    expect(() => assertLocalBypassAllowed({ nodeEnv: "test", supabaseConfigured: false })).not.toThrow();
  });

  it("defines security headers with CSP, frame isolation and browser hardening", () => {
    const byKey = new Map(securityHeaders.map((header) => [header.key, header.value]));

    expect(byKey.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(byKey.get("Permissions-Policy")).toContain("camera=()");
    expect(byKey.get("Strict-Transport-Security")).toContain("max-age=");
  });

  it("rate limits sensitive routes with a structured decision", () => {
    clearRateLimitBuckets();

    expect(checkRateLimit("copilot:local", { windowMs: 1_000, max: 2 }, 100).allowed).toBe(true);
    expect(checkRateLimit("copilot:local", { windowMs: 1_000, max: 2 }, 200).remaining).toBe(0);
    const denied = checkRateLimit("copilot:local", { windowMs: 1_000, max: 2 }, 300);

    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(800);
    expect(denied.limit).toBe(2);
  });

  it("redacts sensitive audit metadata and models export storage debt explicitly", () => {
    clearInMemoryAuditEvents();
    const event = recordAuditEvent({
      action: "export.download.blocked",
      actorId: "public",
      actorType: "public",
      resourceType: "share_link",
      resourceId: "share-prefix",
      result: "denied",
      reason: "allowDownload=false",
      correlationId: "corr-1",
      metadata: { token: "share_secret", rowCount: 100, format: "pdf" }
    });
    const request = createExportRequest({
      target: { type: "dashboard" },
      format: "pdf",
      scope: "private_workspace",
      dashboardId: "dashboard-1",
      dashboardRevisionId: "rev-1",
      actor: { id: "user-1", role: "editor" },
      allowDownload: true
    });
    const record = createDirectDownloadStorageRecord(createQueuedExportJob(request));

    expect(event.metadata.token).toBe("[redacted]");
    expect(event.metadata.rowCount).toBe("[redacted]");
    expect(listInMemoryAuditEvents()).toHaveLength(1);
    expect(record.storageMode).toBe("direct-download");
    expect(durableExportStorageViability()).toMatchObject({ viable: false, debtLevel: "P2" });
  });

  it("returns structured API validation errors with correlation IDs and no secrets", async () => {
    const invalidRequest = new Request("https://dashpilot.test/api/query", {
      method: "POST",
      headers: { "x-request-id": "req-test", "content-length": "12" },
      body: "{bad json"
    });
    const context = createApiRequestContext(invalidRequest, "api/query");

    await expect(readJsonBody(invalidRequest, context)).rejects.toThrow(/JSON|Expected/i);
    await expect(readJsonBody(new Request("https://dashpilot.test/api/query", {
      method: "POST",
      headers: { "content-length": "1000001" },
      body: "{}"
    }), createApiRequestContext(new Request("https://dashpilot.test/api/query"), "api/query"))).rejects.toThrow(/Payload exceeds/i);

    const response = apiErrorResponse(new DomainError({
      code: "method_not_allowed",
      message: "authorization: Bearer secret-token",
      userMessage: "Metodo no permitido.",
      correlationId: "corr-method",
      recoverable: false
    }), context, 405);
    const payload = await response.json();

    expect(response.headers.get("x-correlation-id")).toBe("corr-method");
    expect(payload.error).toMatchObject({ code: "method_not_allowed", correlationId: "corr-method" });
    expect(JSON.stringify(payload)).not.toContain("secret-token");
  });
});
