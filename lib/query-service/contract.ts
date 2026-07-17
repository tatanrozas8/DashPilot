import { z } from "zod";
import { analyticalTableQuerySchema, governedAnalyticalQuerySchema } from "@/lib/query-service/schemas";
import type { AnalyticalCostEstimate, AnalyticalLineage, AnalyticalQueryMetadata } from "@/types/analytical-query";
import type { DataRow } from "@/types/dataset";
import type { QueryMetricResult, QueryResultRow, QueryWarning } from "@/types/dashboard";

const analyticalScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const queryValueStateSchema = z.enum(["ok", "partial", "empty", "invalid", "indeterminate"]);
const queryWarningCodeSchema = z.enum([
  "numeric_value_excluded",
  "null_value_excluded",
  "empty_value_excluded",
  "no_valid_numeric_values",
  "division_by_zero",
  "invalid_formula",
  "invalid_filter_value"
]);
const dashboardAggregationSchema = z.enum(["sum", "avg", "count", "count_distinct", "min", "max"]);

export const queryWarningSchema = z.object({
  code: queryWarningCodeSchema,
  message: z.string().min(1),
  field: z.string().min(1).optional(),
  aggregation: dashboardAggregationSchema.optional(),
  count: z.number().optional()
}) satisfies z.ZodType<QueryWarning>;

export const queryMetricResultSchema = z.object({
  value: z.number().nullable(),
  state: queryValueStateSchema,
  totalCount: z.number().int().min(0),
  validCount: z.number().int().min(0),
  excludedCount: z.number().int().min(0),
  coverage: z.number().min(0).max(1),
  warnings: z.array(queryWarningSchema)
}) satisfies z.ZodType<QueryMetricResult>;

export const queryResultRowSchema: z.ZodType<QueryResultRow> = z.record(
  z.string(),
  z.union([analyticalScalarSchema, queryMetricResultSchema, z.array(queryWarningSchema)]).optional()
);

export const dataRowSchema: z.ZodType<DataRow> = z.record(z.string(), analyticalScalarSchema);

export const analyticalCostEstimateSchema = z.object({
  scannedRows: z.number().int().min(0),
  projectedColumns: z.number().int().min(0),
  estimatedCells: z.number().int().min(0),
  estimatedCardinality: z.number().int().min(0),
  accepted: z.boolean(),
  reasons: z.array(z.string())
}) satisfies z.ZodType<AnalyticalCostEstimate>;

export const analyticalLineageSchema = z.object({
  datasetVersionId: z.string().min(1),
  sourceArtifactPath: z.string().min(1),
  sourceFormat: z.enum(["parquet", "columnar-json"]),
  queryHash: z.string().min(1),
  metricFields: z.array(z.string()),
  dimensionFields: z.array(z.string()),
  filterFields: z.array(z.string()),
  generatedAt: z.string().min(1)
}) satisfies z.ZodType<AnalyticalLineage>;

export const analyticalQueryMetadataSchema = z.object({
  cache: z.enum(["hit", "miss", "preaggregation"]),
  coverage: z.number().min(0).max(1),
  totalCount: z.number().int().min(0),
  validCount: z.number().int().min(0),
  excludedCount: z.number().int().min(0),
  warnings: z.array(queryWarningSchema),
  cost: analyticalCostEstimateSchema,
  lineage: analyticalLineageSchema,
  executionMs: z.number().min(0),
  rowCount: z.number().int().min(0)
}) satisfies z.ZodType<AnalyticalQueryMetadata>;

export const queryServiceContextSchema = z.enum(["authenticated", "local", "public"]);
export type QueryServiceContext = z.infer<typeof queryServiceContextSchema>;

export const queryServiceSourceSchema = z.enum(["supabase", "local", "snapshot", "cache"]);
export type QueryServiceSource = z.infer<typeof queryServiceSourceSchema>;

export const queryServiceRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("aggregate"),
    datasetId: z.string().min(1),
    dashboardId: z.string().min(1).optional(),
    context: queryServiceContextSchema,
    query: governedAnalyticalQuerySchema
  }),
  z.object({
    kind: z.literal("table"),
    datasetId: z.string().min(1),
    dashboardId: z.string().min(1).optional(),
    context: queryServiceContextSchema,
    query: analyticalTableQuerySchema
  })
]);

export type QueryServiceRequest = z.infer<typeof queryServiceRequestSchema>;

export interface ExecutedQuerySummary {
  datasetId: string;
  datasetVersionId: string;
  dashboardId?: string;
  kind: QueryServiceRequest["kind"];
  filters: number;
  limit: number;
  offset: number;
}

export const executedQuerySummarySchema = z.object({
  datasetId: z.string().min(1),
  datasetVersionId: z.string().min(1),
  dashboardId: z.string().min(1).optional(),
  kind: z.enum(["aggregate", "table"]),
  filters: z.number().int().min(0),
  limit: z.number().int().min(1),
  offset: z.number().int().min(0)
}) satisfies z.ZodType<ExecutedQuerySummary>;

export const queryServiceAggregateResultSchema = z.object({
  rows: z.array(queryResultRowSchema),
  metadata: analyticalQueryMetadataSchema,
  columns: z.array(z.string()),
  errors: z.array(z.string()),
  executedQuerySummary: executedQuerySummarySchema,
  source: queryServiceSourceSchema
});
export type QueryServiceAggregateResult = z.infer<typeof queryServiceAggregateResultSchema>;

export const queryServiceTableResultSchema = z.object({
  rows: z.array(dataRowSchema),
  totalRows: z.number().int().min(0),
  filteredRows: z.number().int().min(0),
  metadata: analyticalQueryMetadataSchema,
  columns: z.array(z.string()),
  errors: z.array(z.string()),
  executedQuerySummary: executedQuerySummarySchema,
  source: queryServiceSourceSchema
});
export type QueryServiceTableResult = z.infer<typeof queryServiceTableResultSchema>;

export const queryServiceResponseSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("aggregate"),
    result: queryServiceAggregateResultSchema
  }),
  z.object({
    kind: z.literal("table"),
    result: queryServiceTableResultSchema
  })
]);
