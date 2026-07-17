import type { DashboardFilter, DashboardQuerySpec } from "@/types/dashboard";
import type { DatasetColumnProfile, DatasetProfile, DimensionRole, GeoRole, MetricRole } from "@/types/dataset";

export type SemanticDefinitionStatus = "draft" | "approved" | "deprecated";
export type SemanticOwnerType = "system" | "user" | "team";
export type SemanticAggregation = NonNullable<DashboardQuerySpec["metric"]>["aggregation"];
export type SemanticNullPolicy = "exclude" | "include_as_zero" | "count_as_value" | "error";
export type SemanticFormat = "number" | "currency" | "percentage" | "integer" | "date" | "text";
export type SemanticUnit = "count" | "currency" | "percentage" | "seconds" | "days" | "units" | "unknown";
export type RelationshipCardinality = "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many";
export type SemanticEntityType = "metric" | "dimension" | "calculated_metric" | "time_dimension" | "relationship";

export interface SemanticOwner {
  type: SemanticOwnerType;
  id: string;
}

export interface SemanticDefinitionBase {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  owner: SemanticOwner;
  status: SemanticDefinitionStatus;
  inferred: boolean;
  confidence: number;
  sourceColumnId?: string;
  sourceColumnDisplayName?: string;
  approvedAt?: string;
  deprecatedAt?: string;
}

export interface MetricDefinition extends SemanticDefinitionBase {
  entityType: "metric";
  aggregation: SemanticAggregation;
  unit: SemanticUnit;
  format: SemanticFormat;
  nullPolicy: SemanticNullPolicy;
  formula: string;
  metricRole: MetricRole;
}

export interface CalculatedMetric extends SemanticDefinitionBase {
  entityType: "calculated_metric";
  aggregation: SemanticAggregation;
  unit: SemanticUnit;
  format: SemanticFormat;
  nullPolicy: SemanticNullPolicy;
  formula: string;
  operandMetricIds: string[];
}

export interface DimensionDefinition extends SemanticDefinitionBase {
  entityType: "dimension";
  dimensionRole: DimensionRole;
  geoRole?: GeoRole;
}

export interface TimeDimension extends SemanticDefinitionBase {
  entityType: "time_dimension";
  defaultGranularity: NonNullable<NonNullable<DashboardQuerySpec["x"]>["granularity"]>;
  timezone: string;
}

export interface Relationship {
  id: string;
  entityType: "relationship";
  name: string;
  description: string;
  leftDimensionId: string;
  rightDimensionId: string;
  cardinality: RelationshipCardinality;
  status: SemanticDefinitionStatus;
  owner: SemanticOwner;
  validatedAt?: string;
}

export interface SemanticModel {
  id: string;
  datasetId: string;
  datasetVersionId?: string;
  schemaFingerprint: string;
  status: SemanticDefinitionStatus;
  metrics: MetricDefinition[];
  calculatedMetrics: CalculatedMetric[];
  dimensions: DimensionDefinition[];
  timeDimensions: TimeDimension[];
  relationships: Relationship[];
  createdAt: string;
  updatedAt: string;
}

export interface SemanticResolutionCandidate {
  id: string;
  entityType: SemanticEntityType;
  name: string;
  score: number;
  reasons: string[];
  status: SemanticDefinitionStatus;
  sourceColumnId?: string;
}

export interface SemanticResolutionResult {
  requestedText: string;
  entityType: SemanticEntityType;
  candidates: SemanticResolutionCandidate[];
  selected?: SemanticResolutionCandidate;
  score: number;
  reasons: string[];
  needsClarification: boolean;
  clarification?: string;
}

export interface SemanticModelValidationIssue {
  code: "unknown_column" | "unknown_metric" | "cycle" | "invalid_relationship" | "deprecated_reference" | "unapproved_relationship";
  message: string;
  id?: string;
}

export interface SemanticModelValidationResult {
  valid: boolean;
  issues: SemanticModelValidationIssue[];
}

export interface SemanticWidgetLineage {
  semanticModelId: string;
  datasetVersionId?: string;
  metricIds: string[];
  calculatedMetricIds: string[];
  dimensionIds: string[];
  timeDimensionIds: string[];
  sourceColumnIds: string[];
  filters: DashboardFilter[];
  migratedAt: string;
  warnings: string[];
}

export interface SemanticWidgetQueryReferences {
  metricId?: string;
  dimensionIds?: string[];
  timeDimensionId?: string;
}

export interface SemanticModelBuildOptions {
  now?: Date;
  owner?: SemanticOwner;
  status?: SemanticDefinitionStatus;
}

export interface SemanticSchemaCompatibility {
  compatible: boolean;
  missingSourceColumns: string[];
  unresolvedDefinitionIds: string[];
  remappedColumns: Array<{
    definitionId: string;
    previousColumnId: string;
    nextColumnId: string;
  }>;
}

export type SemanticColumn = Pick<DatasetColumnProfile, "normalizedName" | "originalName" | "displayName" | "inferredType" | "semanticType" | "geoRole" | "nullPercentage" | "uniqueCount" | "synonyms">;
export type SemanticProfileInput = Pick<DatasetProfile, "id" | "datasetVersionId" | "columns" | "rowCount" | "createdAt">;
