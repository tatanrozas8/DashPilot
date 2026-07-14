import type { DataRow } from "./dataset";
import type { PresentationSlide, PresentationTheme } from "./presentation";

export type WidgetType =
  | "kpi_card"
  | "line_chart"
  | "bar_chart"
  | "area_chart"
  | "donut_chart"
  | "scatter_plot"
  | "map"
  | "table"
  | "insight_text";

export type DashboardTargetType = "dashboard" | "widget" | "kpi" | "table" | "filter" | "presentation" | "slide" | "none";
export type DashboardVisualOrientation = "horizontal" | "vertical";

export interface DashboardWidgetVisualConfig {
  orientation?: DashboardVisualOrientation;
  legend?: boolean;
}

export interface DashboardSelectedTarget {
  selectedTargetType: DashboardTargetType;
  selectedTargetId?: string;
  selectedTargetTitle?: string;
  selectedTargetSpec?: unknown;
  selectedTargetCapabilities: string[];
}

export interface DashboardSpec {
  id: string;
  title: string;
  subtitle?: string;
  businessDomain?: string;
  datasetId: string;
  design?: DashboardDesignSettings;
  globalFilters: DashboardFilterConfig[];
  widgets: DashboardWidget[];
  executiveSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardDesignSettings {
  density?: "compact" | "comfortable";
  accentColor?: "indigo" | "emerald" | "sky" | "slate";
  cardStyle?: "soft" | "bordered";
  chartPalette?: "default" | "business" | "contrast";
}

export interface SavedDashboardTheme {
  id: string;
  name: string;
  scope: "user" | "team";
  design: Required<DashboardDesignSettings>;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  description?: string;
  query?: DashboardQuerySpec;
  config: Record<string, unknown> & {
    visualConfig?: DashboardWidgetVisualConfig;
    horizontal?: boolean;
    hidden?: boolean;
    columns?: string[];
  };
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface DashboardQuerySpec {
  metric?: {
    field: string;
    aggregation: "sum" | "avg" | "count" | "count_distinct" | "min" | "max";
  };
  x?: {
    field: string;
    granularity?: "day" | "week" | "month" | "quarter" | "year";
  };
  groupBy?: string[];
  seriesBy?: string;
  seriesGranularity?: "day" | "week" | "month" | "quarter" | "year";
  filters?: DashboardFilter[];
  orderBy?: {
    field: string;
    direction: "asc" | "desc";
  };
  limit?: number;
}

export interface DashboardFilter {
  field: string;
  operator: "eq" | "neq" | "contains" | "gt" | "lt" | "gte" | "lte" | "in" | "between" | "range";
  value: unknown;
}

export interface DashboardFilterConfig {
  id: string;
  field: string;
  label: string;
  type: "date_range" | "multi_select" | "single_select" | "number_range";
}

export interface DashboardViewState {
  filters: DashboardFilter[];
  selectedDateRange?: {
    from: string;
    to: string;
  };
  highlightedWidgetId?: string;
  hiddenWidgetIds?: string[];
  sortState?: {
    field: string;
    direction: "asc" | "desc";
  };
  dataExplorer?: {
    isOpen?: boolean;
    search?: string;
    visibleColumns?: string[];
    sort?: {
      field: string;
      direction: "asc" | "desc";
    };
    columnSearch?: {
      field: string;
      query: string;
    };
    pageSize?: number;
  };
  selectedTargetType?: DashboardTargetType;
  selectedTargetId?: string;
  selectedTargetTitle?: string;
  selectedTargetSpec?: unknown;
  selectedTargetCapabilities?: string[];
  copilotIntent?: "modify_selection" | "create_chart" | "modify_dashboard" | "filters" | "data_table" | "presentation";
}

export type QueryResultRow = DataRow & {
  label?: string;
  value?: number;
};

export type DashboardAction =
  | { type: "add_widget"; widget: DashboardWidget }
  | { type: "update_dashboard_title"; title: string }
  | { type: "update_dashboard_subtitle"; subtitle: string }
  | { type: "update_dashboard_design"; design: DashboardDesignSettings }
  | { type: "update_widget_title"; widgetId: string; title: string }
  | { type: "update_widget"; widgetId: string; changes: Partial<DashboardWidget> }
  | { type: "update_widget_visual_config"; widgetId: string; visualConfig: DashboardWidgetVisualConfig }
  | { type: "select_target"; targetType: DashboardTargetType; targetId?: string }
  | { type: "clear_selected_target" }
  | { type: "replace_widget"; widgetId: string; widget: DashboardWidget }
  | { type: "undo_last_action" }
  | { type: "remove_widget"; widgetId: string }
  | { type: "duplicate_widget"; widgetId: string }
  | { type: "change_chart_type"; widgetId: string; chartType: WidgetType }
  | { type: "resize_widget"; widgetId: string; position: DashboardWidget["position"] }
  | { type: "move_widget"; sourceWidgetId: string; targetWidgetId: string }
  | { type: "show_widget_data"; widgetId: string }
  | { type: "add_filter"; filter: DashboardFilter }
  | { type: "add_or_update_filter"; filter: DashboardFilter }
  | { type: "update_filter"; filter: DashboardFilter }
  | { type: "remove_filter"; field: string }
  | { type: "clear_filters" }
  | { type: "show_data_explorer" }
  | { type: "search_table"; query: string }
  | { type: "select_visible_columns"; columns: string[] }
  | { type: "sort_table"; field: string; direction: "asc" | "desc" }
  | { type: "group_by"; fields: string[] }
  | { type: "explain_dataset" }
  | { type: "explain_column"; field: string }
  | { type: "explain_widget"; widgetId: string }
  | { type: "focus_widget"; widgetId: string }
  | { type: "reorder_widgets"; widgetIds: string[] }
  | { type: "create_calculated_metric"; id: string; title: string; formula: string; operands: string[] }
  | { type: "generate_insight"; widgetId?: string; content: string }
  | { type: "update_view_state"; viewState: Partial<DashboardViewState> }
  | { type: "create_presentation"; options?: PresentationGenerationOptions }
  | { type: "add_slide"; slide: PresentationSlide }
  | { type: "generate_speaker_notes" }
  | { type: "ask_clarification"; question: string }
  | { type: "explain_limitation"; message: string }
  | { type: "generate_presentation"; options: PresentationGenerationOptions };

export interface PresentationGenerationOptions {
  theme?: PresentationTheme;
  durationMinutes?: 3 | 5 | 10;
  detailLevel?: "summary" | "intermediate" | "deep";
}
