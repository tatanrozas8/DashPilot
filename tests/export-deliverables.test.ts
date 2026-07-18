import { describe, expect, it } from "vitest";
import { createExportRequest, createQueuedExportJob, dashboardExportRevisionId, failExportJob, transitionExportJob } from "@/lib/export/contracts";
import { generateDashboardExport, generatePresentationExport, generatePublicDashboardExport, pngDimensions, pngTextChunks, zipContains } from "@/lib/export/renderers";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { generatePresentationSpec } from "@/lib/presentation-spec/generate-presentation-spec";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { buildPublicDashboardSnapshot, publicShareRevisionId, publicShareScopes } from "@/lib/share/public-snapshot";
import type { DataRow } from "@/types/dataset";
import type { ShareLink } from "@/types/export";

const rows: DataRow[] = [
  { region: "Norte", canal: "Retail", ventas: 1200, fecha: "2026-01-01" },
  { region: "Sur", canal: "Online", ventas: 900, fecha: "2026-02-01" },
  { region: "Norte", canal: "Online", ventas: 700, fecha: "2026-03-01" }
];

function fixture() {
  const profile = profileDataset(rows, "ventas-export.csv");
  const dashboard = generateDashboardSpec(profile, rows);
  const viewState = { filters: [{ field: "region", operator: "in" as const, value: ["Norte"] }] };
  const presentation = generatePresentationSpec(dashboard);
  return { profile, dashboard, viewState, presentation };
}

describe("export deliverables", () => {
  it("validates export requests and rejects public downloads without scope", () => {
    const { dashboard, viewState } = fixture();
    expect(() => createExportRequest({
      target: { type: "dashboard" },
      format: "pdf",
      scope: "private_workspace",
      dashboardId: dashboard.id,
      dashboardRevisionId: dashboardExportRevisionId(dashboard),
      filters: viewState.filters,
      actor: { id: "local-user", role: "editor" },
      allowDownload: true
    })).not.toThrow();

    expect(() => createExportRequest({
      target: { type: "dashboard" },
      format: "pdf",
      scope: "public_share",
      dashboardId: dashboard.id,
      dashboardRevisionId: dashboardExportRevisionId(dashboard),
      filters: [],
      actor: { id: "public", role: "public" },
      allowDownload: false
    })).toThrow(/no permite descargas/i);

    expect(() => createExportRequest({
      target: { type: "slide", id: "slide_1" },
      format: "pptx",
      scope: "private_workspace",
      dashboardId: dashboard.id,
      dashboardRevisionId: dashboardExportRevisionId(dashboard),
      filters: [],
      actor: { id: "local-user", role: "editor" },
      allowDownload: true
    })).toThrow(/slides individuales/i);
  });

  it("generates a non-empty dashboard PDF with revision and filters", () => {
    const { dashboard, profile, viewState } = fixture();
    const artifact = generateDashboardExport({ dashboard, profile, viewState, rows, format: "pdf" });
    const text = new TextDecoder().decode(artifact.bytes);

    expect(artifact.fileName).toMatch(/\.pdf$/);
    expect(artifact.mimeType).toBe("application/pdf");
    expect(artifact.bytes.byteLength).toBeGreaterThan(500);
    expect(text).toContain("%PDF-1.4");
    expect(text).toContain("Revision:");
    expect(text).toContain("region in Norte");
    expect(artifact.result.metadata.dashboardRevisionId).toBe(dashboardExportRevisionId(dashboard));
  });

  it("generates a dashboard PNG with deterministic dimensions and metadata", () => {
    const { dashboard, profile, viewState } = fixture();
    const artifact = generateDashboardExport({ dashboard, profile, viewState, rows, format: "png" });

    expect(artifact.fileName).toMatch(/\.png$/);
    expect(artifact.mimeType).toBe("image/png");
    expect(pngDimensions(artifact.bytes)).toEqual({ width: 1200, height: 800 });
    expect(pngTextChunks(artifact.bytes).join("\n")).toContain(dashboardExportRevisionId(dashboard));
  });

  it("generates an inspectable PPTX package with ordered slides and speaker notes", () => {
    const { dashboard, profile, presentation, viewState } = fixture();
    const artifact = generatePresentationExport({ dashboard, presentation, profile, viewState, rows, format: "pptx" });

    expect(artifact.fileName).toMatch(/\.pptx$/);
    expect(artifact.mimeType).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(artifact.bytes[0]).toBe(0x50);
    expect(artifact.bytes[1]).toBe(0x4b);
    expect(zipContains(artifact.bytes, "ppt/presentation.xml")).toBe(true);
    expect(zipContains(artifact.bytes, "ppt/slides/slide1.xml")).toBe(true);
    expect(zipContains(artifact.bytes, "Speaker notes")).toBe(true);
    expect(artifact.result.metadata.presentationRevisionId).toContain(presentation.id);
  });

  it("generates a slide PNG and rejects missing slide targets", () => {
    const { dashboard, profile, presentation, viewState } = fixture();
    const slide = presentation.slides[0];
    const artifact = generatePresentationExport({ dashboard, presentation, profile, viewState, rows, format: "png", target: { type: "slide", id: slide.id } });

    expect(pngDimensions(artifact.bytes)).toEqual({ width: 1280, height: 720 });
    expect(artifact.fileName).toContain(slide.id);
    expect(() => generatePresentationExport({ dashboard, presentation, profile, viewState, rows, format: "png", target: { type: "slide", id: "missing" } })).toThrow(/slide solicitado no existe/i);
  });

  it("enforces allowDownload=false for public share exports", () => {
    const { dashboard, viewState } = fixture();
    const snapshot = buildPublicDashboardSnapshot({ dashboard, viewState, rows });
    const baseLink: ShareLink = {
      id: "share_export",
      dashboardId: dashboard.id,
      token: "share_export",
      access: "public",
      expiresAt: "2026-12-31",
      allowFilters: true,
      allowDownload: false,
      scopes: publicShareScopes({ allowFilters: true, allowDownload: false }),
      createdAt: "2026-07-18T00:00:00.000Z"
    };
    const payload = {
      link: baseLink,
      dashboard,
      viewState,
      widgetResults: snapshot.widgetResults,
      allowedFilters: snapshot.allowedFilters
    };

    expect(publicShareRevisionId(dashboard)).toBe(dashboardExportRevisionId(dashboard));
    expect(() => generatePublicDashboardExport(payload, "pdf")).toThrow(/no permite exportar/i);
    const allowed = generatePublicDashboardExport({
      ...payload,
      link: { ...baseLink, allowDownload: true, scopes: publicShareScopes({ allowFilters: true, allowDownload: true }) }
    }, "pdf");
    expect(allowed.bytes.byteLength).toBeGreaterThan(500);
  });

  it("models retryable export job failures", () => {
    const { dashboard } = fixture();
    const request = createExportRequest({
      target: { type: "dashboard" },
      format: "pdf",
      scope: "private_workspace",
      dashboardId: dashboard.id,
      dashboardRevisionId: dashboardExportRevisionId(dashboard),
      filters: [],
      actor: { id: "local-user", role: "editor" },
      allowDownload: true
    });
    const queued = createQueuedExportJob(request);
    const rendering = transitionExportJob(queued, "rendering", "Renderizando");
    const failed = failExportJob(rendering, { code: "render_failed", message: "Widget no renderizable", recoverable: true });

    expect(queued.status).toBe("queued");
    expect(rendering.status).toBe("rendering");
    expect(failed.status).toBe("failed");
    expect(failed.error?.recoverable).toBe(true);
  });
});
