import type { InteractiveExportManifest, ShareLink } from "@/types/export";

export function createDemoShareLink(dashboardId = "dashboard_sample"): ShareLink {
  return {
    id: "share_sample",
    dashboardId,
    token: "datos-de-ejemplo",
    access: "public",
    expiresAt: "2024-06-24T23:59:59.000Z",
    allowFilters: true,
    allowDownload: true,
    createdAt: new Date().toISOString()
  };
}

export function createExportManifest(dashboardId = "dashboard_sample"): InteractiveExportManifest {
  return {
    id: "export_sample",
    dashboardId,
    exportType: "interactive_link",
    dashboardSpecPath: `/dashboards/${dashboardId}/spec.json`,
    presentationSpecPath: "/presentations/presentation_sample/spec.json",
    datasetPath: "/datasets/datos-de-ejemplo.json",
    generatedAt: new Date().toISOString(),
    appVersion: "0.1.0"
  };
}
