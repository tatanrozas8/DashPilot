import type { DataRow, DatasetProfile } from "@/types/dataset";
import type { DashboardFilter, QueryMetricResult, QueryResultRow, QueryWarning } from "@/types/dashboard";

export type AnalyticalAggregation = "sum" | "avg" | "count" | "count_distinct" | "min" | "max";
export type AnalyticalGranularity = "day" | "week" | "month" | "quarter" | "year";
export type AnalyticalOrderDirection = "asc" | "desc";
export type AnalyticalArtifactFormat = "parquet" | "columnar-json";

export interface AnalyticalMetric {
  field: string;
  aggregation: AnalyticalAggregation;
  alias?: string;
}

export interface AnalyticalTimeDimension {
  field: string;
  granularity: AnalyticalGranularity;
}

export interface AnalyticalOrderBy {
  field: "label" | "value" | string;
  direction: AnalyticalOrderDirection;
}

export interface GovernedAnalyticalQuery {
  datasetVersionId: string;
  metrics: AnalyticalMetric[];
  dimensions: string[];
  timeDimension?: AnalyticalTimeDimension;
  filters: DashboardFilter[];
  orderBy?: AnalyticalOrderBy;
  limit: number;
  offset: number;
}

export interface AnalyticalQueryLimits {
  maxScanRows: number;
  maxResultRows: number;
  maxEstimatedCells: number;
  maxEstimatedCardinality: number;
  timeoutMs: number;
}

export interface AnalyticalCostEstimate {
  scannedRows: number;
  projectedColumns: number;
  estimatedCells: number;
  estimatedCardinality: number;
  accepted: boolean;
  reasons: string[];
}

export interface AnalyticalLineage {
  datasetVersionId: string;
  sourceArtifactPath: string;
  sourceFormat: AnalyticalArtifactFormat;
  queryHash: string;
  metricFields: string[];
  dimensionFields: string[];
  filterFields: string[];
  generatedAt: string;
}

export interface AnalyticalQueryMetadata {
  cache: "hit" | "miss" | "preaggregation";
  coverage: number;
  totalCount: number;
  validCount: number;
  excludedCount: number;
  warnings: QueryWarning[];
  cost: AnalyticalCostEstimate;
  lineage: AnalyticalLineage;
  executionMs: number;
  rowCount: number;
}

export interface AnalyticalQueryResult {
  rows: QueryResultRow[];
  metadata: AnalyticalQueryMetadata;
}

export interface AnalyticalTableQuery {
  datasetVersionId: string;
  columns: string[];
  filters: DashboardFilter[];
  search?: string;
  columnSearch?: {
    field: string;
    query: string;
  };
  orderBy?: AnalyticalOrderBy;
  limit: number;
  offset: number;
}

export interface AnalyticalTableResult {
  rows: DataRow[];
  totalRows: number;
  filteredRows: number;
  metadata: AnalyticalQueryMetadata;
}

export interface AnalyticalDatasetArtifact {
  datasetVersionId: string;
  tenantId: string;
  profile: DatasetProfile;
  format: AnalyticalArtifactFormat;
  path: string;
  rows?: DataRow[];
  columns?: Array<{
    name: string;
    values: Array<string | number | boolean | null>;
  }>;
  rowCount: number;
  columnCount: number;
  invalidatedAt?: string;
}

export interface AnalyticalQueryContext {
  tenantId: string;
  userId: string;
  signal?: AbortSignal;
  now?: Date;
  limits?: Partial<AnalyticalQueryLimits>;
}

export interface WidgetAnalyticalResult {
  widgetId: string;
  result: AnalyticalQueryResult;
}

export type MetricCoverage = Pick<QueryMetricResult, "coverage" | "totalCount" | "validCount" | "excludedCount" | "warnings">;
