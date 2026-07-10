import type { DataRow } from "./dataset";

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

export interface DashboardSpec {
  id: string;
  title: string;
  subtitle?: string;
  businessDomain?: string;
  datasetId: string;
  globalFilters: DashboardFilterConfig[];
  widgets: DashboardWidget[];
  executiveSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  description?: string;
  query?: DashboardQuerySpec;
  config: Record<string, unknown>;
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
    aggregation: "sum" | "avg" | "count" | "min" | "max";
  };
  x?: {
    field: string;
    granularity?: "day" | "week" | "month" | "quarter" | "year";
  };
  groupBy?: string[];
  filters?: DashboardFilter[];
  orderBy?: {
    field: string;
    direction: "asc" | "desc";
  };
  limit?: number;
}

export interface DashboardFilter {
  field: string;
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "in" | "between";
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
}

export type QueryResultRow = DataRow & {
  label?: string;
  value?: number;
};

export type DashboardAction =
  | { type: "add_widget"; widget: DashboardWidget }
  | { type: "update_dashboard_title"; title: string }
  | { type: "update_widget_title"; widgetId: string; title: string }
  | { type: "update_widget"; widgetId: string; changes: Partial<DashboardWidget> }
  | { type: "remove_widget"; widgetId: string }
  | { type: "duplicate_widget"; widgetId: string }
  | { type: "change_chart_type"; widgetId: string; chartType: WidgetType }
  | { type: "add_filter"; filter: DashboardFilter }
  | { type: "add_or_update_filter"; filter: DashboardFilter }
  | { type: "clear_filters" }
  | { type: "explain_widget"; widgetId: string }
  | { type: "focus_widget"; widgetId: string }
  | { type: "reorder_widgets"; widgetIds: string[] }
  | { type: "create_calculated_metric"; id: string; title: string; formula: string; operands: string[] }
  | { type: "generate_insight"; widgetId?: string; content: string }
  | { type: "update_view_state"; viewState: Partial<DashboardViewState> }
  | { type: "generate_presentation"; options: PresentationGenerationOptions };

export interface PresentationGenerationOptions {
  theme?: "executive" | "commercial" | "financial" | "operations";
  durationMinutes?: 3 | 5 | 10;
  detailLevel?: "summary" | "intermediate" | "deep";
}
