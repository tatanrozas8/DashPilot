import type { CopilotContext } from "@/lib/ai/context-builder";
import { buildDatasetCatalog } from "@/lib/semantic-layer/dataset-catalog";
import type { DatasetProfile, FileParseResult } from "@/types/dataset";
import type { DashboardSpec } from "@/types/dashboard";

export interface DatasetDiagnostics {
  fileName: string;
  selectedSheetName?: string;
  parsedColumnCount: number;
  parsedRowCount: number;
  originalColumns: string[];
  normalizedColumns: string[];
  columns: Array<{
    original: string;
    normalized: string;
    display: string;
    inferredType: string;
    semanticType: string;
    geoRole?: string;
    confidence?: number;
    uniqueCount: number;
    sampleValues: unknown[];
    usableAsFilter?: boolean;
    usableAsMetric?: boolean;
    usableAsDimension?: boolean;
    usableAsBreakdown?: boolean;
    aliases?: string[];
  }>;
  geographicColumns: string[];
  locationColumns: string[];
  metricColumns: string[];
  dimensionColumns: string[];
  copilotColumns: string[];
  dashboardColumns: string[];
}

function dashboardFields(spec?: DashboardSpec) {
  if (!spec) return [];
  const fields = new Set<string>();
  for (const filter of spec.globalFilters) fields.add(filter.field);
  for (const widget of spec.widgets) {
    if (widget.query?.metric?.field) fields.add(widget.query.metric.field);
    if (widget.query?.x?.field) fields.add(widget.query.x.field);
    for (const field of widget.query?.groupBy ?? []) fields.add(field);
    for (const field of widget.query?.filters?.map((filter) => filter.field) ?? []) fields.add(field);
    const configColumns = widget.config.columns;
    if (Array.isArray(configColumns)) {
      for (const field of configColumns) if (typeof field === "string") fields.add(field);
    }
  }
  return [...fields];
}

export function createDatasetDiagnostics(input: {
  profile: DatasetProfile;
  parsedDataset?: FileParseResult | null;
  dashboardSpec?: DashboardSpec;
  copilotContext?: CopilotContext;
}): DatasetDiagnostics {
  const selectedSheet = input.parsedDataset?.sheets.find((sheet) => sheet.name === input.parsedDataset?.selectedSheetName);
  const columns = input.profile.columns.map((column) => ({
    ...(() => {
      const catalogColumn = buildDatasetCatalog(input.profile).columns.find((item) => item.normalizedName === column.normalizedName);
      return {
        usableAsFilter: catalogColumn?.usableAsFilter,
        usableAsMetric: catalogColumn?.usableAsMetric,
        usableAsDimension: catalogColumn?.usableAsDimension,
        usableAsBreakdown: catalogColumn?.usableAsBreakdown,
        aliases: catalogColumn?.aliases
      };
    })(),
    original: column.originalName,
    normalized: column.normalizedName,
    display: column.displayName,
    inferredType: column.inferredType,
    semanticType: column.semanticType,
    geoRole: column.geoRole,
    confidence: column.geoConfidence ?? column.semanticConfidence,
    uniqueCount: column.uniqueCount,
    sampleValues: column.sampleValues
  }));

  return {
    fileName: input.profile.fileName,
    selectedSheetName: input.parsedDataset?.selectedSheetName,
    parsedColumnCount: selectedSheet?.columnCount ?? input.profile.columnCount,
    parsedRowCount: selectedSheet?.rowCount ?? input.profile.rowCount,
    originalColumns: columns.map((column) => column.original),
    normalizedColumns: columns.map((column) => column.normalized),
    columns,
    geographicColumns: input.profile.detectedGeoColumns,
    locationColumns: columns.filter((column) => column.geoRole).map((column) => column.normalized),
    metricColumns: input.profile.detectedMetricColumns,
    dimensionColumns: input.profile.detectedDimensionColumns,
    copilotColumns: input.copilotContext?.columns.map((column) => column.normalizedName) ?? [],
    dashboardColumns: dashboardFields(input.dashboardSpec)
  };
}

export function logDatasetDiagnostics(diagnostics: DatasetDiagnostics) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[DashPilot] Dataset diagnostics", {
    fileName: diagnostics.fileName,
    selectedSheetName: diagnostics.selectedSheetName,
    parsedColumnCount: diagnostics.parsedColumnCount,
    parsedRowCount: diagnostics.parsedRowCount,
    dashboardColumns: diagnostics.dashboardColumns,
    copilotColumns: diagnostics.copilotColumns
  });
  console.table(diagnostics.columns);
}
