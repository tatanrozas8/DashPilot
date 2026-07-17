import type { DashboardSpec, DashboardWidget } from "@/types/dashboard";
import type { DatasetColumnProfile, DatasetProfile, DimensionRole, GeoRole, MetricRole } from "@/types/dataset";
import type {
  CalculatedMetric,
  DimensionDefinition,
  MetricDefinition,
  Relationship,
  SemanticAggregation,
  SemanticDefinitionStatus,
  SemanticEntityType,
  SemanticFormat,
  SemanticModel,
  SemanticModelBuildOptions,
  SemanticModelValidationIssue,
  SemanticModelValidationResult,
  SemanticNullPolicy,
  SemanticOwner,
  SemanticResolutionCandidate,
  SemanticResolutionResult,
  SemanticSchemaCompatibility,
  SemanticUnit,
  TimeDimension
} from "@/types/semantic-model";
import { buildDatasetCatalog } from "@/lib/semantic-layer/dataset-catalog";
import { slugify } from "@/lib/utils";
import { semanticModelSchema } from "@/lib/semantic-model/schemas";

const DEFAULT_OWNER: SemanticOwner = { type: "system", id: "dashpilot-semantic-inference" };
const DEFAULT_THRESHOLD = 0.72;
const AMBIGUITY_GAP = 0.08;

function nowIso(options: SemanticModelBuildOptions) {
  return (options.now ?? new Date()).toISOString();
}

function normalize(value: string) {
  return slugify(value);
}

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function stableId(parts: string[]) {
  return parts.map(normalize).filter(Boolean).join(".");
}

function schemaFingerprint(profile: DatasetProfile) {
  return profile.columns
    .map((column) => `${column.normalizedName}:${column.inferredType}:${column.semanticType}:${column.geoRole ?? ""}`)
    .sort()
    .join("|");
}

function aliasesFor(column: DatasetColumnProfile, extras: string[]) {
  return unique([
    column.normalizedName,
    column.originalName,
    column.displayName,
    ...(column.synonyms ?? []),
    ...column.normalizedName.split("_"),
    ...extras
  ]).flatMap((alias) => unique([alias, normalize(alias), normalize(alias).replace(/_/g, " ")]));
}

function metricUnit(column: DatasetColumnProfile, role: MetricRole): SemanticUnit {
  if (column.inferredType === "currency" || role === "revenue" || role === "cost") return "currency";
  if (column.inferredType === "percentage" || role === "margin" || role === "percentage") return "percentage";
  if (role === "quantity") return "units";
  return "unknown";
}

function metricFormat(unit: SemanticUnit, column: DatasetColumnProfile): SemanticFormat {
  if (unit === "currency") return "currency";
  if (unit === "percentage" || column.inferredType === "percentage") return "percentage";
  if (column.inferredType === "number") return "number";
  return "number";
}

function metricAggregation(role: MetricRole, column: DatasetColumnProfile): SemanticAggregation {
  if (role === "margin" || role === "percentage" || column.inferredType === "percentage") return "avg";
  return "sum";
}

function nullPolicyForAggregation(aggregation: SemanticAggregation): SemanticNullPolicy {
  return aggregation === "count" ? "count_as_value" : "exclude";
}

function canonicalMetricId(column: DatasetColumnProfile, role: MetricRole) {
  if (role !== "unknown" && role !== "measure") return stableId(["metric", role]);
  return stableId(["metric", column.normalizedName]);
}

function canonicalDimensionId(column: DatasetColumnProfile, role: DimensionRole, geoRole?: GeoRole) {
  if (role === "geography" && geoRole && geoRole !== "unknown") return stableId(["dimension", "geo", geoRole]);
  if (role !== "unknown" && role !== "breakdown") return stableId(["dimension", role]);
  return stableId(["dimension", column.normalizedName]);
}

function dedupeId<T extends { id: string }>(definition: T, existing: Set<string>) {
  if (!existing.has(definition.id)) {
    existing.add(definition.id);
    return definition;
  }
  let suffix = 2;
  let nextId = `${definition.id}:${suffix}`;
  while (existing.has(nextId)) {
    suffix += 1;
    nextId = `${definition.id}:${suffix}`;
  }
  existing.add(nextId);
  return { ...definition, id: nextId };
}

export function buildSemanticModel(profile: DatasetProfile, options: SemanticModelBuildOptions = {}): SemanticModel {
  const catalog = buildDatasetCatalog(profile);
  const owner = options.owner ?? DEFAULT_OWNER;
  const status = options.status ?? "draft";
  const createdAt = nowIso(options);
  const existingIds = new Set<string>();

  const metrics = catalog.metrics.map<MetricDefinition>((column) => {
    const profileColumn = profile.columns.find((item) => item.normalizedName === column.normalizedName)!;
    const metricRole = column.metricRole ?? "unknown";
    const aggregation = metricAggregation(metricRole, profileColumn);
    const unit = metricUnit(profileColumn, metricRole);
    const definition: MetricDefinition = {
      id: canonicalMetricId(profileColumn, metricRole),
      entityType: "metric",
      name: column.displayName,
      aliases: aliasesFor(profileColumn, [metricRole]),
      description: `Metrica inferida desde la columna ${column.displayName}.`,
      owner,
      status,
      inferred: true,
      confidence: column.confidence,
      sourceColumnId: column.normalizedName,
      sourceColumnDisplayName: column.displayName,
      aggregation,
      unit,
      format: metricFormat(unit, profileColumn),
      nullPolicy: nullPolicyForAggregation(aggregation),
      formula: column.normalizedName,
      metricRole
    };
    return dedupeId(definition, existingIds);
  });

  const dimensions = catalog.dimensions.map<DimensionDefinition>((column) => {
    const profileColumn = profile.columns.find((item) => item.normalizedName === column.normalizedName)!;
    const dimensionRole = column.dimensionRole ?? "unknown";
    const definition: DimensionDefinition = {
      id: canonicalDimensionId(profileColumn, dimensionRole, column.geoRole),
      entityType: "dimension",
      name: column.displayName,
      aliases: aliasesFor(profileColumn, [dimensionRole, column.geoRole ?? ""]),
      description: `Dimension inferida desde la columna ${column.displayName}.`,
      owner,
      status,
      inferred: true,
      confidence: column.confidence,
      sourceColumnId: column.normalizedName,
      sourceColumnDisplayName: column.displayName,
      dimensionRole,
      geoRole: column.geoRole
    };
    return dedupeId(definition, existingIds);
  });

  const timeDimensions = catalog.dates.map<TimeDimension>((column) => {
    const profileColumn = profile.columns.find((item) => item.normalizedName === column.normalizedName)!;
    const definition: TimeDimension = {
      id: stableId(["time", column.dimensionRole === "time" ? "primary" : profileColumn.normalizedName]),
      entityType: "time_dimension",
      name: column.displayName,
      aliases: aliasesFor(profileColumn, ["fecha", "date", "periodo", "time"]),
      description: `Dimension temporal inferida desde la columna ${column.displayName}.`,
      owner,
      status,
      inferred: true,
      confidence: column.confidence,
      sourceColumnId: column.normalizedName,
      sourceColumnDisplayName: column.displayName,
      defaultGranularity: "month",
      timezone: "UTC"
    };
    return dedupeId(definition, existingIds);
  });

  const model: SemanticModel = {
    id: stableId(["semantic_model", profile.id, profile.datasetVersionId ?? "draft"]),
    datasetId: profile.id,
    datasetVersionId: profile.datasetVersionId,
    schemaFingerprint: schemaFingerprint(profile),
    status,
    metrics,
    calculatedMetrics: [],
    dimensions,
    timeDimensions,
    relationships: [],
    createdAt,
    updatedAt: createdAt
  };
  return semanticModelSchema.parse(model);
}

function definitionText(definition: { id: string; name: string; aliases: string[]; sourceColumnId?: string }) {
  return [definition.id, definition.name, definition.sourceColumnId, ...definition.aliases].map((value) => normalize(value ?? "")).filter(Boolean);
}

function scoreDefinition(requestedText: string, definition: { id: string; name: string; aliases: string[]; sourceColumnId?: string; confidence: number; status: SemanticDefinitionStatus }) {
  const requested = normalize(requestedText);
  const names = definitionText(definition);
  const reasons: string[] = [];
  let score = 0;

  if (names.includes(requested)) {
    score = 1;
    reasons.push("Coincidencia exacta por ID, nombre, columna o alias canonico.");
  } else if (names.some((name) => requested.includes(name) || name.includes(requested))) {
    const requestedTokens = requested.split("_").filter((token) => token.length > 1);
    const matchedTokens = requestedTokens.filter((token) => names.some((name) => name.split("_").includes(token) || name.includes(token))).length;
    const coverage = matchedTokens / Math.max(1, requestedTokens.length);
    score = coverage >= 0.75 ? 0.84 : 0.58 * coverage;
    reasons.push(coverage >= 0.75 ? "Coincidencia parcial por nombre o alias." : "Coincidencia debil con tokens extra no reconocidos.");
  } else {
    const requestedTokens = requested.split("_").filter((token) => token.length > 1);
    const overlap = names.reduce((best, name) => {
      const tokens = new Set(name.split("_").filter((token) => token.length > 1));
      const matched = requestedTokens.filter((token) => tokens.has(token) || name.includes(token)).length;
      return Math.max(best, matched / Math.max(1, requestedTokens.length));
    }, 0);
    if (overlap >= 0.5) {
      score = overlap * 0.68;
      reasons.push("Coincidencia semantica por tokens compartidos.");
    }
  }

  if (definition.status === "approved") score += 0.04;
  if (definition.status === "deprecated") score -= 0.3;
  score += definition.confidence * 0.06;
  return { score: Math.max(0, Math.min(0.99, Number(score.toFixed(2)))), reasons };
}

function candidatesFor(model: SemanticModel, entityType: SemanticEntityType) {
  if (entityType === "metric") return model.metrics;
  if (entityType === "calculated_metric") return model.calculatedMetrics;
  if (entityType === "dimension") return model.dimensions;
  if (entityType === "time_dimension") return model.timeDimensions;
  return model.relationships.map((relationship) => ({
    ...relationship,
    aliases: [relationship.id, relationship.name],
    confidence: relationship.status === "approved" ? 0.9 : 0.5,
    sourceColumnId: undefined
  }));
}

function candidateFromDefinition(definition: MetricDefinition | DimensionDefinition | TimeDimension | CalculatedMetric, entityType: SemanticEntityType): SemanticResolutionCandidate {
  return {
    id: definition.id,
    entityType,
    name: definition.name,
    score: 1,
    reasons: ["Referencia directa por columna fuente."],
    status: definition.status,
    sourceColumnId: definition.sourceColumnId
  };
}

export function resolveSemanticReference(input: {
  model: SemanticModel;
  requestedText: string;
  entityType: SemanticEntityType;
  threshold?: number;
}): SemanticResolutionResult {
  const threshold = input.threshold ?? DEFAULT_THRESHOLD;
  const candidates = candidatesFor(input.model, input.entityType)
    .map<SemanticResolutionCandidate>((definition) => {
      const scored = scoreDefinition(input.requestedText, definition);
      return {
        id: definition.id,
        entityType: input.entityType,
        name: definition.name,
        score: scored.score,
        reasons: scored.reasons,
        status: definition.status,
        sourceColumnId: definition.sourceColumnId
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  const selected = candidates[0];
  const ambiguous = Boolean(selected && candidates[1] && selected.score - candidates[1].score < AMBIGUITY_GAP && candidates[1].score >= threshold - 0.05);
  const needsClarification = !selected || selected.score < threshold || ambiguous;
  return {
    requestedText: input.requestedText,
    entityType: input.entityType,
    candidates: candidates.slice(0, 5),
    selected: needsClarification ? undefined : selected,
    score: selected?.score ?? 0,
    reasons: selected?.reasons ?? [`No hay definicion canonica para "${input.requestedText}".`],
    needsClarification,
    clarification: needsClarification ? `Necesito confirmar a que ${input.entityType} te refieres: ${candidates.slice(0, 3).map((candidate) => candidate.name).join(", ") || "sin candidatos"}.` : undefined
  };
}

export function approveSemanticDefinition<T extends { status: SemanticDefinitionStatus; approvedAt?: string }>(definition: T, at = new Date().toISOString()): T {
  return { ...definition, status: "approved", approvedAt: at };
}

export function createCalculatedMetric(input: {
  id: string;
  name: string;
  description: string;
  formula: string;
  operandMetricIds: string[];
  owner?: SemanticOwner;
  status?: SemanticDefinitionStatus;
  unit?: SemanticUnit;
  format?: SemanticFormat;
  nullPolicy?: SemanticNullPolicy;
  aggregation?: SemanticAggregation;
  aliases?: string[];
}): CalculatedMetric {
  return {
    id: stableId(["metric", input.id]),
    entityType: "calculated_metric",
    name: input.name,
    aliases: unique([...(input.aliases ?? []), input.id, input.name]),
    description: input.description,
    owner: input.owner ?? DEFAULT_OWNER,
    status: input.status ?? "draft",
    inferred: false,
    confidence: 1,
    aggregation: input.aggregation ?? "avg",
    unit: input.unit ?? "unknown",
    format: input.format ?? "number",
    nullPolicy: input.nullPolicy ?? "exclude",
    formula: input.formula,
    operandMetricIds: input.operandMetricIds
  };
}

function allMetricIds(model: SemanticModel) {
  return new Set([...model.metrics.map((metric) => metric.id), ...model.calculatedMetrics.map((metric) => metric.id)]);
}

function calculatedMetricIssues(model: SemanticModel): SemanticModelValidationIssue[] {
  const ids = allMetricIds(model);
  const graph = new Map(model.calculatedMetrics.map((metric) => [metric.id, metric.operandMetricIds.filter((id) => model.calculatedMetrics.some((item) => item.id === id))]));
  const issues: SemanticModelValidationIssue[] = [];
  for (const metric of model.calculatedMetrics) {
    const missing = metric.operandMetricIds.find((id) => !ids.has(id));
    if (missing) issues.push({ code: "unknown_metric", id: metric.id, message: `La metrica calculada ${metric.id} referencia ${missing}, que no existe.` });
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, path: string[]): void => {
    if (visiting.has(id)) {
      issues.push({ code: "cycle", id, message: `Ciclo en metricas calculadas: ${[...path, id].join(" -> ")}.` });
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of graph.get(id) ?? []) visit(next, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) visit(id, []);
  return issues;
}

function relationshipIssues(model: SemanticModel): SemanticModelValidationIssue[] {
  const dimensionIds = new Set(model.dimensions.map((dimension) => dimension.id));
  return model.relationships.flatMap((relationship) => {
    const issues: SemanticModelValidationIssue[] = [];
    if (!dimensionIds.has(relationship.leftDimensionId) || !dimensionIds.has(relationship.rightDimensionId)) {
      issues.push({ code: "invalid_relationship", id: relationship.id, message: `La relacion ${relationship.id} referencia dimensiones inexistentes.` });
    }
    if (relationship.status !== "approved" || !relationship.validatedAt) {
      issues.push({ code: "unapproved_relationship", id: relationship.id, message: `La relacion ${relationship.id} no fue validada explicitamente.` });
    }
    if (relationship.cardinality === "many_to_many") {
      issues.push({ code: "invalid_relationship", id: relationship.id, message: `La relacion ${relationship.id} many_to_many requiere una tabla puente validada.` });
    }
    return issues;
  });
}

export function validateSemanticModel(model: SemanticModel, profile?: DatasetProfile): SemanticModelValidationResult {
  const columnIds = new Set(profile?.columns.map((column) => column.normalizedName) ?? []);
  const sourceDefinitions = [...model.metrics, ...model.dimensions, ...model.timeDimensions].filter((definition) => definition.sourceColumnId);
  const columnIssues: SemanticModelValidationIssue[] = profile
    ? sourceDefinitions
        .filter((definition) => definition.sourceColumnId && !columnIds.has(definition.sourceColumnId))
        .map((definition) => ({ code: "unknown_column", id: definition.id, message: `La definicion ${definition.id} referencia una columna ausente: ${definition.sourceColumnId}.` }))
    : [];
  const deprecatedIssues = [...model.metrics, ...model.calculatedMetrics, ...model.dimensions, ...model.timeDimensions]
    .filter((definition) => definition.status === "deprecated")
    .map<SemanticModelValidationIssue>((definition) => ({ code: "deprecated_reference", id: definition.id, message: `La definicion ${definition.id} esta deprecada.` }));
  const issues = [...columnIssues, ...deprecatedIssues, ...calculatedMetricIssues(model), ...relationshipIssues(model)];
  return { valid: issues.length === 0, issues };
}

function matchColumnForDefinition(definition: { sourceColumnId?: string; aliases: string[]; name: string }, profile: DatasetProfile) {
  if (definition.sourceColumnId && profile.columns.some((column) => column.normalizedName === definition.sourceColumnId)) return definition.sourceColumnId;
  const aliases = new Set([definition.name, ...definition.aliases].map(normalize));
  return profile.columns.find((column) => {
    const names = [column.normalizedName, column.originalName, column.displayName, ...(column.synonyms ?? [])].map(normalize);
    return names.some((name) => aliases.has(name));
  })?.normalizedName;
}

export function reconcileSemanticModelWithProfile(model: SemanticModel, profile: DatasetProfile) {
  const remappedColumns: SemanticSchemaCompatibility["remappedColumns"] = [];
  const remap = <T extends { id: string; sourceColumnId?: string; aliases: string[]; name: string }>(definition: T): T => {
    const nextColumnId = matchColumnForDefinition(definition, profile);
    if (!nextColumnId || nextColumnId === definition.sourceColumnId) return definition;
    remappedColumns.push({ definitionId: definition.id, previousColumnId: definition.sourceColumnId ?? "", nextColumnId });
    return { ...definition, sourceColumnId: nextColumnId };
  };
  const nextModel = {
    ...model,
    datasetVersionId: profile.datasetVersionId,
    schemaFingerprint: schemaFingerprint(profile),
    metrics: model.metrics.map(remap),
    dimensions: model.dimensions.map(remap),
    timeDimensions: model.timeDimensions.map(remap),
    updatedAt: new Date().toISOString()
  };
  const validation = validateSemanticModel(nextModel, profile);
  const compatibility: SemanticSchemaCompatibility = {
    compatible: validation.valid,
    missingSourceColumns: validation.issues.filter((issue) => issue.code === "unknown_column").map((issue) => issue.message),
    unresolvedDefinitionIds: validation.issues.map((issue) => issue.id).filter((id): id is string => Boolean(id)),
    remappedColumns
  };
  return { model: semanticModelSchema.parse(nextModel), compatibility };
}

function metricByField(model: SemanticModel, field?: string) {
  if (!field) return undefined;
  const direct = model.metrics.find((metric) => metric.sourceColumnId === field);
  return direct ? candidateFromDefinition(direct, "metric") : resolveSemanticReference({ model, requestedText: field, entityType: "metric" }).selected;
}

function metricByIdOrField(model: SemanticModel, id?: string, field?: string) {
  const byId = id ? model.metrics.find((metric) => metric.id === id) : undefined;
  return byId ? candidateFromDefinition(byId, "metric") : metricByField(model, field);
}

function dimensionByField(model: SemanticModel, field?: string) {
  if (!field) return undefined;
  const direct = model.dimensions.find((dimension) => dimension.sourceColumnId === field);
  return direct ? candidateFromDefinition(direct, "dimension") : resolveSemanticReference({ model, requestedText: field, entityType: "dimension" }).selected;
}

function dimensionByIdOrField(model: SemanticModel, id?: string, field?: string) {
  const byId = id ? model.dimensions.find((dimension) => dimension.id === id) : undefined;
  return byId ? candidateFromDefinition(byId, "dimension") : dimensionByField(model, field);
}

function timeByField(model: SemanticModel, field?: string) {
  if (!field) return undefined;
  const direct = model.timeDimensions.find((dimension) => dimension.sourceColumnId === field);
  return direct ? candidateFromDefinition(direct, "time_dimension") : resolveSemanticReference({ model, requestedText: field, entityType: "time_dimension" }).selected;
}

function timeByIdOrField(model: SemanticModel, id?: string, field?: string) {
  const byId = id ? model.timeDimensions.find((dimension) => dimension.id === id) : undefined;
  return byId ? candidateFromDefinition(byId, "time_dimension") : timeByField(model, field);
}

export function migrateDashboardSpecToSemanticModel(input: { dashboardSpec: DashboardSpec; semanticModel: SemanticModel; now?: Date }) {
  const migratedAt = (input.now ?? new Date()).toISOString();
  const widgets = input.dashboardSpec.widgets.map((widget): DashboardWidget => {
    const metric = metricByIdOrField(input.semanticModel, widget.query?.metricId, widget.query?.metric?.field);
    const dimensions = (widget.query?.groupBy ?? []).map((field, index) => dimensionByIdOrField(input.semanticModel, widget.query?.dimensionIds?.[index], field)).filter((candidate): candidate is SemanticResolutionCandidate => Boolean(candidate));
    const timeDimension = timeByIdOrField(input.semanticModel, widget.query?.timeDimensionId, widget.query?.x?.field);
    const metricDefinition = metric ? input.semanticModel.metrics.find((item) => item.id === metric.id) : undefined;
    const dimensionDefinitions = dimensions.map((candidate) => input.semanticModel.dimensions.find((item) => item.id === candidate.id)).filter((item): item is DimensionDefinition => Boolean(item));
    const timeDefinition = timeDimension ? input.semanticModel.timeDimensions.find((item) => item.id === timeDimension.id) : undefined;
    const sourceColumnIds = unique([
      metricDefinition?.sourceColumnId,
      ...dimensionDefinitions.map((definition) => definition.sourceColumnId),
      timeDefinition?.sourceColumnId
    ].filter((field): field is string => Boolean(field)));
    const query = widget.query
      ? {
          ...widget.query,
          metric: widget.query.metric && metricDefinition?.sourceColumnId ? { ...widget.query.metric, field: metricDefinition.sourceColumnId } : widget.query.metric,
          groupBy: dimensionDefinitions.length ? dimensionDefinitions.map((definition) => definition.sourceColumnId).filter((field): field is string => Boolean(field)) : widget.query.groupBy,
          x: widget.query.x && timeDefinition?.sourceColumnId ? { ...widget.query.x, field: timeDefinition.sourceColumnId } : widget.query.x,
          metricId: metric?.id ?? widget.query.metricId,
          dimensionIds: dimensions.length ? dimensions.map((dimension) => dimension.id) : widget.query.dimensionIds,
          timeDimensionId: timeDimension?.id ?? widget.query.timeDimensionId
        }
      : undefined;
    const warnings = widget.query && widget.type !== "insight_text" && !metric && widget.query.metric?.field
      ? [`No se pudo resolver ${widget.query.metric.field} contra el modelo semantico.`]
      : [];
    return {
      ...widget,
      query,
      lineage: {
        semanticModelId: input.semanticModel.id,
        datasetVersionId: input.semanticModel.datasetVersionId,
        metricIds: metric ? [metric.id] : [],
        calculatedMetricIds: [],
        dimensionIds: dimensions.map((dimension) => dimension.id),
        timeDimensionIds: timeDimension ? [timeDimension.id] : [],
        sourceColumnIds,
        filters: widget.query?.filters ?? [],
        migratedAt,
        warnings
      }
    };
  });

  return {
    dashboardSpec: {
      ...input.dashboardSpec,
      semanticModelId: input.semanticModel.id,
      datasetVersionId: input.semanticModel.datasetVersionId ?? input.dashboardSpec.datasetVersionId,
      widgets,
      updatedAt: migratedAt
    }
  };
}

export function explainWidgetLineage(widget: DashboardWidget, model: SemanticModel) {
  const metricIds = widget.lineage?.metricIds ?? [];
  const dimensionIds = widget.lineage?.dimensionIds ?? [];
  const timeDimensionIds = widget.lineage?.timeDimensionIds ?? [];
  const metrics = metricIds.map((id) => model.metrics.find((metric) => metric.id === id)).filter((metric): metric is MetricDefinition => Boolean(metric));
  const dimensions = dimensionIds.map((id) => model.dimensions.find((dimension) => dimension.id === id)).filter((dimension): dimension is DimensionDefinition => Boolean(dimension));
  const times = timeDimensionIds.map((id) => model.timeDimensions.find((dimension) => dimension.id === id)).filter((dimension): dimension is TimeDimension => Boolean(dimension));
  return {
    widgetId: widget.id,
    semanticModelId: widget.lineage?.semanticModelId,
    datasetVersionId: widget.lineage?.datasetVersionId,
    formulas: metrics.map((metric) => ({ id: metric.id, formula: metric.formula, aggregation: metric.aggregation, nullPolicy: metric.nullPolicy })),
    dimensions: dimensions.map((dimension) => ({ id: dimension.id, sourceColumnId: dimension.sourceColumnId })),
    timeDimensions: times.map((dimension) => ({ id: dimension.id, sourceColumnId: dimension.sourceColumnId, granularity: widget.query?.x?.granularity ?? dimension.defaultGranularity })),
    filters: widget.lineage?.filters ?? [],
    sourceColumnIds: widget.lineage?.sourceColumnIds ?? []
  };
}

export function addRelationship(model: SemanticModel, relationship: Relationship) {
  const nextModel = { ...model, relationships: [...model.relationships, relationship], updatedAt: new Date().toISOString() };
  return semanticModelSchema.parse(nextModel);
}
