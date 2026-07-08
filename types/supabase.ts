export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type AnyRecord = Record<string, any>;
type Table = {
  Row: AnyRecord;
  Insert: AnyRecord;
  Update: AnyRecord;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table;
      projects: Table;
      datasets: Table;
      dataset_sheets: Table;
      dataset_columns: Table;
      dataset_rows: Table;
      dashboard_specs: Table;
      dashboard_versions: Table;
      presentations: Table;
      presentation_versions: Table;
      chat_messages: Table;
      share_links: Table;
      import_jobs: Table;
      audit_logs: Table;
    };
    Views: Record<string, never>;
    Functions: {
      get_public_shared_dashboard: {
        Args: { share_token: string };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
