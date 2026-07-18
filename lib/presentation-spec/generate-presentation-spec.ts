import type { DashboardSpec } from "@/types/dashboard";
import type { PresentationSpec, PresentationTheme } from "@/types/presentation";

function hasQueryWarnings(dashboard: DashboardSpec) {
  return dashboard.widgets.some((widget) => Array.isArray(widget.config.queryWarnings) && widget.config.queryWarnings.length > 0);
}

function dashboardRevisionId(dashboard: DashboardSpec) {
  const source = dashboard.updatedAt || dashboard.createdAt || dashboard.id;
  return `dashboard_revision_${dashboard.id}_${source.replace(/[^a-zA-Z0-9]+/g, "_")}`;
}

export function generatePresentationSpec(dashboard: DashboardSpec, theme: PresentationTheme = "executive"): PresentationSpec {
  const kpis = dashboard.widgets.filter((widget) => widget.type === "kpi_card").map((widget) => widget.id);
  const charts = dashboard.widgets.filter((widget) => ["line_chart", "bar_chart", "area_chart", "donut_chart"].includes(widget.type));
  const table = dashboard.widgets.find((widget) => widget.type === "table");
  const insight = dashboard.widgets.find((widget) => widget.type === "insight_text");
  const dashboardTitle = dashboard.title || "Dashboard";
  const presentationTitle = dashboard.widgets.length ? `Presentacion de ${dashboardTitle}` : "Aún no hay presentaciones";
  const primaryChart = charts[0];
  const qualityNote = hasQueryWarnings(dashboard) ? " Hay advertencias de cobertura numerica; revisar antes de tomar decisiones." : "";

  return {
    id: `presentation_${dashboard.id}`,
    dashboardId: dashboard.id,
    sourceDashboardRevisionId: dashboardRevisionId(dashboard),
    sourceDashboardTitle: dashboardTitle,
    sourceDashboardUpdatedAt: dashboard.updatedAt || dashboard.createdAt,
    snapshotMode: "snapshot",
    title: presentationTitle,
    subtitle: "Presentacion interactiva generada desde dashboard vivo.",
    theme,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    slides: [
      {
        id: "cover",
        title: presentationTitle,
        subtitle: "Panorama ejecutivo del dashboard",
        narrative: "Abrimos con una lectura clara de los indicadores y dimensiones detectadas.",
        speakerNotes: "Enfatizar que la presentacion conserva filtros e interacciones.",
        layout: "cover",
        widgetIds: []
      },
      {
        id: "overview",
        title: "Panorama General",
        subtitle: "KPIs principales del dashboard",
        narrative: `Los indicadores principales resumen el comportamiento del dataset cargado.${qualityNote}`,
        speakerNotes: `Dedicar menos de un minuto a esta slide y pasar rapidamente al driver regional.${qualityNote}`,
        layout: "kpi_grid",
        widgetIds: kpis
      },
      {
        id: "commercial-summary",
        title: "Resumen Ejecutivo",
        subtitle: dashboard.subtitle,
        narrative: `${dashboard.executiveSummary ?? ""}${qualityNote}`,
        speakerNotes: `Explicar los hallazgos usando las dimensiones disponibles en el dashboard.${qualityNote}`,
        layout: "executive_summary",
        widgetIds: [...kpis, primaryChart?.id, insight?.id].filter(Boolean) as string[]
      },
      {
        id: "region",
        title: primaryChart?.title ?? "Analisis principal",
        subtitle: "Comparativo de la dimension mas relevante",
        narrative: "La visualizacion principal permite explorar diferencias entre segmentos del dataset.",
        speakerNotes: "Invitar a filtrar en vivo si hay preguntas.",
        layout: "chart_focus",
        widgetIds: primaryChart ? [primaryChart.id] : []
      },
      {
        id: "sellers",
        title: "Top Vendedores",
        subtitle: "Contribucion comercial por vendedor",
        narrative: "El ranking identifica quienes explican el crecimiento y donde replicar practicas.",
        speakerNotes: "Mencionar que el top puede recalcularse con filtros activos.",
        layout: "ranking",
        widgetIds: ["top_sellers"]
      },
      {
        id: "detail",
        title: "Detalle Filtrable",
        subtitle: "Datos vivos para explorar preguntas del equipo",
        narrative: "La tabla queda disponible como respaldo para validar decisiones importantes.",
        speakerNotes: "Usar solo si la audiencia pide detalle operativo.",
        layout: "table_detail",
        widgetIds: table ? [table.id] : []
      }
    ]
  };
}
