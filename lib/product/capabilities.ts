export type CapabilityStatus = "real" | "partial" | "mock" | "disconnected" | "future";

export type CapabilityId =
  | "dataset.upload"
  | "dataset.demo"
  | "dataset.previewCsv"
  | "dashboard.generate"
  | "dashboard.save"
  | "dashboard.exportCsv"
  | "dashboard.exportSpecJson"
  | "share.interactiveLink"
  | "share.password"
  | "export.interactiveManifest"
  | "export.staticPdf"
  | "export.staticPng"
  | "export.staticPptx"
  | "presentation.generate"
  | "presentation.save"
  | "presentation.present"
  | "presentation.promptAdjustments"
  | "copilot.provider";

export interface Capability {
  id: CapabilityId;
  label: string;
  status: CapabilityStatus;
  visible: boolean;
  enabled: boolean;
  beta: boolean;
  description: string;
}

export const featureFlags = {
  interactiveManifestExport: false,
  staticPdfExport: false,
  staticPngExport: false,
  staticPptxExport: false,
  passwordProtectedShares: false,
  providerCopilot: false
} as const;

export const capabilities: Capability[] = [
  { id: "dataset.upload", label: "Upload CSV/XLS/XLSX", status: "real", visible: true, enabled: true, beta: false, description: "Parses and profiles a real uploaded file in the browser." },
  { id: "dataset.demo", label: "Demo dataset", status: "real", visible: true, enabled: true, beta: false, description: "Loads bundled sample data." },
  { id: "dataset.previewCsv", label: "Preview CSV export", status: "real", visible: true, enabled: true, beta: false, description: "Downloads the currently displayed preview sample." },
  { id: "dashboard.generate", label: "Deterministic dashboard generation", status: "real", visible: true, enabled: true, beta: false, description: "Builds DashboardSpec from profile and rows with deterministic rules." },
  { id: "dashboard.save", label: "Dashboard persistence", status: "partial", visible: true, enabled: true, beta: true, description: "Saves to Supabase when available; otherwise uses explicit in-memory sandbox/degraded sync state." },
  { id: "dashboard.exportCsv", label: "Dataset CSV export", status: "real", visible: true, enabled: true, beta: false, description: "Downloads visible dataset rows as CSV from the active in-memory dataset." },
  { id: "dashboard.exportSpecJson", label: "DashboardSpec JSON export", status: "real", visible: true, enabled: true, beta: false, description: "Downloads the current DashboardSpec JSON." },
  { id: "share.interactiveLink", label: "Interactive share link", status: "partial", visible: true, enabled: true, beta: true, description: "Creates Supabase-backed links when authenticated; local sandbox links are session-scoped only." },
  { id: "share.password", label: "Password-protected share", status: "future", visible: false, enabled: false, beta: false, description: "Hidden until server-side password validation is implemented." },
  { id: "export.interactiveManifest", label: "Interactive manifest", status: "future", visible: true, enabled: featureFlags.interactiveManifestExport, beta: true, description: "Disabled until import/open support exists." },
  { id: "export.staticPdf", label: "Static PDF export", status: "future", visible: true, enabled: featureFlags.staticPdfExport, beta: false, description: "Disabled until a real PDF renderer exists." },
  { id: "export.staticPng", label: "Static PNG export", status: "future", visible: true, enabled: featureFlags.staticPngExport, beta: false, description: "Disabled until a real image capture pipeline exists." },
  { id: "export.staticPptx", label: "PowerPoint export", status: "future", visible: true, enabled: featureFlags.staticPptxExport, beta: false, description: "Disabled until a real PPTX pipeline exists." },
  { id: "presentation.generate", label: "Interactive presentation generation", status: "real", visible: true, enabled: true, beta: false, description: "Generates PresentationSpec from the active DashboardSpec." },
  { id: "presentation.save", label: "Presentation persistence", status: "partial", visible: true, enabled: true, beta: true, description: "Persists through the same Supabase/local sandbox adapter." },
  { id: "presentation.present", label: "Presentation mode", status: "real", visible: true, enabled: true, beta: false, description: "Shows generated slides and dashboard widgets interactively." },
  { id: "presentation.promptAdjustments", label: "Presentation prompt adjustments", status: "real", visible: true, enabled: true, beta: false, description: "Applies deterministic local prompt rules to presentation options/content." },
  { id: "copilot.provider", label: "AI Copilot provider", status: "partial", visible: true, enabled: true, beta: true, description: "Uses provider mode when AI_API_KEY exists; otherwise deterministic mode is explicit in responses." }
];

export function capability(id: CapabilityId) {
  const item = capabilities.find((entry) => entry.id === id);
  if (!item) throw new Error(`Unknown capability: ${id}`);
  return item;
}
