import type { DataRow, DatasetProfile, FileParseResult } from "@/types/dataset";
import type { DashboardSpec, DashboardViewState } from "@/types/dashboard";
import type { ShareLink } from "@/types/export";
import type { ImportJobRecord, ResumableUploadSession } from "@/types/imports";
import type { ObservableOperation } from "@/lib/observability/modes";
import type { PublicWidgetResult } from "@/lib/share/public-snapshot";

export type PersistenceMode = "supabase" | "local" | "degraded";

export interface PersistenceResult extends ObservableOperation {
  mode: PersistenceMode;
  warning?: string;
  recoverable?: boolean;
}

export interface DatasetPersistResult extends PersistenceResult {
  datasetId: string;
  datasetVersionId?: string;
  projectId?: string;
  storagePath?: string;
  profile: DatasetProfile;
  rows: DataRow[];
}

export interface DatasetImportStartResult extends PersistenceResult {
  job: ImportJobRecord;
  uploadSession: ResumableUploadSession;
  datasetId: string;
  datasetVersionId: string;
  projectId: string;
  reusedExistingJob: boolean;
}

export interface DashboardPersistResult extends PersistenceResult {
  dashboardId: string;
}

export interface PresentationPersistResult extends PersistenceResult {
  presentationId: string;
}

export interface SharePersistResult extends PersistenceResult {
  token: string;
  url: string;
  link: ShareLink;
}

export interface ParsedDatasetPayload {
  file?: File;
  parsed: FileParseResult;
  idempotencyKey?: string;
}

export interface PersistedDashboardPayload {
  spec: DashboardSpec;
  viewState: DashboardViewState;
  datasetId?: string;
  datasetVersionId?: string;
  rows?: DataRow[];
  profile?: DatasetProfile;
}

export interface PublicSharedDashboard {
  link: ShareLink;
  dashboard: DashboardSpec;
  viewState: DashboardViewState;
  widgetResults: PublicWidgetResult[];
  allowedFilters: DashboardSpec["globalFilters"];
}
