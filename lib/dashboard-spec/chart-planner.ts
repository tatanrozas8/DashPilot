import type { DataRow, DatasetCatalog, DatasetCatalogColumn, DatasetColumnProfile, DatasetProfile } from "@/types/dataset";
import type { DashboardAction, DashboardQuerySpec, DashboardSpec, DashboardViewState, DashboardWidget, WidgetType } from "@/types/dashboard";
import type { SemanticLayer } from "@/lib/semantic-layer";
import { parseAnalyticalIntent, type AnalyticalIntent, type TimeIntent } from "@/lib/ai/intent-parser";
import { parseDateValue } from "@/lib/data/parse-values";
import { buildDatasetCatalog, resolveColumn, type ColumnIntent, type ColumnResolveResult } from "@/lib/semantic-layer";
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

export interface AnalysisPlan {
  userIntent: AnalyticalIntent;
  chartType: WidgetType | null;
  metric: DatasetColumnProfile | null;
  aggregation: NonNullable<DashboardQuerySpec["metric"]>["aggregation"];
  xAxis: DatasetColumnProfile | null;
  yAxis: DatasetColumnProfile | null;
  dimension: DatasetColumnProfile | null;
  seriesBy: DatasetColumnProfile | null;
  colorBy: DatasetColumnProfile | null;
  timeField: DatasetColumnProfile | null;
  timeGranularity: TimeIntent | null;
  filters: DashboardQuerySpec["filters"];
  targetWidgetId?: string;
  shouldUpdateExistingWidget: boolean;
  shouldCreateNewWidget: boolean;
  confidence: number;
  missingRequirements: string[];
  warnings: string[];
}

export interface AnalysisPlanValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
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

function catalogColumn(catalog: DatasetCatalog, field?: string | null) {
  return catalog.columns.find((column) => column.normalizedName === field);
}

function isRequestedRegion(intent: AnalyticalIntent) {
  return intent.xAxisIntent === "region" || intent.dimensionIntent === "region";
}

function isRequestedCountry(intent: AnalyticalIntent) {
  return intent.xAxisIntent === "pais" || intent.dimensionIntent === "pais";
}

function roleMatchesExplicitIntent(column: DatasetCatalogColumn | undefined, requested: string | null) {
  if (!requested || !column) return true;
  if (requested === "region") return column.normalizedName === "region" || column.geoRole === "region";
  if (requested === "pais") return ["pais", "country"].includes(column.normalizedName) || column.geoRole === "country";
  if (requested === "canal") return column.normalizedName === "canal" || column.dimensionRole === "channel";
  return column.normalizedName.includes(requested) || column.aliases.some((alias) => normalize(alias) === normalize(requested));
}

function resolveSeriesColumn(intent: AnalyticalIntent, context: ChartPlanningContext) {
  if (intent.seriesIntent === "fecha") return resolveTimeColumn(intent, context).matchedColumn ?? null;
  if (!intent.seriesIntent) return null;
  return resolveColumn(intent.seriesIntent, { datasetProfile: context.datasetProfile, semanticModel: context.semanticModel }, dimensionIntentFor(intent.seriesIntent)).matchedColumn ?? null;
}

export function buildAnalysisPlan(context: ChartPlanningContext): AnalysisPlan {
  const intent = parseAnalyticalIntent(context.prompt);
  const metric = resolveMetric(intent, context).matchedColumn ?? null;
  const dimension = resolveDimension(intent, context).matchedColumn ?? null;
  const time = resolveTimeColumn(intent, context).matchedColumn ?? null;
  const series = resolveSeriesColumn(intent, context);
  const target = targetWidget(context.dashboardSpec, context.viewState, dimension?.normalizedName);
  const missingRequirements = [
    !metric ? "metric" : "",
    !dimension && intent.chartIntent !== "time_series" ? "dimension" : "",
    intent.seriesIntent === "fecha" && !time ? "timeField" : ""
  ].filter(Boolean);

  return {
    userIntent: intent,
    chartType: intent.chartTypeIntent ?? (intent.chartIntent === "time_series_by_dimension" || intent.chartIntent === "time_series" ? "line_chart" : "bar_chart"),
    metric,
    aggregation: "sum",
    xAxis: intent.xAxisIntent === "fecha" ? time : dimension,
    yAxis: metric,
    dimension,
    seriesBy: series,
    colorBy: series,
    timeField: time,
    timeGranularity: intent.seriesGranularityIntent ?? intent.timeIntent,
    filters: [],
    targetWidgetId: target?.id,
    shouldUpdateExistingWidget: Boolean(target),
    shouldCreateNewWidget: !target,
    confidence: Math.min(metric ? 0.86 : 0.2, dimension || intent.chartIntent === "time_series" ? 0.86 : 0.2, intent.seriesIntent === "fecha" && time ? 0.86 : 0.86),
    missingRequirements,
    warnings: []
  };
}

export function validateAnalysisPlan(plan: AnalysisPlan, catalog: DatasetCatalog): AnalysisPlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [...plan.warnings];
  const metric = catalogColumn(catalog, plan.metric?.normalizedName);
  const xAxis = catalogColumn(catalog, plan.xAxis?.normalizedName);
  const seriesBy = catalogColumn(catalog, plan.seriesBy?.normalizedName);
  const allowedCharts: WidgetType[] = ["bar_chart", "line_chart", "area_chart", "donut_chart", "scatter_plot", "kpi_card", "table"];

  if (!plan.chartType || !allowedCharts.includes(plan.chartType)) errors.push("El tipo de grafico solicitado no esta soportado.");
  if (plan.userIntent.chartTypeIntent && plan.chartType !== plan.userIntent.chartTypeIntent) errors.push(`El usuario pidio ${plan.userIntent.chartTypeIntent}, pero el plan usa ${plan.chartType}.`);
  if (!metric || !metric.usableAsMetric) errors.push("La metrica solicitada no existe o no es agregable.");
  if (!xAxis || (!xAxis.usableAsBreakdown && !xAxis.usableAsDimension)) errors.push("El eje X solicitado no existe o no puede usarse como dimension.");
  if (plan.userIntent.xAxisIntent && !roleMatchesExplicitIntent(xAxis, plan.userIntent.xAxisIntent)) errors.push(`El usuario pidio ${plan.userIntent.xAxisIntent} en X, pero el plan usa ${xAxis?.normalizedName ?? "ninguna"}.`);
  if (isRequestedRegion(plan.userIntent) && xAxis?.geoRole !== "region" && xAxis?.normalizedName !== "region") errors.push("El usuario pidio region; no se permite sustituirla por otra dimension.");
  if (isRequestedCountry(plan.userIntent) && xAxis?.geoRole !== "country" && !["pais", "country"].includes(xAxis?.normalizedName ?? "")) errors.push("El usuario pidio pais; no se permite sustituirlo por otra dimension.");
  if (plan.userIntent.seriesIntent === "fecha") {
    if (!seriesBy || !seriesBy.usableAsDate) errors.push("El usuario pidio anos como colores, pero no hay una fecha valida como serie.");
    if (plan.timeGranularity !== "year") errors.push("El usuario pidio anos como colores; la granularidad debe ser year.");
  }
  if (plan.missingRequirements.length) errors.push(`Faltan requisitos del plan: ${plan.missingRequirements.join(", ")}.`);
  return { success: errors.length === 0, errors, warnings };
}

export function validateWidgetMatchesPlan(widget: DashboardWidget | undefined, plan: AnalysisPlan): AnalysisPlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!widget) return { success: false, errors: ["No encontre el widget final para validar."], warnings };
  if (plan.chartType && widget.type !== plan.chartType) errors.push(`El widget final es ${widget.type}, pero el plan exigia ${plan.chartType}.`);
  if (plan.metric && widget.query?.metric?.field !== plan.metric.normalizedName) errors.push(`La metrica final es ${widget.query?.metric?.field ?? "ninguna"}, pero el plan exigia ${plan.metric.normalizedName}.`);
  if (plan.xAxis && widget.query?.x?.field !== plan.xAxis.normalizedName) errors.push(`El eje X final es ${widget.query?.x?.field ?? "ninguno"}, pero el plan exigia ${plan.xAxis.normalizedName}.`);
  if (plan.seriesBy && widget.query?.seriesBy !== plan.seriesBy.normalizedName) errors.push(`La serie final es ${widget.query?.seriesBy ?? "ninguna"}, pero el plan exigia ${plan.seriesBy.normalizedName}.`);
  if (plan.seriesBy && plan.timeGranularity && widget.query?.seriesGranularity !== plan.timeGranularity) errors.push(`La granularidad final es ${widget.query?.seriesGranularity ?? "ninguna"}, pero el plan exigia ${plan.timeGranularity}.`);
  if (plan.metric && plan.dimension && plan.timeGranularity === "year") {
    const title = normalize(widget.title);
    if (!title.includes(normalize(plan.metric.displayName)) || !title.includes(normalize(plan.dimension.displayName)) || !title.includes("ano")) {
      warnings.push("El titulo no refleja claramente metrica, dimension y tiempo.");
    }
  }
  return { success: errors.length === 0, errors, warnings };
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
  const explicitPlanRequested = Boolean(intent.chartTypeIntent || intent.xAxisIntent || intent.yAxisIntent || intent.seriesIntent);
  const analysisPlan = buildAnalysisPlan(context);
  const planValidation = validateAnalysisPlan(analysisPlan, buildDatasetCatalog(context.datasetProfile));
  if (explicitPlanRequested && !planValidation.success) {
    return {
      handled: true,
      reply: `No aplique cambios porque el plan no coincide con la instruccion: ${planValidation.errors.join(" ")}`,
      actions: [],
      confidence: 0,
      warnings: planValidation.warnings
    };
  }

  const metric = resolveMetric(intent, context);
  const dimension = resolveDimension(intent, context);

  if (!metric.matchedColumn || (intent.chartIntent !== "time_series" && !dimension.matchedColumn)) {
    return { handled: false, reply: "", actions: [], confidence: 0 };
  }
  const metricColumn = metric.matchedColumn;
  const dimensionColumn = dimension.matchedColumn;

  if (intent.chartTypeIntent === "bar_chart" && intent.xAxisIntent && intent.yAxisIntent && intent.seriesIntent && analysisPlan.metric && analysisPlan.xAxis && analysisPlan.seriesBy) {
    if (intent.seriesIntent === "fecha" && !analysisPlan.timeField) {
      return {
        handled: true,
        reply: `Puedo crear barras por ${fieldLabel(context.datasetProfile, analysisPlan.xAxis.normalizedName)}, pero no encontre una columna temporal confiable para usar anos como colores. Las columnas temporales detectadas son: ${detectedDateColumns(context.datasetProfile)}.`,
        actions: [],
        confidence: 0.86
      };
    }
    const seriesField = analysisPlan.seriesBy.normalizedName;
    const seriesGranularity = analysisPlan.seriesBy.semanticType === "time" || analysisPlan.seriesBy.inferredType === "date" || analysisPlan.seriesBy.inferredType === "datetime" ? analysisPlan.timeGranularity ?? "year" : undefined;
    const title = `${fieldLabel(context.datasetProfile, analysisPlan.metric.normalizedName)} por ${fieldLabel(context.datasetProfile, analysisPlan.xAxis.normalizedName)}${seriesGranularity ? ` por ${timeLabel(seriesGranularity)}` : ""}`;
    const query = {
      metric: { field: analysisPlan.metric.normalizedName, aggregation: analysisPlan.aggregation },
      x: { field: analysisPlan.xAxis.normalizedName },
      groupBy: [analysisPlan.xAxis.normalizedName],
      seriesBy: seriesField,
      ...(seriesGranularity ? { seriesGranularity } : {}),
      orderBy: { field: "value" as const, direction: intent.sortIntent ?? "desc" as const },
      limit: intent.limitIntent ?? 10
    };
    const target = targetWidget(context.dashboardSpec, context.viewState, analysisPlan.xAxis.normalizedName);
    let chartAction: DashboardAction;
    if (compatibleUpdateTarget(target)) {
      chartAction = { type: "update_widget", widgetId: target.id, changes: { type: "bar_chart", title, query, config: { generatedBy: "copilot", seriesBy: seriesField, visualConfig: { orientation: "horizontal" }, horizontal: true } } };
    } else {
      chartAction = {
        type: "add_widget",
        widget: {
          id: nextWidgetId(context.dashboardSpec),
          type: "bar_chart",
          title,
          query,
          config: { generatedBy: "copilot", seriesBy: seriesField, visualConfig: { orientation: "horizontal" }, horizontal: true },
          position: nextWidgetPosition(context.dashboardSpec)
        }
      };
    }
    const widgetId = chartAction.type === "update_widget" ? chartAction.widgetId : chartAction.widget.id;
    return {
      handled: true,
      reply: `Listo. Actualice el widget a un grafico de ${chartTypeLabel(intent.chartTypeIntent)}. En el eje X use ${analysisPlan.xAxis.normalizedName}, en el eje Y use ${analysisPlan.metric.normalizedName} y coloree las barras por ${seriesField}${seriesGranularity ? ` agrupada por ${timeLabel(seriesGranularity).toLowerCase()}` : ""}.`,
      actions: [chartAction, { type: "focus_widget", widgetId }],
      confidence: analysisPlan.confidence,
      warnings: planValidation.warnings
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
