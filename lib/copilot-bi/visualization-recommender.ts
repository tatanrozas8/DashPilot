import type { DatasetFieldCandidate, DatasetIntelligence, BusinessIntentResolution, VisualizationRecommendation } from "@/lib/copilot-bi/types";
import type { WidgetType } from "@/types/dashboard";

function formatFor(metric?: DatasetFieldCandidate) {
  if (!metric) return "number";
  if (metric.column.inferredType === "currency" || ["revenue", "cost"].includes(metric.role)) return "currency";
  if (metric.column.inferredType === "percentage" || metric.role === "margin") return "percentage";
  return "number";
}

function metricLabel(metric?: DatasetFieldCandidate) {
  return metric?.label ?? "Registros";
}

function dimensionLabel(dimension?: DatasetFieldCandidate) {
  return dimension?.label ?? "Dimension";
}

function chooseDimension(intelligence: DatasetIntelligence, requested: string[] = []) {
  if (requested.includes("geography")) return intelligence.geographies[0] ?? intelligence.primaryDimension;
  if (requested.includes("channel")) return intelligence.catalog.channels[0] ? intelligence.dimensions.find((item) => item.field === intelligence.catalog.channels[0].normalizedName) : intelligence.primaryDimension;
  if (requested.includes("client")) return intelligence.catalog.clients[0] ? intelligence.dimensions.find((item) => item.field === intelligence.catalog.clients[0].normalizedName) : intelligence.primaryDimension;
  if (requested.includes("product")) return intelligence.catalog.products[0] ? intelligence.dimensions.find((item) => item.field === intelligence.catalog.products[0].normalizedName) : intelligence.primaryDimension;
  if (requested.includes("seller")) return intelligence.catalog.sellers[0] ? intelligence.dimensions.find((item) => item.field === intelligence.catalog.sellers[0].normalizedName) : intelligence.primaryDimension;
  return intelligence.primaryDimension;
}

function recommendation(input: {
  type: WidgetType;
  metric?: DatasetFieldCandidate;
  dimension?: DatasetFieldCandidate;
  date?: DatasetFieldCandidate;
  series?: DatasetFieldCandidate;
  title: string;
  reason: string;
  limit?: number;
}): VisualizationRecommendation {
  const query = input.type === "kpi_card"
    ? input.metric ? { metric: { field: input.metric.field, aggregation: input.metric.role === "margin" ? "avg" as const : "sum" as const } } : undefined
    : input.type === "line_chart" && input.metric && input.date
      ? { metric: { field: input.metric.field, aggregation: "sum" as const }, x: { field: input.date.field, granularity: "month" as const }, ...(input.series ? { groupBy: [input.series.field], seriesBy: input.series.field, limit: input.limit ?? 8 } : {}) }
      : input.metric && input.dimension
        ? { metric: { field: input.metric.field, aggregation: input.metric.role === "margin" ? "avg" as const : "sum" as const }, groupBy: [input.dimension.field], orderBy: { field: "value" as const, direction: "desc" as const }, limit: input.limit ?? 10 }
        : undefined;
  return { ...input, query };
}

export function recommendVisualizations(intent: BusinessIntentResolution, intelligence: DatasetIntelligence): VisualizationRecommendation[] {
  const metric = intent.requestedMetric === "margin"
    ? intelligence.percentageMetrics[0] ?? intelligence.metrics.find((item) => item.role === "margin") ?? intelligence.primaryMetric
    : intelligence.primaryMetric;
  const dimension = chooseDimension(intelligence, intent.requestedDimensions);
  const date = intelligence.primaryDate;
  const recommendations: VisualizationRecommendation[] = [];

  if (intent.intent === "create_kpi" || intent.intent === "create_full_dashboard") {
    recommendations.push(recommendation({ type: "kpi_card", metric, title: `${metricLabel(metric)} Total`, reason: "Uso KPI porque es la metrica principal para lectura ejecutiva." }));
    const secondary = intelligence.percentageMetrics.find((item) => item.field !== metric?.field) ?? intelligence.metrics.find((item) => item.field !== metric?.field);
    if (secondary) recommendations.push(recommendation({ type: "kpi_card", metric: secondary, title: secondary.role === "margin" ? "Margen Promedio" : `${metricLabel(secondary)} Promedio`, reason: "Uso KPI secundario para complementar la lectura principal." }));
  }

  if ((intent.intent === "create_chart" || intent.intent === "create_full_dashboard") && metric && dimension) {
    const type: WidgetType = dimension.uniqueCount <= 6 && intent.requestedDimensions.includes("channel") ? "bar_chart" : "bar_chart";
    recommendations.push(recommendation({ type, metric, dimension, title: `${metricLabel(metric)} por ${dimensionLabel(dimension)}`, reason: `Uso barras porque comparas categorias de ${dimension.label}.`, limit: intent.requestedLimit ?? 10 }));
  }

  if ((intent.intent === "create_full_dashboard" || intent.intent === "compare_periods") && metric && date) {
    recommendations.push(recommendation({ type: "line_chart", metric, date, title: `${metricLabel(metric)} por Mes`, reason: `Uso linea porque ${date.label} permite analizar tendencia temporal.` }));
  }

  if (intent.intent === "find_insight" && metric && dimension) {
    recommendations.push(recommendation({ type: "bar_chart", metric, dimension, title: `Drivers de ${metricLabel(metric)}`, reason: "Uso ranking limitado para identificar contribuyentes principales.", limit: 10 }));
  }

  return recommendations;
}

export function visualFormat(metric?: DatasetFieldCandidate) {
  return formatFor(metric);
}
