import type { DatasetProfile } from "@/types/dataset";
import type { AnalyticalTableQuery, GovernedAnalyticalQuery } from "@/types/analytical-query";
import type { DashboardViewState, DashboardWidget } from "@/types/dashboard";
import { normalizeDashboardQueryForService } from "@/lib/query-service/service";

export type WidgetAnalyticalRequest =
  | {
      widgetId: string;
      kind: "aggregate";
      query: GovernedAnalyticalQuery;
    }
  | {
      widgetId: string;
      kind: "table";
      query: AnalyticalTableQuery;
    };

function firstAllowedCountField(profile: DatasetProfile) {
  return profile.detectedMetricColumns[0] ?? profile.detectedDimensionColumns[0] ?? profile.columns[0]?.normalizedName;
}

function defaultTableColumns(widget: DashboardWidget, profile: DatasetProfile) {
  const configured = widget.config.columns?.filter((column) => profile.columns.some((profileColumn) => profileColumn.normalizedName === column));
  if (configured?.length) return configured;
  return profile.columns.filter((column) => !column.isHidden).slice(0, 20).map((column) => column.normalizedName);
}

export function buildWidgetAnalyticalRequest(input: {
  datasetVersionId: string;
  widget: DashboardWidget;
  profile: DatasetProfile;
  viewState?: DashboardViewState;
}): WidgetAnalyticalRequest | null {
  if (input.widget.config.hidden) return null;

  if (input.widget.type === "table") {
    const columns = defaultTableColumns(input.widget, input.profile);
    if (!columns.length) return null;
    return {
      widgetId: input.widget.id,
      kind: "table",
      query: {
        datasetVersionId: input.datasetVersionId,
        columns,
        filters: [...(input.widget.query?.filters ?? []), ...(input.viewState?.filters ?? [])],
        search: input.viewState?.dataExplorer?.search,
        columnSearch: input.viewState?.dataExplorer?.columnSearch,
        orderBy: input.viewState?.dataExplorer?.sort,
        limit: input.viewState?.dataExplorer?.pageSize ?? input.widget.query?.limit ?? 50,
        offset: 0
      }
    };
  }

  if (!input.widget.query) return null;

  const fallbackCountField = firstAllowedCountField(input.profile);
  if (!input.widget.query.metric && !fallbackCountField) return null;

  return {
    widgetId: input.widget.id,
    kind: "aggregate",
    query: normalizeDashboardQueryForService({
      datasetVersionId: input.datasetVersionId,
      query: input.widget.query,
      viewState: input.viewState,
      fallbackCountField
    })
  };
}

export function buildDashboardAnalyticalRequests(input: {
  datasetVersionId: string;
  widgets: DashboardWidget[];
  profile: DatasetProfile;
  viewState?: DashboardViewState;
}) {
  return input.widgets
    .map((widget) => buildWidgetAnalyticalRequest({ ...input, widget }))
    .filter((request): request is WidgetAnalyticalRequest => request !== null);
}
