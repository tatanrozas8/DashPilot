import type { DataRow } from "@/types/dataset";
import type { DashboardFilter, DashboardFilterConfig, DashboardSpec, DashboardViewState, QueryResultRow } from "@/types/dashboard";
import type { PublicShareScope } from "@/types/export";
import { executeDashboardQuery } from "@/lib/query-engine/execute-dashboard-query";

export const PUBLIC_FILTER_MAX_FILTERS = 1;
export const PUBLIC_FILTER_MAX_OPTIONS = 12;
export const PUBLIC_FILTER_MAX_VALUE_LENGTH = 120;

export interface PublicWidgetResult {
  widgetId: string;
  revisionId: string;
  rows: QueryResultRow[];
}

export interface PublicFilterSnapshot {
  filterKey: string;
  filters: DashboardFilter[];
  revisionId: string;
  widgetResults: PublicWidgetResult[];
}

export interface PublicDashboardSnapshot {
  revisionId: string;
  widgetResults: PublicWidgetResult[];
  allowedFilters: DashboardFilterConfig[];
  filterSnapshots: PublicFilterSnapshot[];
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

function publicFilterValueKey(value: string | number | boolean) {
  return JSON.stringify(value);
}

function isPublicFilterValue(value: unknown): value is string | number | boolean {
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && value.trim().length > 0 && value.length <= PUBLIC_FILTER_MAX_VALUE_LENGTH;
}

function allowedValuesForFilter(filter: DashboardFilterConfig, rows: DataRow[]): NonNullable<DashboardFilterConfig["allowedValues"]> {
  const values = new Map<string, string | number | boolean>();
  for (const row of rows) {
    const value = row[filter.field];
    if (!isPublicFilterValue(value)) continue;
    values.set(publicFilterValueKey(value), value);
    if (values.size >= PUBLIC_FILTER_MAX_OPTIONS) break;
  }
  return [...values.values()].map((value) => ({ label: String(value), value }));
}

function allowedPublicFilters(filters: DashboardFilterConfig[], rows: DataRow[]) {
  return filters
    .map((filter) => ({
      ...filter,
      allowedValues: filter.allowedValues?.filter((option) => isPublicFilterValue(option.value)).slice(0, PUBLIC_FILTER_MAX_OPTIONS) ?? allowedValuesForFilter(filter, rows)
    }))
    .filter((filter) => filter.allowedValues.length > 0)
    .slice(0, PUBLIC_FILTER_MAX_FILTERS);
}

function canonicalFilterValue(value: unknown) {
  if (Array.isArray(value)) return value;
  return [value];
}

export function normalizePublicShareFilters(allowedFilters: DashboardFilterConfig[], filters: DashboardFilter[]) {
  if (filters.length > PUBLIC_FILTER_MAX_FILTERS) return null;
  const allowedByField = new Map(allowedFilters.map((filter) => [filter.field, filter]));
  const normalized: DashboardFilter[] = [];
  for (const filter of filters) {
    const config = allowedByField.get(filter.field);
    if (!config) return null;
    if (filter.operator !== "in" && filter.operator !== "eq") return null;
    const values = canonicalFilterValue(filter.value);
    if (values.length !== 1) return null;
    const value = values[0];
    if (!isPublicFilterValue(value)) return null;
    const allowedValues = config.allowedValues ?? [];
    if (!allowedValues.some((option) => publicFilterValueKey(option.value) === publicFilterValueKey(value))) return null;
    normalized.push({ field: filter.field, operator: "in", value: [value] });
  }
  return normalized.sort((left, right) => left.field.localeCompare(right.field, "es"));
}

export function publicFilterKey(filters: DashboardFilter[]) {
  return filters.length ? JSON.stringify(filters) : "base";
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
  const allowedFilters = allowedPublicFilters(input.dashboard.globalFilters, input.rows);
  const baseFilters = input.viewState.filters ?? [];
  const widgetResults = input.dashboard.widgets
    .filter((widget) => widget.config.hidden !== true)
    .map((widget) => ({
      widgetId: widget.id,
      revisionId,
      rows: safeWidgetRows(widget, input.rows, input.viewState)
    }));
  const filterSnapshots: PublicFilterSnapshot[] = [
    { filterKey: "base", filters: [], revisionId, widgetResults },
    ...allowedFilters.flatMap((filter) => (filter.allowedValues ?? []).map((option) => {
      const filters: DashboardFilter[] = [{ field: filter.field, operator: "in", value: [option.value] }];
      const filteredViewState = {
        ...input.viewState,
        filters: [...baseFilters.filter((item) => item.field !== filter.field), ...filters]
      };
      const filteredRevisionId = `${revisionId}:filter:${publicFilterKey(filters)}`;
      return {
        filterKey: publicFilterKey(filters),
        filters,
        revisionId: filteredRevisionId,
        widgetResults: input.dashboard.widgets
          .filter((widget) => widget.config.hidden !== true)
          .map((widget) => ({
            widgetId: widget.id,
            revisionId: filteredRevisionId,
            rows: safeWidgetRows(widget, input.rows, filteredViewState)
          }))
      };
    }))
  ];
  return {
    revisionId,
    allowedFilters,
    widgetResults,
    filterSnapshots
  };
}

export function validatePublicShareFilters(dashboard: DashboardSpec, filters: DashboardFilter[]) {
  return normalizePublicShareFilters(dashboard.globalFilters, filters) !== null;
}

export function publicPayloadContainsSourceRows(payload: PublicSharePayload, sourceRows: DataRow[]) {
  const serialized = JSON.stringify(payload);
  return sourceRows.some((row) => serialized.includes(JSON.stringify(row)));
}
