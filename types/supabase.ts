export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type AnyRecord = { [key: string]: unknown };
type Table = {
  Row: AnyRecord;
  Insert: AnyRecord;
  Update: AnyRecord;
  Relationships: [];
};

type ShareLinksTable = {
  Row: {
    id: string;
    dashboard_id: string;
    user_id: string | null;
    token: string | null;
    token_hash: string | null;
    access: "public" | "private" | "password";
    password_hash: string | null;
    password_salt: string | null;
    allowed_filters_json: Json | null;
    expires_at: string | null;
    allow_filters: boolean;
    allow_download: boolean;
    scopes: string[];
    is_active: boolean;
    revoked_at: string | null;
    last_accessed_at: string | null;
    created_at: string;
    updated_at: string | null;
  };
  Insert: {
    id?: string;
    dashboard_id: string;
    user_id?: string | null;
    token?: string | null;
    token_hash?: string | null;
    access: "public" | "private" | "password";
    password_hash?: string | null;
    password_salt?: string | null;
    allowed_filters_json?: Json | null;
    expires_at?: string | null;
    allow_filters?: boolean;
    allow_download?: boolean;
    scopes?: string[];
    is_active?: boolean;
    revoked_at?: string | null;
    last_accessed_at?: string | null;
    created_at?: string;
    updated_at?: string | null;
  };
  Update: Partial<ShareLinksTable["Insert"]>;
  Relationships: [];
};

type ShareWidgetResultsTable = {
  Row: {
    id: string;
    share_link_id: string;
    widget_id: string;
    revision_id: string;
    result_json: Json;
    created_at: string;
  };
  Insert: {
    id?: string;
    share_link_id: string;
    widget_id: string;
    revision_id: string;
    result_json?: Json;
    created_at?: string;
  };
  Update: Partial<ShareWidgetResultsTable["Insert"]>;
  Relationships: [];
};

type ShareFilterSnapshotsTable = {
  Row: {
    id: string;
    share_link_id: string;
    filter_key: string;
    filters_json: Json;
    revision_id: string;
    created_at: string;
  };
  Insert: {
    id?: string;
    share_link_id: string;
    filter_key: string;
    filters_json?: Json;
    revision_id: string;
    created_at?: string;
  };
  Update: Partial<ShareFilterSnapshotsTable["Insert"]>;
  Relationships: [];
};

type PublicShareAccessLogsTable = {
  Row: {
    id: string;
    share_link_id: string | null;
    token_hash_prefix: string;
    action: "view_dashboard" | "use_filters" | "export_snapshot";
    outcome: "granted" | "denied" | "rate_limited";
    ip_hash: string | null;
    user_agent_hash: string | null;
    metadata: Json;
    created_at: string;
  };
  Insert: {
    id?: string;
    share_link_id?: string | null;
    token_hash_prefix: string;
    action: "view_dashboard" | "use_filters" | "export_snapshot";
    outcome: "granted" | "denied" | "rate_limited";
    ip_hash?: string | null;
    user_agent_hash?: string | null;
    metadata?: Json;
    created_at?: string;
  };
  Update: Partial<PublicShareAccessLogsTable["Insert"]>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table;
      projects: Table;
      datasets: Table;
      dataset_versions: Table;
      dataset_sheets: Table;
      dataset_columns: Table;
      dataset_rows: Table;
      dashboard_specs: Table;
      dashboard_versions: Table;
      presentations: Table;
      presentation_versions: Table;
      chat_messages: Table;
      share_links: ShareLinksTable;
      share_widget_results: ShareWidgetResultsTable;
      share_filter_snapshots: ShareFilterSnapshotsTable;
      public_share_access_logs: PublicShareAccessLogsTable;
      import_jobs: Table;
      audit_logs: Table;
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
    };
    Enums: { [key: string]: never };
    CompositeTypes: { [key: string]: never };
  };
}
