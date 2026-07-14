import type { DataRow, DatasetColumnProfile, DatasetProfile } from "@/types/dataset";
import type { DashboardAction, DashboardSpec, DashboardViewState, DashboardWidget } from "@/types/dashboard";
import type { SemanticLayer } from "@/lib/semantic-layer";
import { parseAnalyticalIntent, type AnalyticalIntent, type TimeIntent } from "@/lib/ai/intent-parser";
import { parseDateValue } from "@/lib/data/parse-values";
import { resolveColumn, type ColumnIntent, type ColumnResolveResult } from "@/lib/semantic-layer";
import { slugify } from "@/lib/utils";

export interface ChartPlanningContext {
  prompt: string;
  rows?: DataRow[];
  datasetProfile: DatasetProfile;
  semanticModel: SemanticLayer;
  dashboardSpec: DashboardSpec;
  viewState: DashboardViewState;
}

export interface PlannedChartResult {
  handled: boolean;
  reply: string;
  actions: DashboardAction[];
  confidence: number;
  warnings?: string[];
}

function normalize(value: string) {
  return slugify(value).replace(/_/g, " ");
}

function fieldLabel(profile: DatasetProfile, field?: string) {
  return profile.columns.find((column) => column.normalizedName === field)?.displayName ?? field ?? "campo";
}

function metricIntentFor(intent: string | null): ColumnIntent {
  if (intent === "margen") return "margin";
  if (intent === "ventas") return "revenue";
  return "metric";
}

function dimensionIntentFor(intent: string | null): ColumnIntent {
  if (["region", "pais", "zona", "ciudad", "comuna"].includes(intent ?? "")) return "geography";
  if (intent === "vendedor") return "seller";
  if (intent === "cliente") return "client";
  if (intent === "producto" || intent === "sku") return "product";
  if (intent === "categoria") return "category";
  return "dimension";
}

function preferActualRevenue(prompt: string, result: ColumnResolveResult) {
  if (result.intent !== "revenue" || !result.candidates.length) return result.matchedColumn;
  const wantsForecast = /\b(forecast|proyeccion|proyectado|pronostico|estimado)\b/.test(normalize(prompt));
  const candidates = result.candidates
    .map((candidate) => {
      const text = normalize(`${candidate.column.originalName} ${candidate.column.displayName} ${candidate.column.normalizedName}`);
      const forecastPenalty = !wantsForecast && /\b(forecast|proyeccion|proyectado|pronostico|estimado|presupuesto)\b/.test(text) ? 0.34 : 0;
      const actualBonus = !wantsForecast && /\b(venta neta|venta bruta|ventas|real|actual)\b/.test(text) ? 0.18 : 0;
      return { ...candidate, adjusted: candidate.confidence + actualBonus - forecastPenalty };
    })
    .sort((left, right) => right.adjusted - left.adjusted);
  return candidates[0]?.column ?? result.matchedColumn;
}

export function resolveMetric(intent: AnalyticalIntent, context: ChartPlanningContext) {
  const requested = intent.metricIntent ?? context.prompt;
  const resolved = resolveColumn(requested, { datasetProfile: context.datasetProfile, semanticModel: context.semanticModel }, metricIntentFor(intent.metricIntent));
  return {
    ...resolved,
    matchedColumn: preferActualRevenue(context.prompt, resolved),
    selectedColumn: preferActualRevenue(context.prompt, resolved)
  };
}

export function resolveDimension(intent: AnalyticalIntent, context: ChartPlanningContext) {
  const requested = intent.dimensionIntent ?? context.prompt;
  return resolveColumn(requested, { datasetProfile: context.datasetProfile, semanticModel: context.semanticModel }, dimensionIntentFor(intent.dimensionIntent));
}

export function resolveTimeColumn(intent: AnalyticalIntent, context: ChartPlanningContext) {
  const requested = intent.timeIntent ? `${intent.timeIntent} fecha periodo tiempo` : context.prompt;
  return resolveColumn(requested, { datasetProfile: context.datasetProfile, semanticModel: context.semanticModel }, "date");
}

function yearsFor(rows: DataRow[] | undefined, field: string) {
  const years = new Set<number>();
  for (const row of rows ?? []) {
    const date = parseDateValue(row[field]);
    if (date) years.add(date.getUTCFullYear());
  }
  return [...years].sort((left, right) => left - right);
}

function timeLabel(granularity: TimeIntent) {
  if (granularity === "year") return "Ano";
  if (granularity === "quarter") return "Trimestre";
  if (granularity === "week") return "Semana";
  if (granularity === "day") return "Dia";
  return "Mes";
}

function chartTypeLabel(type: NonNullable<AnalyticalIntent["chartTypeIntent"]>) {
  if (type === "bar_chart") return "barras";
  if (type === "line_chart") return "lineas";
  if (type === "donut_chart") return "dona";
  if (type === "table") return "tabla";
  return "KPI";
}

function targetWidget(spec: DashboardSpec, viewState: DashboardViewState, dimension?: string) {
  const highlighted = viewState.highlightedWidgetId ? spec.widgets.find((widget) => widget.id === viewState.highlightedWidgetId) : undefined;
  const grouped = dimension ? spec.widgets.find((widget) => widget.query?.groupBy?.includes(dimension)) : undefined;
  const temporal = spec.widgets.find((widget) => widget.type === "line_chart" && widget.query?.x?.field);
  return highlighted ?? grouped ?? temporal;
}

function nextWidgetId(spec: DashboardSpec) {
  const ids = new Set(spec.widgets.map((widget) => widget.id));
  let index = spec.widgets.length + 1;
  let id = `ai_temporal_chart_${index}`;
  while (ids.has(id)) {
    index += 1;
    id = `ai_temporal_chart_${index}`;
  }
  return id;
}

function nextWidgetPosition(spec: DashboardSpec) {
  return { x: 0, y: Math.max(0, ...spec.widgets.map((widget) => widget.position.y + widget.position.h)), w: 8, h: 3 };
}

function detectedDateColumns(profile: DatasetProfile) {
  return profile.detectedDateColumns.length ? profile.detectedDateColumns.join(", ") : "ninguna";
}

function compatibleUpdateTarget(widget: DashboardWidget | undefined): widget is DashboardWidget {
  return Boolean(widget && ["line_chart", "bar_chart", "area_chart", "scatter_plot"].includes(widget.type));
}

export function planAnalyticalChart(context: ChartPlanningContext): PlannedChartResult {
  const intent = parseAnalyticalIntent(context.prompt);
  const hasAnalyticalRequest = Boolean(intent.metricIntent || intent.yAxisIntent || (intent.chartTypeIntent && (intent.xAxisIntent || intent.seriesIntent)));
  if (!hasAnalyticalRequest) {
    return { handled: false, reply: "", actions: [], confidence: 0 };
  }
  if (!intent.chartTypeIntent && !["time_series_by_dimension", "time_series", "breakdown_by_dimension"].includes(intent.chartIntent)) {
    return { handled: false, reply: "", actions: [], confidence: 0 };
  }

  const metric = resolveMetric(intent, context);
  const dimension = resolveDimension(intent, context);

  if (!metric.matchedColumn || (intent.chartIntent !== "time_series" && !dimension.matchedColumn)) {
    return { handled: false, reply: "", actions: [], confidence: 0 };
  }
  const metricColumn = metric.matchedColumn;
  const dimensionColumn = dimension.matchedColumn;

  if (intent.chartTypeIntent === "bar_chart" && intent.xAxisIntent && intent.yAxisIntent && intent.seriesIntent && dimensionColumn) {
    const date = intent.seriesIntent === "fecha" ? resolveTimeColumn(intent, context) : undefined;
    if (intent.seriesIntent === "fecha" && !date?.matchedColumn) {
      return {
        handled: true,
        reply: `Puedo crear barras por ${fieldLabel(context.datasetProfile, dimensionColumn.normalizedName)}, pero no encontre una columna temporal confiable para usar anos como colores. Las columnas temporales detectadas son: ${detectedDateColumns(context.datasetProfile)}.`,
        actions: [],
        confidence: 0.86
      };
    }
    const seriesField = date?.matchedColumn?.normalizedName ?? dimensionColumn.normalizedName;
    const seriesGranularity = date?.matchedColumn ? intent.seriesGranularityIntent ?? "year" : undefined;
    const title = `${fieldLabel(context.datasetProfile, metricColumn.normalizedName)} por ${fieldLabel(context.datasetProfile, dimensionColumn.normalizedName)}${seriesGranularity ? ` por ${timeLabel(seriesGranularity)}` : ""}`;
    const query = {
      metric: { field: metricColumn.normalizedName, aggregation: "sum" as const },
      x: { field: dimensionColumn.normalizedName },
      groupBy: [dimensionColumn.normalizedName],
      seriesBy: seriesField,
      ...(seriesGranularity ? { seriesGranularity } : {}),
      orderBy: { field: "value" as const, direction: intent.sortIntent ?? "desc" as const },
      limit: intent.limitIntent ?? 10
    };
    const target = targetWidget(context.dashboardSpec, context.viewState, dimensionColumn.normalizedName);
    let chartAction: DashboardAction;
    if (compatibleUpdateTarget(target)) {
      chartAction = { type: "update_widget", widgetId: target.id, changes: { type: "bar_chart", title, query, config: { generatedBy: "copilot", seriesBy: seriesField, horizontal: true } } };
    } else {
      chartAction = {
        type: "add_widget",
        widget: {
          id: nextWidgetId(context.dashboardSpec),
          type: "bar_chart",
          title,
          query,
          config: { generatedBy: "copilot", seriesBy: seriesField, horizontal: true },
          position: nextWidgetPosition(context.dashboardSpec)
        }
      };
    }
    const widgetId = chartAction.type === "update_widget" ? chartAction.widgetId : chartAction.widget.id;
    return {
      handled: true,
      reply: `Listo. Cree un grafico de ${chartTypeLabel(intent.chartTypeIntent)} con ${dimensionColumn.normalizedName} en X, ${metricColumn.normalizedName} en Y y ${seriesField}${seriesGranularity ? ` agrupada por ${timeLabel(seriesGranularity).toLowerCase()}` : ""} como serie/color.`,
      actions: [chartAction, { type: "focus_widget", widgetId }],
      confidence: Math.min(metric.confidence || 0.82, dimension.confidence || 0.82, date?.confidence ?? 0.86)
    };
  }

  if (intent.chartIntent === "breakdown_by_dimension") {
    return { handled: false, reply: "", actions: [], confidence: 0 };
  }

  const date = resolveTimeColumn(intent, context);
  if (!date.matchedColumn) {
    const dimensionText = dimensionColumn ? ` por ${fieldLabel(context.datasetProfile, dimensionColumn.normalizedName)}` : "";
    return {
      handled: true,
      reply: `Puedo analizar ${fieldLabel(context.datasetProfile, metricColumn.normalizedName)}${dimensionText}, pero no encontre una columna temporal confiable para calcular ${timeLabel(intent.timeIntent ?? "year").toLowerCase()}. Las columnas temporales detectadas son: ${detectedDateColumns(context.datasetProfile)}.`,
      actions: [],
      confidence: 0.86
    };
  }

  let granularity = intent.timeIntent ?? "month";
  const years = yearsFor(context.rows, date.matchedColumn.normalizedName);
  const warnings: string[] = [];
  if (granularity === "year" && years.length === 1) {
    granularity = "month";
    warnings.push(`El dataset contiene solo el ano ${years[0]}. Cree el grafico por mes dentro de ${years[0]} en lugar de por ano.`);
  }

  const topLimit = Math.min(intent.limitIntent ?? 8, 12);
  const useTopLimit = Boolean(dimensionColumn && dimensionColumn.uniqueCount > topLimit);
  const query = {
    metric: { field: metricColumn.normalizedName, aggregation: "sum" as const },
    x: { field: date.matchedColumn.normalizedName, granularity },
    ...(dimensionColumn ? { groupBy: [dimensionColumn.normalizedName], seriesBy: dimensionColumn.normalizedName } : {}),
    orderBy: { field: "label" as const, direction: "asc" as const },
    ...(useTopLimit ? { limit: topLimit } : {})
  };
  const title = dimensionColumn
    ? `${fieldLabel(context.datasetProfile, metricColumn.normalizedName)} por ${fieldLabel(context.datasetProfile, dimensionColumn.normalizedName)} por ${timeLabel(granularity)}`
    : `${fieldLabel(context.datasetProfile, metricColumn.normalizedName)} por ${timeLabel(granularity)}`;
  const config = {
    format: metricColumn.inferredType === "currency" ? "currency" : metricColumn.inferredType === "percentage" ? "percentage" : "number",
    generatedBy: "copilot",
    ...(dimensionColumn ? { seriesBy: dimensionColumn.normalizedName } : {}),
    ...(useTopLimit ? { note: `Mostrando las ${topLimit} principales por ${fieldLabel(context.datasetProfile, metricColumn.normalizedName)}.` } : {})
  };
  const target = targetWidget(context.dashboardSpec, context.viewState, dimensionColumn?.normalizedName);
  let chartAction: DashboardAction;
  if (compatibleUpdateTarget(target)) {
    chartAction = { type: "update_widget", widgetId: target.id, changes: { type: "line_chart", title, query, config } };
  } else {
    chartAction = {
      type: "add_widget",
      widget: {
        id: nextWidgetId(context.dashboardSpec),
        type: "line_chart",
        title,
        query,
        config,
        position: nextWidgetPosition(context.dashboardSpec)
      }
    };
  }
  const widgetId = chartAction.type === "update_widget" ? chartAction.widgetId : chartAction.widget.id;
  const topNote = useTopLimit ? ` Mostrando las ${topLimit} principales por ${fieldLabel(context.datasetProfile, metricColumn.normalizedName)}.` : "";
  const limitation = warnings.length ? ` ${warnings[0]}` : "";
  const dimensionReply = dimensionColumn ? `, ${dimensionColumn.normalizedName} como dimension/serie` : "";
  return {
    handled: true,
    reply: `Listo. Cree un grafico de lineas de ${title}. Use ${metricColumn.normalizedName} como metrica${dimensionReply} y ${date.matchedColumn.normalizedName} agrupada por ${timeLabel(granularity).toLowerCase()} como eje temporal.${topNote}${limitation}`,
    actions: [chartAction, { type: "focus_widget", widgetId }],
    confidence: Math.min(metric.confidence || 0.8, date.confidence || 0.8, dimensionColumn ? dimension.confidence || 0.8 : 0.9),
    warnings
  };
}
