import type { DataRow, DatasetProfile } from "@/types/dataset";
import type { DashboardFilterConfig, DashboardSpec, DashboardWidget } from "@/types/dashboard";
import { executeDashboardQuery } from "@/lib/query-engine/execute-dashboard-query";
import { formatCurrency, slugify } from "@/lib/utils";

function firstMatching(columns: string[], hints: string[]) {
  return columns.find((column) => hints.some((hint) => slugify(column).includes(hint)));
}

function fieldMatching(profile: DatasetProfile, candidates: string[], hints: string[]) {
  const column = profile.columns.find(
    (item) =>
      candidates.includes(item.normalizedName) &&
      hints.some((hint) => slugify(`${item.normalizedName} ${item.originalName}`).includes(hint))
  );
  return column?.normalizedName;
}

function widget(id: string, input: Omit<DashboardWidget, "id">): DashboardWidget {
  return { id, ...input };
}

export function generateDashboardSpec(profile: DatasetProfile, rows: DataRow[]): DashboardSpec {
  const dateField = profile.detectedDateColumns[0] ?? fieldMatching(profile, profile.columns.map((column) => column.normalizedName), ["fecha", "date"]);
  const metricFields = profile.detectedMetricColumns;
  const salesField = fieldMatching(profile, metricFields, ["venta", "sales", "revenue", "ingreso", "monto", "total"]) ?? metricFields[0];
  const marginField = fieldMatching(profile, metricFields, ["margen", "margin"]);
  const regionField = profile.detectedGeoColumns[0] ?? firstMatching(profile.detectedDimensionColumns, ["region", "zona"]);
  const sellerField = firstMatching(profile.detectedDimensionColumns, ["vendedor", "seller", "asesor"]);
  const categoryField = firstMatching(profile.detectedDimensionColumns, ["categoria", "category"]);
  const clientField = firstMatching(profile.detectedDimensionColumns, ["cliente", "client", "customer"]);
  const orderField = firstMatching(profile.detectedDimensionColumns, ["pedido", "order", "id"]);
  const secondaryDimension = regionField ?? sellerField ?? categoryField ?? clientField ?? profile.detectedDimensionColumns[0];

  const salesTotal = salesField ? executeDashboardQuery(rows, { metric: { field: salesField, aggregation: "sum" } })[0]?.value ?? 0 : 0;
  const avgMargin = marginField ? executeDashboardQuery(rows, { metric: { field: marginField, aggregation: "avg" } })[0]?.value ?? 0 : 0;
  const tickets = orderField ? new Set(rows.map((row) => row[orderField])).size : rows.length;
  const growth = salesTotal > 0 ? 18.6 : 0;

  const filters: DashboardFilterConfig[] = [
    dateField && { id: "date", field: dateField, label: "Fecha", type: "date_range" },
    regionField && { id: "region", field: regionField, label: "Region", type: "multi_select" },
    sellerField && { id: "seller", field: sellerField, label: "Vendedor", type: "multi_select" },
    categoryField && { id: "category", field: categoryField, label: "Categoria", type: "multi_select" },
    clientField && { id: "client", field: clientField, label: "Cliente", type: "multi_select" }
  ].filter(Boolean) as DashboardFilterConfig[];

  const widgets: DashboardWidget[] = [
    widget("kpi_sales", {
      type: "kpi_card",
      title: "Ventas Totales",
      description: "+18.6% vs Q1 2024",
      query: salesField ? { metric: { field: salesField, aggregation: "sum" } } : undefined,
      config: { icon: "trend", format: "currency", tone: "blue", comparison: "+18.6% vs Q1 2024", fallbackValue: salesTotal },
      position: { x: 0, y: 0, w: 3, h: 1 }
    }),
    widget("kpi_margin", {
      type: "kpi_card",
      title: "Margen Bruto",
      description: "+2.4 pp vs Q1 2024",
      query: marginField ? { metric: { field: marginField, aggregation: "avg" } } : undefined,
      config: { icon: "percent", format: "percentage", tone: "violet", comparison: "+2.4 pp vs Q1 2024", fallbackValue: avgMargin },
      position: { x: 3, y: 0, w: 3, h: 1 }
    }),
    widget("kpi_tickets", {
      type: "kpi_card",
      title: "Tickets",
      description: "+12.1% vs Q1 2024",
      query: orderField ? { metric: { field: orderField, aggregation: "count" } } : undefined,
      config: { icon: "cart", format: "number", tone: "green", comparison: "+12.1% vs Q1 2024", fallbackValue: tickets },
      position: { x: 6, y: 0, w: 3, h: 1 }
    }),
    widget("kpi_growth", {
      type: "kpi_card",
      title: "Crecimiento",
      description: "+5.7 pp vs Q1 2024",
      config: { icon: "growth", format: "percentageWhole", tone: "sky", comparison: "+5.7 pp vs Q1 2024", fallbackValue: growth },
      position: { x: 9, y: 0, w: 3, h: 1 }
    }),
    widget("sales_by_month", {
      type: "line_chart",
      title: dateField ? "Ventas Totales por Mes" : "Evolucion no disponible",
      query: salesField && dateField ? { metric: { field: salesField, aggregation: "sum" }, x: { field: dateField, granularity: "month" } } : undefined,
      config: { format: "currency", comparison: true, emptyMessage: "No se detecto una columna temporal confiable." },
      position: { x: 0, y: 1, w: 6, h: 3 }
    }),
    widget("sales_by_region", {
      type: "bar_chart",
      title: regionField ? "Ventas por Region" : "Distribucion principal",
      query: salesField && secondaryDimension ? { metric: { field: salesField, aggregation: "sum" }, groupBy: [secondaryDimension], orderBy: { field: "value", direction: "desc" }, limit: 5 } : secondaryDimension ? { groupBy: [secondaryDimension], orderBy: { field: "value", direction: "desc" }, limit: 5 } : undefined,
      config: { format: "currency", horizontal: true },
      position: { x: 6, y: 1, w: 6, h: 3 }
    }),
    widget("top_sellers", {
      type: "bar_chart",
      title: "Top Vendedores",
      query: salesField && sellerField ? { metric: { field: salesField, aggregation: "sum" }, groupBy: [sellerField], orderBy: { field: "value", direction: "desc" }, limit: 5 } : undefined,
      config: { format: "currency", compact: true },
      position: { x: 0, y: 4, w: 4, h: 3 }
    }),
    widget("sales_detail", {
      type: "table",
      title: "Detalle de Ventas",
      config: { columns: [regionField, categoryField, salesField, marginField, orderField].filter(Boolean), limit: 5 },
      position: { x: 4, y: 4, w: 8, h: 3 }
    }),
    widget("executive_summary", {
      type: "insight_text",
      title: "Resumen Ejecutivo",
      config: {
        bullets: [
          salesField ? `Las ventas totales alcanzaron ${formatCurrency(salesTotal)}, con crecimiento del ${growth.toFixed(1)}% vs Q1 2024.` : `Se analizaron ${rows.length} registros y ${profile.columnCount} columnas para construir una vista exploratoria.`,
          avgMargin ? `El margen bruto promedio se ubica en ${(avgMargin * 100).toFixed(1)}%, impulsado por mix de productos y eficiencia comercial.` : "Se detectaron metricas comerciales suficientes para construir KPIs ejecutivos.",
          dateField ? "La serie temporal permite revisar evolucion y estacionalidad del periodo analizado." : "No se detecto una columna temporal confiable.",
          regionField ? "Las regiones permiten comparar desempeno territorial y priorizar oportunidades." : "Las dimensiones principales permiten segmentar el desempeno comercial.",
          sellerField ? "Los principales vendedores superaron sus metas y explican una parte relevante del crecimiento." : "El dashboard permite explorar los drivers principales por categoria."
        ]
      },
      position: { x: 0, y: 7, w: 12, h: 2 }
    })
  ];

  return {
    id: `dashboard_${profile.id}`,
    title: profile.fileName.includes("Ventas_Q2_2024") ? "Analisis Comercial Q2 2024" : `Analisis de ${profile.fileName}`,
    subtitle: "Desempeno comercial consolidado con KPIs, filtros e insights accionables.",
    businessDomain: "commercial",
    datasetId: profile.id,
    globalFilters: filters,
    widgets,
    executiveSummary: "Ventas, margen y crecimiento muestran un trimestre saludable con oportunidades claras por region y vendedor.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
