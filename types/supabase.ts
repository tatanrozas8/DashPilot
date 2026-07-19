export type Json = unknown;

type DbShape<T extends object> = T & Record<string, unknown>;

type Table<Row extends object, Insert extends object = Partial<Row>, Update extends object = Partial<Row>> = {
  Row: DbShape<Row>;
  Insert: DbShape<Insert>;
  Update: DbShape<Update>;
  Relationships: [];
};

type AccessMode = "public" | "private" | "password";
type PublicShareAction = "view_dashboard" | "use_filters" | "export_snapshot";
type PublicShareOutcome = "granted" | "denied" | "rate_limited";
type DashboardRevisionStatus = "draft" | "published" | "archived";
type DashboardDocumentStatus = "active" | "archived" | "deleted";
type DashboardRevisionSource = "manual" | "copilot" | "import" | "restore";
type ExportFormat = "pdf" | "png" | "pptx";
type ExportStatus = "queued" | "rendering" | "ready" | "failed" | "expired";
type ExportScope = "private_workspace" | "public_share";
type AuditResult = "success" | "denied" | "failed";

type ProfilesTable = Table<{
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}, {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
  email?: string | null;
  created_at?: string;
  updated_at?: string;
}>;

type ProjectsTable = Table<{
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}, {
  id?: string;
  user_id: string;
  name: string;
  description?: string | null;
  status?: string;
  created_at?: string;
  updated_at?: string;
}>;

type DatasetsTable = Table<{
  id: string;
  project_id: string;
  user_id: string | null;
  file_name: string;
  file_type: string;
  file_size: number | null;
  selected_sheet_name: string | null;
  row_count: number;
  column_count: number;
  storage_path: string | null;
  profile_json: Json;
  quality_score: number | null;
  status: string | null;
  active_version_id: string | null;
  active_version_number: number;
  created_at: string;
  updated_at: string | null;
}, {
  id?: string;
  project_id: string;
  user_id?: string | null;
  file_name: string;
  file_type: string;
  file_size?: number | null;
  selected_sheet_name?: string | null;
  row_count?: number;
  column_count?: number;
  storage_path?: string | null;
  profile_json?: Json;
  quality_score?: number | null;
  status?: string | null;
  active_version_id?: string | null;
  active_version_number?: number;
  created_at?: string;
  updated_at?: string | null;
}>;

type DatasetVersionsTable = Table<{
  id: string;
  project_id: string;
  dataset_id: string;
  user_id: string | null;
  version_number: number;
  status: "created" | "uploading" | "processing" | "validating" | "ready" | "failed" | "cancelled" | "superseded";
  checksum: string;
  schema_hash: string;
  idempotency_key: string | null;
  file_name: string;
  file_type: string;
  file_size: number;
  selected_sheet_name: string;
  row_count: number;
  column_count: number;
  profile_json: Json;
  quality_score: number | null;
  storage_path: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  ready_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  superseded_at: string | null;
}, {
  id?: string;
  project_id: string;
  dataset_id: string;
  user_id?: string | null;
  version_number: number;
  status?: DatasetVersionsTable["Row"]["status"];
  checksum: string;
  schema_hash: string;
  idempotency_key?: string | null;
  file_name: string;
  file_type: string;
  file_size?: number;
  selected_sheet_name: string;
  row_count?: number;
  column_count?: number;
  profile_json?: Json;
  quality_score?: number | null;
  storage_path?: string | null;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
  ready_at?: string | null;
  failed_at?: string | null;
  cancelled_at?: string | null;
  superseded_at?: string | null;
}>;

type DatasetSheetsTable = Table<{
  id: string;
  dataset_id: string;
  dataset_version_id: string | null;
  sheet_name: string;
  row_count: number | null;
  column_count: number | null;
  is_selected: boolean | null;
  created_at: string | null;
}, {
  id?: string;
  dataset_id: string;
  dataset_version_id?: string | null;
  sheet_name: string;
  row_count?: number | null;
  column_count?: number | null;
  is_selected?: boolean | null;
  created_at?: string | null;
}>;

type DatasetColumnsTable = Table<{
  id: string;
  dataset_id: string;
  dataset_version_id: string | null;
  original_name: string;
  normalized_name: string | null;
  display_name: string;
  inferred_type: string;
  semantic_type: string;
  profile_json: Json;
  position: number | null;
  null_count: number | null;
  null_percentage: number | null;
  unique_count: number | null;
  sample_values: Json | null;
  min_value: string | null;
  max_value: string | null;
  statistics_json: Json | null;
  created_at: string;
}, {
  id?: string;
  dataset_id: string;
  dataset_version_id?: string | null;
  original_name: string;
  normalized_name?: string | null;
  display_name: string;
  inferred_type: string;
  semantic_type: string;
  profile_json?: Json;
  position?: number | null;
  null_count?: number | null;
  null_percentage?: number | null;
  unique_count?: number | null;
  sample_values?: Json | null;
  min_value?: string | null;
  max_value?: string | null;
  statistics_json?: Json | null;
  created_at?: string;
}>;

type DatasetRowsTable = Table<{
  id: string;
  dataset_id: string;
  dataset_version_id: string | null;
  row_index: number;
  row_json: Json;
  created_at: string | null;
}, {
  id?: string;
  dataset_id: string;
  dataset_version_id?: string | null;
  row_index: number;
  row_json: Json;
  created_at?: string | null;
}>;

type DashboardSpecsTable = Table<{
  id: string;
  project_id: string;
  dataset_id: string;
  dataset_version_id: string | null;
  user_id: string | null;
  title: string;
  description: string | null;
  spec_json: Json;
  view_state_json: Json;
  status: string | null;
  active_revision_id: string | null;
  semantic_model_id: string | null;
  created_at: string;
  updated_at: string;
}, {
  id?: string;
  project_id: string;
  dataset_id: string;
  dataset_version_id?: string | null;
  user_id?: string | null;
  title: string;
  description?: string | null;
  spec_json: Json;
  view_state_json?: Json;
  status?: string | null;
  active_revision_id?: string | null;
  semantic_model_id?: string | null;
  created_at?: string;
  updated_at?: string;
}>;

type DashboardVersionsTable = Table<{
  id: string;
  dashboard_id: string;
  spec_json: Json;
  change_reason: string | null;
  created_at: string;
}, {
  id?: string;
  dashboard_id: string;
  spec_json: Json;
  change_reason?: string | null;
  created_at?: string;
}>;

type DashboardDocumentsTable = Table<{
  id: string;
  project_id: string;
  dataset_id: string;
  dataset_version_id: string | null;
  user_id: string;
  title: string;
  subtitle: string | null;
  current_revision_id: string;
  published_revision_id: string | null;
  global_filters_json: Json;
  status: DashboardDocumentStatus;
  created_at: string;
  updated_at: string;
}, {
  id: string;
  project_id: string;
  dataset_id: string;
  dataset_version_id?: string | null;
  user_id: string;
  title: string;
  subtitle?: string | null;
  current_revision_id: string;
  published_revision_id?: string | null;
  global_filters_json?: Json;
  status?: DashboardDocumentStatus;
  created_at?: string;
  updated_at?: string;
}>;

type DashboardRevisionsTable = Table<{
  id: string;
  dashboard_id: string;
  revision_number: number;
  status: DashboardRevisionStatus;
  semantic_model_id: string;
  dataset_version_id: string;
  spec_json: Json;
  view_state_json: Json;
  reason: string | null;
  source: DashboardRevisionSource;
  created_by: string | null;
  audit_event_id: string | null;
  mutable: boolean;
  published_at: string | null;
  created_at: string;
}, {
  id: string;
  dashboard_id: string;
  revision_number: number;
  status: DashboardRevisionStatus;
  semantic_model_id: string;
  dataset_version_id: string;
  spec_json: Json;
  view_state_json?: Json;
  reason?: string | null;
  source?: DashboardRevisionSource;
  created_by?: string | null;
  audit_event_id?: string | null;
  mutable?: boolean;
  published_at?: string | null;
  created_at?: string;
}>;

type DashboardPagesTable = Table<{
  id: string;
  dashboard_id: string;
  revision_id: string;
  title: string;
  page_order: number;
  layout_json: Json;
  filters_json: Json;
  widget_ids: string[];
  created_at: string;
}, {
  id: string;
  dashboard_id: string;
  revision_id: string;
  title: string;
  page_order: number;
  layout_json?: Json;
  filters_json?: Json;
  widget_ids?: string[];
  created_at?: string;
}>;

type DashboardWidgetsTable = Table<{
  id: string;
  dashboard_id: string;
  revision_id: string;
  page_id: string;
  widget_type: string;
  title: string;
  widget_json: Json;
  layout_json: Json;
  query_json: Json | null;
  created_at: string;
}, {
  id: string;
  dashboard_id: string;
  revision_id: string;
  page_id: string;
  widget_type: string;
  title: string;
  widget_json: Json;
  layout_json: Json;
  query_json?: Json | null;
  created_at?: string;
}>;

type PresentationsTable = Table<{
  id: string;
  dashboard_id: string;
  user_id: string | null;
  title: string;
  spec_json: Json;
  status: string | null;
  created_at: string;
  updated_at: string;
}, {
  id?: string;
  dashboard_id: string;
  user_id?: string | null;
  title: string;
  spec_json: Json;
  status?: string | null;
  created_at?: string;
  updated_at?: string;
}>;

type PresentationVersionsTable = Table<{
  id: string;
  presentation_id: string;
  spec_json: Json;
  change_reason: string | null;
  created_at: string;
}, {
  id?: string;
  presentation_id: string;
  spec_json: Json;
  change_reason?: string | null;
  created_at?: string;
}>;

type ChatMessagesTable = Table<{
  id: string;
  project_id: string;
  dashboard_id: string | null;
  user_id: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  structured_action_json: Json | null;
  created_at: string;
}, {
  id?: string;
  project_id: string;
  dashboard_id?: string | null;
  user_id?: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  structured_action_json?: Json | null;
  created_at?: string;
}>;

type ShareLinksTable = Table<{
  id: string;
  dashboard_id: string;
  user_id: string | null;
  token: string | null;
  token_hash: string | null;
  access: AccessMode;
  password_hash: string | null;
  password_salt: string | null;
  allowed_filters_json: Json;
  expires_at: string | null;
  allow_filters: boolean;
  allow_download: boolean;
  scopes: PublicShareAction[];
  is_active: boolean;
  revoked_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string | null;
}, {
  id?: string;
  dashboard_id: string;
  user_id?: string | null;
  token?: string | null;
  token_hash?: string | null;
  access: AccessMode;
  password_hash?: string | null;
  password_salt?: string | null;
  allowed_filters_json?: Json;
  expires_at?: string | null;
  allow_filters?: boolean;
  allow_download?: boolean;
  scopes?: PublicShareAction[];
  is_active?: boolean;
  revoked_at?: string | null;
  last_accessed_at?: string | null;
  created_at?: string;
  updated_at?: string | null;
}>;

type ShareWidgetResultsTable = Table<{
  id: string;
  share_link_id: string;
  widget_id: string;
  revision_id: string;
  result_json: Json;
  created_at: string;
}, {
  id?: string;
  share_link_id: string;
  widget_id: string;
  revision_id: string;
  result_json?: Json;
  created_at?: string;
}>;

type ShareFilterSnapshotsTable = Table<{
  id: string;
  share_link_id: string;
  filter_key: string;
  filters_json: Json;
  revision_id: string;
  created_at: string;
}, {
  id?: string;
  share_link_id: string;
  filter_key: string;
  filters_json?: Json;
  revision_id: string;
  created_at?: string;
}>;

type PublicShareAccessLogsTable = Table<{
  id: string;
  share_link_id: string | null;
  token_hash_prefix: string;
  action: PublicShareAction;
  outcome: PublicShareOutcome;
  ip_hash: string | null;
  user_agent_hash: string | null;
  metadata: Json;
  created_at: string;
}, {
  id?: string;
  share_link_id?: string | null;
  token_hash_prefix: string;
  action: PublicShareAction;
  outcome: PublicShareOutcome;
  ip_hash?: string | null;
  user_agent_hash?: string | null;
  metadata?: Json;
  created_at?: string;
}>;

interface ImportJobsRow {
  id: string;
  project_id: string | null;
  dataset_id: string | null;
  dataset_version_id: string | null;
  user_id: string | null;
  idempotency_key: string | null;
  status: string;
  stage: string;
  progress: number;
  attempts: number;
  max_attempts: number;
  lease_owner: string | null;
  heartbeat_at: string | null;
  next_run_at: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  cancelled_at: string | null;
  dead_letter_at: string | null;
  created_at: string;
  updated_at: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number;
  declared_mime_type: string | null;
  detected_mime_type: string | null;
  storage_bucket: string;
  storage_path: string | null;
  upload_protocol: string;
  upload_session_json: Json;
  retention_policy: string;
  retained_until: string | null;
  scanner_provider: string | null;
  scan_status: string;
  scan_result_json: Json;
  validation_json: Json;
  preview_json: Json;
  completed_stages: string[];
  columnar_format: string | null;
  columnar_storage_path: string | null;
  active_artifact_path: string | null;
}

type ImportJobsTable = Table<ImportJobsRow, Partial<ImportJobsRow> & {
  user_id?: string | null;
  status?: string;
  stage?: string;
  progress?: number;
}>;

type AuditLogsTable = Table<{
  id: string;
  user_id: string | null;
  project_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  action: string;
  metadata: Json | null;
  created_at: string | null;
}, {
  id?: string;
  user_id?: string | null;
  project_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  action: string;
  metadata?: Json | null;
  created_at?: string | null;
}>;

type AuditEventsTable = Table<{
  id: string;
  user_id: string | null;
  project_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  result: AuditResult;
  reason: string | null;
  correlation_id: string;
  revision_id: string | null;
  metadata: Json;
  created_at: string;
}, {
  id?: string;
  user_id?: string | null;
  project_id?: string | null;
  entity_type: string;
  entity_id?: string | null;
  action: string;
  result: AuditResult;
  reason?: string | null;
  correlation_id: string;
  revision_id?: string | null;
  metadata?: Json;
  created_at?: string;
}>;

type ExportJobsTable = Table<{
  id: string;
  dashboard_id: string | null;
  dashboard_revision_id: string | null;
  user_id: string | null;
  share_link_id: string | null;
  format: ExportFormat;
  status: ExportStatus;
  scope: ExportScope;
  request_json: Json;
  result_json: Json | null;
  storage_bucket: string | null;
  storage_path: string | null;
  signed_url_expires_at: string | null;
  error_message: string | null;
  correlation_id: string;
  created_at: string;
  updated_at: string;
}, {
  id: string;
  dashboard_id?: string | null;
  dashboard_revision_id?: string | null;
  user_id?: string | null;
  share_link_id?: string | null;
  format: ExportFormat;
  status: ExportStatus;
  scope: ExportScope;
  request_json: Json;
  result_json?: Json | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  signed_url_expires_at?: string | null;
  error_message?: string | null;
  correlation_id: string;
  created_at?: string;
  updated_at?: string;
}>;

export interface Database {
  public: {
    Tables: {
      profiles: ProfilesTable;
      projects: ProjectsTable;
      datasets: DatasetsTable;
      dataset_versions: DatasetVersionsTable;
      dataset_sheets: DatasetSheetsTable;
      dataset_columns: DatasetColumnsTable;
      dataset_rows: DatasetRowsTable;
      dashboard_specs: DashboardSpecsTable;
      dashboard_versions: DashboardVersionsTable;
      dashboard_documents: DashboardDocumentsTable;
      dashboard_revisions: DashboardRevisionsTable;
      dashboard_pages: DashboardPagesTable;
      dashboard_widgets: DashboardWidgetsTable;
      presentations: PresentationsTable;
      presentation_versions: PresentationVersionsTable;
      chat_messages: ChatMessagesTable;
      share_links: ShareLinksTable;
      share_widget_results: ShareWidgetResultsTable;
      share_filter_snapshots: ShareFilterSnapshotsTable;
      public_share_access_logs: PublicShareAccessLogsTable;
      import_jobs: ImportJobsTable;
      audit_logs: AuditLogsTable;
      audit_events: AuditEventsTable;
      export_jobs: ExportJobsTable;
    };
    Views: { [key: string]: never };
    Functions: {
      get_public_shared_dashboard: {
        Args: { share_token: string; share_password?: string | null; requested_scopes?: string[]; requested_filters?: Json };
        Returns: Json;
      };
      activate_dataset_version: {
        Args: { target_dataset_id: string; target_version_id: string; expected_active_version_id: string | null };
        Returns: Json;
      };
      restore_dashboard_revision: {
        Args: { target_dashboard_id: string; source_revision_id: string; restore_reason?: string | null };
        Returns: Json;
      };
    };
    Enums: { [key: string]: never };
    CompositeTypes: { [key: string]: never };
  };
}
