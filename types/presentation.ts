import type { DashboardViewState } from "./dashboard";

export type PresentationTheme = "executive" | "commercial" | "financial" | "operations";

export interface PresentationSpec {
  id: string;
  dashboardId: string;
  sourceDashboardRevisionId: string;
  sourceDashboardTitle: string;
  sourceDashboardUpdatedAt: string;
  snapshotMode: "snapshot";
  title: string;
  subtitle?: string;
  theme: PresentationTheme;
  slides: PresentationSlide[];
  createdAt: string;
  updatedAt: string;
}

export interface PresentationSlide {
  id: string;
  title: string;
  subtitle?: string;
  narrative?: string;
  speakerNotes?: string;
  layout:
    | "cover"
    | "executive_summary"
    | "kpi_grid"
    | "chart_focus"
    | "comparison"
    | "ranking"
    | "table_detail"
    | "insights";
  widgetIds: string[];
  viewState?: DashboardViewState;
}
