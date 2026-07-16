import type { DataRow } from "@/types/dataset";
import type { DashboardFilter, DashboardFilterConfig, DashboardSpec, DashboardViewState, QueryResultRow } from "@/types/dashboard";
import type { PublicShareScope } from "@/types/export";
import { executeDashboardQuery } from "@/lib/query-engine/execute-dashboard-query";

export interface PublicWidgetResult {
  widgetId: string;
  revisionId: string;
  rows: QueryResultRow[];
}

export interface PublicDashboardSnapshot {
  revisionId: string;
  widgetResults: PublicWidgetResult[];
  allowedFilters: DashboardFilterConfig[];
}

export interface PublicSharePayload {
  dashboard: DashboardSpec;
  viewState: DashboardViewState;
  widgetResults: PublicWidgetResult[];
  allowedFilters: DashboardFilterConfig[];
}

export function publicShareScopes(input: { allowFilters: boolean; allowDownload: boolean }): PublicShareScope[] {
  return [
    "view_dashboard",
    input.allowFilters ? "use_filters" : undefined,
    input.allowDownload ? "export_snapshot" : undefined
  ].filter((scope): scope is PublicShareScope => Boolean(scope));
}

export function publicShareRevisionId(dashboard: DashboardSpec) {
  return `${dashboard.id}:${dashboard.datasetVersionId ?? dashboard.datasetId}:${dashboard.updatedAt}`;
}

function safeWidgetRows(widget: DashboardSpec["widgets"][number], rows: DataRow[], viewState: DashboardViewState): QueryResultRow[] {
  if (widget.type === "table") return [];
  if (!widget.query) {
    const fallback = typeof widget.config.fallbackValue === "number" ? widget.config.fallbackValue : null;
    return fallback === null ? [] : [{ label: widget.title, value: fallback }];
  }
  return executeDashboardQuery(rows, widget.query, viewState).slice(0, 100);
}

export function buildPublicDashboardSnapshot(input: { dashboard: DashboardSpec; viewState: DashboardViewState; rows: DataRow[] }): PublicDashboardSnapshot {
  const revisionId = publicShareRevisionId(input.dashboard);
  return {
    revisionId,
    allowedFilters: input.dashboard.globalFilters,
    widgetResults: input.dashboard.widgets
      .filter((widget) => widget.config.hidden !== true)
      .map((widget) => ({
        widgetId: widget.id,
        revisionId,
        rows: safeWidgetRows(widget, input.rows, input.viewState)
      }))
  };
}

export function validatePublicShareFilters(dashboard: DashboardSpec, filters: DashboardFilter[]) {
  const allowedFields = new Set(dashboard.globalFilters.map((filter) => filter.field));
  const allowedOperators = new Set<DashboardFilter["operator"]>(["eq", "in", "between", "range"]);
  return filters.every((filter) => allowedFields.has(filter.field) && allowedOperators.has(filter.operator));
}

export function publicPayloadContainsSourceRows(payload: PublicSharePayload, sourceRows: DataRow[]) {
  const serialized = JSON.stringify(payload);
  return sourceRows.some((row) => serialized.includes(JSON.stringify(row)));
}
