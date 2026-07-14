import type { DataRow, DatasetProfile } from "@/types/dataset";
import type { DashboardFilterConfig, DashboardSpec, DashboardWidget } from "@/types/dashboard";
import { DEFAULT_DASHBOARD_DESIGN } from "@/lib/dashboard-spec/edit-dashboard-spec";
import { executeDashboardQuery } from "@/lib/query-engine/execute-dashboard-query";
import { inferSemanticLayer, type SemanticField } from "@/lib/semantic-layer";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { nameFromFile } from "@/lib/utils/name-from-file";

function widget(id: string, input: Omit<DashboardWidget, "id">): DashboardWidget {
  return { id, ...input };
}

function fieldName(field?: SemanticField) {
  return field?.field;
}

function fieldLabel(field?: SemanticField, fallback = "Datos") {
  return field?.displayName ?? fallback;
}

function fieldFormat(field?: SemanticField) {
  if (!field) return "number";
  if (field.role === "margin" || field.inferredType === "percentage") return "percentage";
  if (["revenue", "cost"].includes(field.role) || field.inferredType === "currency") return "currency";
  return "number";
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  return Number(value.replace(/[$,%\s]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

function unique<T>(items: (T | undefined)[]) {
  return Array.from(new Set(items.filter(Boolean))) as T[];
}

function growthByTime(rows: DataRow[], dateField?: string, metricField?: string) {
  if (!dateField || !metricField) return null;
  const datedRows = rows
    .map((row) => ({ row, time: new Date(String(row[dateField])).getTime() }))
    .filter((item) => !Number.isNaN(item.time))
    .sort((left, right) => left.time - right.time);
  if (datedRows.length < 4) return null;
  const midpoint = Math.floor(datedRows.length / 2);
  const previous = datedRows.slice(0, midpoint).reduce((sum, item) => sum + toNumber(item.row[metricField]), 0);
  const current = datedRows.slice(midpoint).reduce((sum, item) => sum + toNumber(item.row[metricField]), 0);
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function metricSentence(label: string, value: number, format: string) {
  if (format === "currency") return `${label} alcanza ${formatCurrency(value)}.`;
  if (format === "percentage") return `${label} promedio se ubica en ${(value * 100).toFixed(1)}%.`;
  return `${label} suma ${formatNumber(value)}.`;
}

export function generateDashboardSpec(profile: DatasetProfile, rows: DataRow[]): DashboardSpec {
  const semantic = inferSemanticLayer(profile, rows);
  const dateField = fieldName(semantic.primaryDate);
  const primaryMetric = semantic.primaryMetric;
  const secondaryMetric = semantic.secondaryMetric;
  const salesField = fieldName(primaryMetric);
  const marginField = fieldName(semantic.marginMetrics[0]);
  const regionGeo = semantic.geographies.find((field) => field.geoRole === "region") ?? semantic.geographies.find((field) => field.geoRole === "zone" || field.geoRole === "territory") ?? semantic.primaryGeography;
  const countryGeo = semantic.geographies.find((field) => field.geoRole === "country");
  const cityGeo = semantic.geographies.find((field) => field.geoRole === "city" || field.geoRole === "commune");
  const regionField = fieldName(regionGeo);
  const countryField = fieldName(countryGeo);
  const cityField = fieldName(cityGeo);
  const sellerField = fieldName(semantic.primarySeller);
  const categoryField = fieldName(semantic.primaryCategory);
  const clientField = fieldName(semantic.primaryClient);
  const productField = fieldName(semantic.primaryProduct);
  const orderField = fieldName(semantic.primaryOrder);
  const secondaryDimension = fieldName(semantic.primaryDimension);
  const geoBreakdownField = regionField ?? cityField ?? countryField;
  const geoBreakdown = [regionGeo, cityGeo, countryGeo].find((field) => field?.field === geoBreakdownField);
  const rankingDimension = sellerField ?? productField ?? categoryField ?? clientField ?? secondaryDimension;
  const isSalesDomain = semantic.domain.name === "sales";
  const metricLabel = isSalesDomain && primaryMetric?.role === "revenue" ? "Ventas" : fieldLabel(primaryMetric, "Registros");
  const metricFormat = fieldFormat(primaryMetric);
  const secondaryFormat = fieldFormat(semantic.marginMetrics[0] ?? secondaryMetric);

  const salesTotal = salesField ? executeDashboardQuery(rows, { metric: { field: salesField, aggregation: "sum" } })[0]?.value ?? 0 : rows.length;
  const avgSecondary = marginField
    ? executeDashboardQuery(rows, { metric: { field: marginField, aggregation: "avg" } })[0]?.value ?? 0
    : secondaryMetric
      ? executeDashboardQuery(rows, { metric: { field: secondaryMetric.field, aggregation: "avg" } })[0]?.value ?? 0
      : profile.columnCount;
  const tickets = orderField ? new Set(rows.map((row) => row[orderField])).size : rows.length;
  const growth = growthByTime(rows, dateField, salesField);
  const growthFallback = growth ?? profile.qualityScore;

  const filters: DashboardFilterConfig[] = [
    dateField && { id: "date", field: dateField, label: fieldLabel(semantic.primaryDate, "Fecha"), type: "date_range" },
    regionField && { id: "region", field: regionField, label: fieldLabel(regionGeo, "Region"), type: "multi_select" },
    countryField && countryField !== regionField && { id: "country", field: countryField, label: fieldLabel(countryGeo, "Pais"), type: "multi_select" },
    !regionField && cityField && { id: "city", field: cityField, label: fieldLabel(cityGeo, "Ciudad"), type: "multi_select" },
    sellerField && { id: "seller", field: sellerField, label: fieldLabel(semantic.primarySeller, "Vendedor"), type: "multi_select" },
    categoryField && { id: "category", field: categoryField, label: fieldLabel(semantic.primaryCategory, "Categoria"), type: "multi_select" },
    clientField && { id: "client", field: clientField, label: fieldLabel(semantic.primaryClient, "Cliente"), type: "multi_select" },
    !regionField && !sellerField && !categoryField && secondaryDimension && { id: "dimension", field: secondaryDimension, label: fieldLabel(semantic.primaryDimension, "Dimension"), type: "multi_select" }
  ].filter(Boolean) as DashboardFilterConfig[];

  const widgets: DashboardWidget[] = [
    widget("kpi_sales", {
      type: "kpi_card",
      title: isSalesDomain ? "Ventas Totales" : salesField ? `${metricLabel} Total` : "Registros",
      description: salesField ? `${Math.round((primaryMetric?.confidence ?? 0) * 100)}% confianza semantica` : "Conteo de filas",
      query: salesField ? { metric: { field: salesField, aggregation: "sum" } } : {},
      config: { icon: "trend", format: metricFormat, tone: "blue", comparison: salesField ? `${Math.round((primaryMetric?.confidence ?? 0) * 100)}% confianza` : "", fallbackValue: salesTotal },
      position: { x: 0, y: 0, w: 3, h: 1 }
    }),
    widget("kpi_margin", {
      type: "kpi_card",
      title: marginField ? "Margen Bruto" : secondaryMetric ? `Promedio ${fieldLabel(secondaryMetric)}` : "Columnas",
      description: marginField ? `${Math.round((semantic.marginMetrics[0]?.confidence ?? 0) * 100)}% confianza semantica` : "Vista exploratoria",
      query: marginField ? { metric: { field: marginField, aggregation: "avg" } } : secondaryMetric ? { metric: { field: secondaryMetric.field, aggregation: "avg" } } : undefined,
      config: { icon: marginField ? "percent" : "chart", format: secondaryFormat, tone: "violet", comparison: marginField ? `${Math.round((semantic.marginMetrics[0]?.confidence ?? 0) * 100)}% confianza` : "", fallbackValue: avgSecondary },
      position: { x: 3, y: 0, w: 3, h: 1 }
    }),
    widget("kpi_tickets", {
      type: "kpi_card",
      title: orderField ? "Tickets" : "Registros",
      description: orderField ? `${Math.round((semantic.primaryOrder?.confidence ?? 0) * 100)}% confianza semantica` : "Filas analizadas",
      query: orderField ? undefined : {},
      config: { icon: "cart", format: "number", tone: "green", comparison: orderField ? `${Math.round((semantic.primaryOrder?.confidence ?? 0) * 100)}% confianza` : "", fallbackValue: tickets },
      position: { x: 6, y: 0, w: 3, h: 1 }
    }),
    widget("kpi_growth", {
      type: "kpi_card",
      title: growth === null ? "Calidad Datos" : "Crecimiento",
      description: growth === null ? "Score del perfil de datos" : "Periodo reciente vs anterior",
      config: { icon: "growth", format: "percentageWhole", tone: "sky", comparison: growth === null ? `${semantic.domain.name} ${Math.round(semantic.domain.confidence * 100)}%` : "vs periodo anterior", fallbackValue: growthFallback },
      position: { x: 9, y: 0, w: 3, h: 1 }
    }),
    widget("sales_by_month", {
      type: "line_chart",
      title: dateField ? `${isSalesDomain ? "Ventas Totales" : metricLabel} por Mes` : "Evolucion no disponible",
      query: salesField && dateField ? { metric: { field: salesField, aggregation: "sum" }, x: { field: dateField, granularity: "month" } } : undefined,
      config: { format: metricFormat, comparison: true, emptyMessage: "No se detecto una columna temporal confiable." },
      position: { x: 0, y: 1, w: 6, h: 3 }
    }),
    widget("sales_by_region", {
      type: "bar_chart",
      title: geoBreakdownField && isSalesDomain ? `Ventas por ${fieldLabel(geoBreakdown, "Region")}` : secondaryDimension ? `${salesField ? metricLabel : "Registros"} por ${fieldLabel(semantic.primaryDimension)}` : "Distribucion principal",
      query: salesField && (geoBreakdownField ?? secondaryDimension) ? { metric: { field: salesField, aggregation: "sum" }, groupBy: [geoBreakdownField ?? secondaryDimension!], orderBy: { field: "value", direction: "desc" }, limit: 5 } : (geoBreakdownField ?? secondaryDimension) ? { groupBy: [geoBreakdownField ?? secondaryDimension!], orderBy: { field: "value", direction: "desc" }, limit: 5 } : undefined,
      config: { format: metricFormat, visualConfig: { orientation: "horizontal" }, horizontal: true, semanticConfidence: geoBreakdown?.confidence ?? semantic.primaryDimension?.confidence },
      position: { x: 6, y: 1, w: 6, h: 3 }
    }),
    widget("top_sellers", {
      type: "bar_chart",
      title: sellerField ? "Top Vendedores" : productField ? "Top Productos" : rankingDimension ? `Top ${fieldLabel(semantic.primaryDimension)}` : "Ranking Principal",
      query: rankingDimension ? { ...(salesField ? { metric: { field: salesField, aggregation: "sum" as const } } : {}), groupBy: [rankingDimension], orderBy: { field: "value", direction: "desc" }, limit: 5 } : undefined,
      config: { format: metricFormat, compact: true },
      position: { x: 0, y: 4, w: 4, h: 3 }
    }),
    widget("sales_detail", {
      type: "table",
      title: isSalesDomain ? "Detalle de Ventas" : "Detalle de Datos",
      config: { columns: unique<string>([dateField, regionField, sellerField, clientField, productField, categoryField, salesField, marginField, orderField]).slice(0, 7), limit: 5 },
      position: { x: 4, y: 4, w: 8, h: 3 }
    }),
    widget("executive_summary", {
      type: "insight_text",
      title: "Resumen Ejecutivo",
      config: {
        bullets: [
          salesField ? metricSentence(isSalesDomain ? "Ventas totales" : metricLabel, salesTotal, metricFormat) : `Se analizaron ${rows.length} registros y ${profile.columnCount} columnas para construir una vista exploratoria.`,
          marginField ? `El margen bruto promedio se ubica en ${(avgSecondary * 100).toFixed(1)}%.` : secondaryMetric ? metricSentence(`Promedio de ${fieldLabel(secondaryMetric)}`, avgSecondary, secondaryFormat) : `El dominio detectado es ${semantic.domain.name} con ${Math.round(semantic.domain.confidence * 100)}% de confianza.`,
          dateField ? `La columna ${fieldLabel(semantic.primaryDate)} permite revisar evolucion temporal.` : "No se detecto una columna temporal confiable.",
          secondaryDimension ? `${fieldLabel(semantic.primaryDimension)} permite segmentar el desempeno sin inventar campos externos.` : "No se detectaron dimensiones confiables para segmentacion.",
          sellerField ? "El ranking por vendedor permite identificar concentracion del resultado comercial." : productField ? "El ranking por producto muestra concentracion y mix del resultado." : "El dashboard prioriza las columnas con mayor confianza semantica."
        ]
      },
      position: { x: 0, y: 7, w: 12, h: 2 }
    })
  ];

  return {
    id: `dashboard_${profile.id}`,
    title: `Dashboard de ${nameFromFile(profile.fileName, "dataset")}`,
    subtitle: isSalesDomain ? "Desempeno comercial consolidado con KPIs, filtros e insights accionables." : `Dashboard ${semantic.domain.name} generado desde roles semanticos del dataset.`,
    businessDomain: semantic.domain.name,
    datasetId: profile.id,
    design: DEFAULT_DASHBOARD_DESIGN,
    globalFilters: filters,
    widgets,
    executiveSummary: isSalesDomain
      ? "Ventas, margen y segmentacion muestran oportunidades claras por las dimensiones detectadas."
      : `Se detecto un dataset ${semantic.domain.name} y se construyo el dashboard con columnas existentes y confidence scores.`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
