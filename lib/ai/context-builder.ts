import type { ChatMessage } from "@/types/ai";
import type { DataRow, DatasetProfile } from "@/types/dataset";
import type { DashboardSpec, DashboardViewState } from "@/types/dashboard";
import type { PresentationSpec } from "@/types/presentation";
import { inferSemanticLayer, type SemanticLayer } from "@/lib/semantic-layer";

const MAX_SAMPLE_ROWS = 5;
const MAX_SAMPLE_COLUMNS = 12;
const MAX_MESSAGES = 8;

export interface CopilotContext {
  datasetProfile: DatasetProfile;
  semanticModel: SemanticLayer;
  columns: Array<{
    originalName: string;
    normalizedName: string;
    displayName: string;
    inferredType: string;
    semanticType: string;
    sampleValues: unknown[];
  }>;
  availableMetrics: string[];
  availableDimensions: string[];
  dateColumns: string[];
  geoColumns: string[];
  filters: DashboardViewState["filters"];
  widgets: Array<{
    id: string;
    title: string;
    type: string;
    query?: unknown;
    config?: Record<string, unknown>;
  }>;
  dashboardSpec: DashboardSpec;
  viewState: DashboardViewState;
  presentationSpec?: PresentationSpec;
  recentMessages: ChatMessage[];
  insights: string[];
  sampleRows: DataRow[];
}

export interface BuildCopilotContextInput {
  rows: DataRow[];
  datasetProfile: DatasetProfile;
  dashboardSpec: DashboardSpec;
  viewState: DashboardViewState;
  presentationSpec?: PresentationSpec;
  messages?: ChatMessage[];
}

function sampleRows(rows: DataRow[], columns: string[]) {
  const selectedColumns = columns.slice(0, MAX_SAMPLE_COLUMNS);
  return rows.slice(0, MAX_SAMPLE_ROWS).map((row) =>
    selectedColumns.reduce<DataRow>((sample, column) => {
      sample[column] = row[column];
      return sample;
    }, {})
  );
}

export function buildCopilotContext(input: BuildCopilotContextInput): CopilotContext {
  const semanticModel = inferSemanticLayer(input.datasetProfile, input.rows);
  const columns = input.datasetProfile.columns.map((column) => ({
    originalName: column.originalName,
    normalizedName: column.normalizedName,
    displayName: column.displayName,
    inferredType: column.inferredType,
    semanticType: column.semanticType,
    sampleValues: column.sampleValues.slice(0, 5)
  }));
  const columnNames = columns.map((column) => column.normalizedName);

  return {
    datasetProfile: input.datasetProfile,
    semanticModel,
    columns,
    availableMetrics: [
      ...new Set([
        ...input.datasetProfile.detectedMetricColumns,
        ...semanticModel.metrics.map((field) => field.field),
        ...semanticModel.revenueMetrics.map((field) => field.field),
        ...semanticModel.marginMetrics.map((field) => field.field)
      ])
    ],
    availableDimensions: [
      ...new Set([
        ...input.datasetProfile.detectedDimensionColumns,
        ...semanticModel.dimensions.map((field) => field.field),
        ...semanticModel.geographies.map((field) => field.field),
        ...semanticModel.sellers.map((field) => field.field),
        ...semanticModel.clients.map((field) => field.field),
        ...semanticModel.products.map((field) => field.field),
        ...semanticModel.categories.map((field) => field.field)
      ])
    ],
    dateColumns: [...new Set([...input.datasetProfile.detectedDateColumns, ...semanticModel.dates.map((field) => field.field)])],
    geoColumns: [...new Set([...input.datasetProfile.detectedGeoColumns, ...semanticModel.geographies.map((field) => field.field)])],
    filters: input.viewState.filters ?? [],
    widgets: input.dashboardSpec.widgets.map((widget) => ({
      id: widget.id,
      title: widget.title,
      type: widget.type,
      query: widget.query,
      config: widget.config
    })),
    dashboardSpec: input.dashboardSpec,
    viewState: input.viewState,
    presentationSpec: input.presentationSpec,
    recentMessages: (input.messages ?? []).slice(-MAX_MESSAGES),
    insights: [
      input.dashboardSpec.executiveSummary,
      ...input.dashboardSpec.widgets
        .filter((widget) => widget.type === "insight_text")
        .flatMap((widget) => {
          const bullets = widget.config.bullets;
          return Array.isArray(bullets) ? bullets.filter((item): item is string => typeof item === "string") : [];
        })
    ].filter((item): item is string => Boolean(item)),
    sampleRows: sampleRows(input.rows, columnNames)
  };
}

export function toProviderContext(context: CopilotContext) {
  return {
    datasetProfile: {
      id: context.datasetProfile.id,
      fileName: context.datasetProfile.fileName,
      rowCount: context.datasetProfile.rowCount,
      columnCount: context.datasetProfile.columnCount,
      columns: context.columns,
      detectedMetricColumns: context.datasetProfile.detectedMetricColumns,
      detectedDimensionColumns: context.datasetProfile.detectedDimensionColumns,
      detectedDateColumns: context.datasetProfile.detectedDateColumns,
      detectedGeoColumns: context.datasetProfile.detectedGeoColumns,
      qualityWarnings: context.datasetProfile.qualityWarnings,
      qualityScore: context.datasetProfile.qualityScore
    },
    semanticModel: context.semanticModel,
    availableMetrics: context.availableMetrics,
    availableDimensions: context.availableDimensions,
    dateColumns: context.dateColumns,
    geoColumns: context.geoColumns,
    filters: context.filters,
    widgets: context.widgets,
    dashboard: {
      id: context.dashboardSpec.id,
      title: context.dashboardSpec.title,
      subtitle: context.dashboardSpec.subtitle,
      businessDomain: context.dashboardSpec.businessDomain,
      widgets: context.widgets,
      globalFilters: context.dashboardSpec.globalFilters
    },
    viewState: context.viewState,
    presentation: context.presentationSpec
      ? {
          id: context.presentationSpec.id,
          title: context.presentationSpec.title,
          theme: context.presentationSpec.theme,
          slides: context.presentationSpec.slides.map((slide) => ({ id: slide.id, title: slide.title, layout: slide.layout, widgetIds: slide.widgetIds }))
        }
      : undefined,
    recentMessages: context.recentMessages.map((message) => ({ role: message.role, content: message.content })),
    insights: context.insights.slice(0, 6),
    sampleRows: context.sampleRows
  };
}
