export type ExportType =
  | "interactive_link"
  | "interactive_html"
  | "interactive_presentation"
  | "static_pdf"
  | "static_png"
  | "static_pptx";

export type {
  ExportError,
  ExportFormat,
  ExportJob,
  ExportRequest,
  ExportResult,
  ExportScope,
  ExportStatus,
  ExportTarget,
  ExportTargetType
} from "@/lib/export/contracts";

export interface ShareLink {
  id: string;
  dashboardId: string;
  token?: string;
  access: "public" | "private" | "password";
  expiresAt?: string;
  allowFilters: boolean;
  allowDownload: boolean;
  scopes?: PublicShareScope[];
  passwordRequired?: boolean;
  createdAt: string;
}

export type PublicShareScope = "view_dashboard" | "use_filters" | "export_snapshot";

export interface ImportJob {
  id: string;
  datasetId: string;
  userId?: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

export interface InteractiveExportManifest {
  id: string;
  dashboardId: string;
  exportType: ExportType;
  dashboardSpecPath: string;
  presentationSpecPath?: string;
  datasetPath: string;
  generatedAt: string;
  appVersion: string;
}
