import { z } from "zod";

const idSchema = z.string().min(1).max(160).regex(/^[a-z][a-z0-9_.:-]*$/);
const aliasSchema = z.string().min(1).max(120);
const statusSchema = z.enum(["draft", "approved", "deprecated"]);
const ownerSchema = z.object({
  type: z.enum(["system", "user", "team"]),
  id: z.string().min(1)
});

const definitionBaseSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  aliases: z.array(aliasSchema),
  description: z.string().min(1),
  owner: ownerSchema,
  status: statusSchema,
  inferred: z.boolean(),
  confidence: z.number().min(0).max(1),
  sourceColumnId: z.string().optional(),
  sourceColumnDisplayName: z.string().optional(),
  approvedAt: z.string().optional(),
  deprecatedAt: z.string().optional()
});

export const metricDefinitionSchema = definitionBaseSchema.extend({
  entityType: z.literal("metric"),
  aggregation: z.enum(["sum", "avg", "count", "count_distinct", "min", "max"]),
  unit: z.enum(["count", "currency", "percentage", "seconds", "days", "units", "unknown"]),
  format: z.enum(["number", "currency", "percentage", "integer", "date", "text"]),
  nullPolicy: z.enum(["exclude", "include_as_zero", "count_as_value", "error"]),
  formula: z.string(),
  metricRole: z.enum(["revenue", "margin", "cost", "quantity", "percentage", "measure", "unknown"])
});

export const calculatedMetricSchema = definitionBaseSchema.extend({
  entityType: z.literal("calculated_metric"),
  aggregation: z.enum(["sum", "avg", "count", "count_distinct", "min", "max"]),
  unit: z.enum(["count", "currency", "percentage", "seconds", "days", "units", "unknown"]),
  format: z.enum(["number", "currency", "percentage", "integer", "date", "text"]),
  nullPolicy: z.enum(["exclude", "include_as_zero", "count_as_value", "error"]),
  formula: z.string().min(1),
  operandMetricIds: z.array(idSchema).min(1)
});

export const dimensionDefinitionSchema = definitionBaseSchema.extend({
  entityType: z.literal("dimension"),
  dimensionRole: z.enum(["geography", "client", "seller", "product", "category", "channel", "identifier", "time", "breakdown", "unknown"]),
  geoRole: z.enum(["region", "country", "city", "zone", "commune", "territory", "unknown"]).optional()
});

export const timeDimensionSchema = definitionBaseSchema.extend({
  entityType: z.literal("time_dimension"),
  defaultGranularity: z.enum(["day", "week", "month", "quarter", "year"]),
  timezone: z.string().min(1)
});

export const relationshipSchema = z.object({
  id: idSchema,
  entityType: z.literal("relationship"),
  name: z.string().min(1),
  description: z.string().min(1),
  leftDimensionId: idSchema,
  rightDimensionId: idSchema,
  cardinality: z.enum(["one_to_one", "one_to_many", "many_to_one", "many_to_many"]),
  status: statusSchema,
  owner: ownerSchema,
  validatedAt: z.string().optional()
});

export const semanticModelSchema = z.object({
  id: idSchema,
  datasetId: z.string().min(1),
  datasetVersionId: z.string().optional(),
  schemaFingerprint: z.string().min(1),
  status: statusSchema,
  metrics: z.array(metricDefinitionSchema),
  calculatedMetrics: z.array(calculatedMetricSchema),
  dimensions: z.array(dimensionDefinitionSchema),
  timeDimensions: z.array(timeDimensionSchema),
  relationships: z.array(relationshipSchema),
  createdAt: z.string(),
  updatedAt: z.string()
});
