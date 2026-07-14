import type { ChatMessage } from "@/types/ai";
import type { DataRow, DatasetProfile } from "@/types/dataset";
import type { DashboardSpec, DashboardViewState } from "@/types/dashboard";
import type { PresentationSpec } from "@/types/presentation";
import { inferSemanticLayer, type SemanticLayer } from "@/lib/semantic-layer";

const MAX_SAMPLE_ROWS = 5;
const MAX_SAMPLE_COLUMNS = 12;
const MAX_MESSAGES = 8;
const MAX_CONTEXT_CHUNKS = 8;
const CHUNK_TARGET_ROWS = 1000;

interface CopilotDatasetChunk {
  index: number;
  fromRow: number;
  toRow: number;
  rowCount: number;
  nullCounts: Record<string, number>;
  numericStats: Record<string, { min: number; max: number; avg: number }>;
  sampleRows: DataRow[];
}

export interface CopilotContext {
  datasetProfile: DatasetProfile;
  semanticModel: SemanticLayer;
  columns: Array<{
    originalName: string;
    normalizedName: string;
    displayName: string;
    businessName?: string;
    description?: string;
    synonyms?: string[];
    isHidden?: boolean;
    inferredType: string;
    semanticType: string;
    userSemanticType?: string;
    semanticConfidence?: number;
    geoRole?: string;
    geoConfidence?: number;
    nullCount: number;
    nullPercentage: number;
    uniqueCount: number;
    min?: number | string;
    max?: number | string;
    statistics?: Record<string, unknown>;
    sampleValues: unknown[];
  }>;
  dataCoverage: {
    rowCount: number;
    columnCount: number;
    profiledRows: number;
    sampledRows: number;
    chunkCount: number;
    strategy: "full_profile_plus_chunk_summaries";
  };
  datasetChunks: CopilotDatasetChunk[];
  availableMetrics: string[];
  availableDimensions: string[];
  dateColumns: string[];
  geoColumns: string[];
  geographicColumns: Array<{
    originalName: string;
    normalizedName: string;
    displayName: string;
    geoRole?: string;
    confidence?: number;
    uniqueCount: number;
    sampleValues: unknown[];
  }>;
  filters: DashboardViewState["filters"];
  widgets: Array<{
    id: string;
    title: string;
    type: string;
    query?: unknown;
    config?: Record<string, unknown>;
  }>;
  dashboardSpec: DashboardSpec;
  dashboardDesign: DashboardSpec["design"];
  viewState: DashboardViewState;
  presentationSpec?: PresentationSpec;
  recentMessages: ChatMessage[];
  insights: string[];
  sampleRows: DataRow[];
  availableActions: string[];
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

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value.replace(/[$,%\s]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildDatasetChunks(rows: DataRow[], columns: string[], metricColumns: string[]): CopilotDatasetChunk[] {
  if (!rows.length) return [];
  const chunkSize = Math.max(CHUNK_TARGET_ROWS, Math.ceil(rows.length / MAX_CONTEXT_CHUNKS));
  const chunks: CopilotDatasetChunk[] = [];

  for (let start = 0; start < rows.length && chunks.length < MAX_CONTEXT_CHUNKS; start += chunkSize) {
    const chunkRows = rows.slice(start, start + chunkSize);
    const nullCounts: Record<string, number> = {};
    const numericStats: CopilotDatasetChunk["numericStats"] = {};

    for (const column of columns) {
      nullCounts[column] = chunkRows.reduce((count, row) => row[column] === null || row[column] === undefined || row[column] === "" ? count + 1 : count, 0);
    }

    for (const column of metricColumns.slice(0, MAX_SAMPLE_COLUMNS)) {
      const values = chunkRows.map((row) => toNumber(row[column])).filter((value): value is number => value !== undefined);
      if (!values.length) continue;
      const sum = values.reduce((total, value) => total + value, 0);
      numericStats[column] = {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: sum / values.length
      };
    }

    chunks.push({
      index: chunks.length,
      fromRow: start + 1,
      toRow: start + chunkRows.length,
      rowCount: chunkRows.length,
      nullCounts,
      numericStats,
      sampleRows: sampleRows(chunkRows, columns)
    });
  }

  return chunks;
}

export function buildCopilotContext(input: BuildCopilotContextInput): CopilotContext {
  const semanticModel = inferSemanticLayer(input.datasetProfile, input.rows);
  const columns = input.datasetProfile.columns.map((column) => ({
    originalName: column.originalName,
    normalizedName: column.normalizedName,
    displayName: column.displayName,
    businessName: column.businessName,
    description: column.description,
    synonyms: column.synonyms,
    isHidden: column.isHidden,
    inferredType: column.inferredType,
    semanticType: column.semanticType,
    userSemanticType: column.userSemanticType,
    semanticConfidence: column.semanticConfidence,
    geoRole: column.geoRole,
    geoConfidence: column.geoConfidence,
    nullCount: column.nullCount,
    nullPercentage: column.nullPercentage,
    uniqueCount: column.uniqueCount,
    min: column.min,
    max: column.max,
    statistics: column.statistics,
    sampleValues: column.sampleValues.slice(0, 5)
  }));
  const columnNames = columns.map((column) => column.normalizedName);
  const activeColumnNames = columns.filter((column) => !column.isHidden).map((column) => column.normalizedName);
  const datasetChunks = buildDatasetChunks(input.rows, activeColumnNames, input.datasetProfile.detectedMetricColumns);

  return {
    datasetProfile: input.datasetProfile,
    semanticModel,
    columns,
    dataCoverage: {
      rowCount: input.rows.length,
      columnCount: input.datasetProfile.columnCount,
      profiledRows: input.datasetProfile.rowCount,
      sampledRows: Math.min(input.rows.length, MAX_SAMPLE_ROWS),
      chunkCount: datasetChunks.length,
      strategy: "full_profile_plus_chunk_summaries"
    },
    datasetChunks,
    availableMetrics: [
      ...new Set([
        ...input.datasetProfile.detectedMetricColumns.filter((field) => activeColumnNames.includes(field)),
        ...semanticModel.metrics.map((field) => field.field),
        ...semanticModel.revenueMetrics.map((field) => field.field),
        ...semanticModel.marginMetrics.map((field) => field.field)
      ])
    ],
    availableDimensions: [
      ...new Set([
        ...input.datasetProfile.detectedDimensionColumns.filter((field) => activeColumnNames.includes(field)),
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
    geographicColumns: columns
      .filter((column) => column.semanticType === "geo" || column.inferredType === "geography")
      .map((column) => ({
        originalName: column.originalName,
        normalizedName: column.normalizedName,
        displayName: column.displayName,
        geoRole: column.geoRole,
        confidence: column.geoConfidence ?? column.semanticConfidence,
        uniqueCount: column.uniqueCount,
        sampleValues: column.sampleValues
      })),
    filters: input.viewState.filters ?? [],
    widgets: input.dashboardSpec.widgets.map((widget) => ({
      id: widget.id,
      title: widget.title,
      type: widget.type,
      query: widget.query,
      config: widget.config
    })),
    dashboardSpec: input.dashboardSpec,
    dashboardDesign: input.dashboardSpec.design,
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
    sampleRows: sampleRows(input.rows, columnNames),
    availableActions: [
      "update_dashboard_design",
      "add_widget",
      "update_widget",
      "add_or_update_filter",
      "show_data_explorer",
      "select_visible_columns",
      "sort_table",
      "generate_insight",
      "generate_presentation"
    ]
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
    dataCoverage: context.dataCoverage,
    datasetChunks: context.datasetChunks,
    availableMetrics: context.availableMetrics,
    availableDimensions: context.availableDimensions,
    dateColumns: context.dateColumns,
    geoColumns: context.geoColumns,
    geographicColumns: context.geographicColumns,
    filters: context.filters,
    widgets: context.widgets,
    dashboard: {
      id: context.dashboardSpec.id,
      title: context.dashboardSpec.title,
      subtitle: context.dashboardSpec.subtitle,
      businessDomain: context.dashboardSpec.businessDomain,
      design: context.dashboardDesign,
      widgets: context.widgets,
      globalFilters: context.dashboardSpec.globalFilters
    },
    viewState: context.viewState,
    availableActions: context.availableActions,
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
