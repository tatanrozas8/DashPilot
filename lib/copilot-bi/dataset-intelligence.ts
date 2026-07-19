import type { DatasetCatalogColumn, DatasetColumnProfile, DatasetProfile } from "@/types/dataset";
import type { SemanticLayer } from "@/lib/semantic-layer";
import { buildDatasetCatalog } from "@/lib/semantic-layer";
import type { DatasetFieldCandidate, DatasetIntelligence } from "@/lib/copilot-bi/types";

function coverage(column: DatasetColumnProfile, profile: DatasetProfile) {
  if (profile.rowCount <= 0) return 1;
  return Number(Math.max(0, Math.min(1, 1 - column.nullCount / profile.rowCount)).toFixed(4));
}

function warningsFor(column: DatasetColumnProfile, profile: DatasetProfile) {
  const warnings: string[] = [];
  if (column.nullPercentage >= 40) warnings.push(`Baja cobertura: ${Math.round(100 - column.nullPercentage)}%.`);
  if (column.uniqueCount > Math.max(50, profile.rowCount * 0.7) && ["dimension", "category", "identifier"].includes(column.semanticType)) {
    warnings.push("Alta cardinalidad; usar con limite o tabla.");
  }
  if (column.parseWarnings?.length) warnings.push(...column.parseWarnings.slice(0, 2));
  return warnings;
}

function candidate(column: DatasetColumnProfile, profile: DatasetProfile, catalogColumn?: DatasetCatalogColumn): DatasetFieldCandidate {
  const semanticConfidence = column.semanticConfidence ?? catalogColumn?.confidence ?? 0.55;
  const qualityPenalty = column.nullPercentage >= 40 ? 0.18 : column.nullPercentage >= 20 ? 0.08 : 0;
  return {
    field: column.normalizedName,
    label: column.displayName || column.originalName || column.normalizedName,
    role: String(catalogColumn?.role ?? column.semanticType),
    confidence: Math.max(0, Math.min(0.99, Number((semanticConfidence - qualityPenalty).toFixed(2)))),
    coverage: coverage(column, profile),
    uniqueCount: column.uniqueCount,
    nullPercentage: column.nullPercentage,
    warnings: warningsFor(column, profile),
    column,
    catalogColumn
  };
}

function byCatalog(profile: DatasetProfile, columns: DatasetCatalogColumn[]) {
  return columns
    .map((catalogColumn) => {
      const column = profile.columns.find((item) => item.normalizedName === catalogColumn.normalizedName);
      return column ? candidate(column, profile, catalogColumn) : undefined;
    })
    .filter((item): item is DatasetFieldCandidate => Boolean(item))
    .sort((left, right) => right.confidence - left.confidence || right.coverage - left.coverage);
}

function byFields(profile: DatasetProfile, fields: string[]) {
  return fields
    .map((field) => profile.columns.find((column) => column.normalizedName === field))
    .filter((column): column is DatasetColumnProfile => Boolean(column))
    .map((column) => candidate(column, profile))
    .sort((left, right) => right.confidence - left.confidence || right.coverage - left.coverage);
}

function uniqueCandidates(candidates: DatasetFieldCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((item) => {
    if (seen.has(item.field)) return false;
    seen.add(item.field);
    return true;
  });
}

export function buildDatasetIntelligence(profile: DatasetProfile, semanticModel: SemanticLayer): DatasetIntelligence {
  const catalog = buildDatasetCatalog(profile);
  const metrics = uniqueCandidates([
    ...byCatalog(profile, catalog.metrics),
    ...byFields(profile, profile.detectedMetricColumns),
    ...byFields(profile, semanticModel.metrics.map((field) => field.field)),
    ...byFields(profile, semanticModel.revenueMetrics.map((field) => field.field))
  ]);
  const dimensions = uniqueCandidates([
    ...byCatalog(profile, catalog.dimensions),
    ...byCatalog(profile, catalog.breakdowns),
    ...byFields(profile, profile.detectedDimensionColumns),
    ...byFields(profile, semanticModel.dimensions.map((field) => field.field))
  ]);
  const dates = uniqueCandidates([
    ...byCatalog(profile, catalog.dates),
    ...byFields(profile, profile.detectedDateColumns),
    ...byFields(profile, semanticModel.dates.map((field) => field.field))
  ]);
  const geographies = uniqueCandidates([
    ...byCatalog(profile, catalog.geographies),
    ...byFields(profile, profile.detectedGeoColumns),
    ...byFields(profile, semanticModel.geographies.map((field) => field.field))
  ]);
  const filters = uniqueCandidates(byCatalog(profile, catalog.filters).filter((item) => item.uniqueCount <= Math.max(2, profile.rowCount * 0.9)));
  const monetaryMetrics = metrics.filter((item) => item.column.inferredType === "currency" || ["revenue", "cost", "margin"].includes(item.role));
  const percentageMetrics = metrics.filter((item) => item.column.inferredType === "percentage" || item.role === "percentage" || item.role === "margin");
  const safeColumnSamples = profile.columns
    .filter((column) => !column.isHidden)
    .slice(0, 20)
    .map((column) => ({ field: column.normalizedName, label: column.displayName, values: column.sampleValues.slice(0, 5) }));
  const qualityWarnings = [
    ...profile.qualityWarnings,
    ...profile.columns.flatMap((column) => warningsFor(column, profile).map((warning) => `${column.displayName}: ${warning}`))
  ].slice(0, 12);

  return {
    profile,
    catalog,
    semanticModel,
    metrics,
    dimensions,
    dates,
    geographies,
    filters,
    monetaryMetrics,
    percentageMetrics,
    primaryMetric: metrics.find((item) => item.field === semanticModel.primaryMetric?.field) ?? metrics[0],
    primaryDimension: dimensions.find((item) => item.field === semanticModel.primaryDimension?.field) ?? geographies[0] ?? dimensions[0],
    primaryDate: dates.find((item) => item.field === semanticModel.primaryDate?.field) ?? dates[0],
    qualityWarnings,
    safeColumnSamples
  };
}
