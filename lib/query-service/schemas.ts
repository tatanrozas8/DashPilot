import { z } from "zod";
import type { DatasetProfile } from "@/types/dataset";
import type { AnalyticalTableQuery, GovernedAnalyticalQuery } from "@/types/analytical-query";

const fieldNameSchema = z.string().trim().min(1).max(128).refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), {
  message: "El id de columna contiene caracteres de control no permitidos."
});

export const analyticalMetricSchema = z.object({
  field: fieldNameSchema,
  aggregation: z.enum(["sum", "avg", "count", "count_distinct", "min", "max"]),
  alias: fieldNameSchema.optional()
});

export const analyticalFilterSchema = z.object({
  field: fieldNameSchema,
  operator: z.enum(["eq", "neq", "contains", "gt", "lt", "gte", "lte", "in", "between", "range"]),
  value: z.unknown()
});

export const governedAnalyticalQuerySchema = z.object({
  datasetVersionId: z.string().min(1),
  metrics: z.array(analyticalMetricSchema).min(1).max(4),
  dimensions: z.array(fieldNameSchema).max(3).default([]),
  timeDimension: z.object({
    field: fieldNameSchema,
    granularity: z.enum(["day", "week", "month", "quarter", "year"])
  }).optional(),
  filters: z.array(analyticalFilterSchema).max(12).default([]),
  orderBy: z.object({
    field: z.union([z.literal("label"), z.literal("value"), fieldNameSchema]),
    direction: z.enum(["asc", "desc"])
  }).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).max(100_000).default(0)
});

export const analyticalTableQuerySchema = z.object({
  datasetVersionId: z.string().min(1),
  columns: z.array(fieldNameSchema).min(1).max(50),
  filters: z.array(analyticalFilterSchema).max(12).default([]),
  search: z.string().max(200).optional(),
  columnSearch: z.object({
    field: fieldNameSchema,
    query: z.string().max(200)
  }).optional(),
  orderBy: z.object({
    field: fieldNameSchema,
    direction: z.enum(["asc", "desc"])
  }).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).max(100_000).default(0)
});

const analyticalDatasetVersionPointerSchema = z.object({
  datasetVersionId: z.string().min(1)
});

function assertFieldsAllowed(fields: string[], profile: DatasetProfile) {
  const allowedColumns = new Set(profile.columns.map((column) => column.normalizedName));
  const unknown = fields.find((field) => !allowedColumns.has(field));
  if (unknown) throw new Error(`La consulta referencia una columna no permitida: ${unknown}.`);
}

export function assertQueryFieldsAllowed(query: GovernedAnalyticalQuery, profile: DatasetProfile) {
  assertFieldsAllowed([
    ...query.metrics.map((metric) => metric.field),
    ...query.dimensions,
    ...(query.timeDimension ? [query.timeDimension.field] : []),
    ...query.filters.map((filter) => filter.field),
    ...(query.orderBy && query.orderBy.field !== "label" && query.orderBy.field !== "value" ? [query.orderBy.field] : [])
  ], profile);
}

export function parseDatasetVersionPointer(input: unknown) {
  return analyticalDatasetVersionPointerSchema.parse(input);
}

export function parseGovernedAnalyticalQuery(input: unknown, profile: DatasetProfile) {
  const query = governedAnalyticalQuerySchema.parse(input);
  assertQueryFieldsAllowed(query, profile);
  return query;
}

export function parseAnalyticalTableQuery(input: unknown, profile: DatasetProfile): AnalyticalTableQuery {
  const query = analyticalTableQuerySchema.parse(input);
  assertFieldsAllowed([
    ...query.columns,
    ...query.filters.map((filter) => filter.field),
    ...(query.columnSearch ? [query.columnSearch.field] : []),
    ...(query.orderBy ? [query.orderBy.field] : [])
  ], profile);
  return query;
}
