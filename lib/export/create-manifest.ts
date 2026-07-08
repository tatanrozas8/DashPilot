import type { InteractiveExportManifest, ShareLink } from "@/types/export";

export function createDemoShareLink(dashboardId = "dashboard_demo"): ShareLink {
  return {
    id: "share_demo",
    dashboardId,
    token: "demo-q2-2024",
    access: "public",
    expiresAt: "2024-06-24T23:59:59.000Z",
    allowFilters: true,
    allowDownload: true,
    createdAt: new Date().toISOString()
  };
}

export function createExportManifest(dashboardId = "dashboard_demo"): InteractiveExportManifest {
  return {
    id: "export_demo",
    dashboardId,
    exportType: "interactive_link",
    dashboardSpecPath: `/dashboards/${dashboardId}/spec.json`,
    presentationSpecPath: "/presentations/presentation_demo/spec.json",
    datasetPath: "/datasets/demo-q2-2024.json",
    generatedAt: new Date().toISOString(),
    appVersion: "0.1.0"
  };
}
