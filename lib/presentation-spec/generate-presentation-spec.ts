import type { DashboardSpec } from "@/types/dashboard";
import type { PresentationSpec, PresentationTheme } from "@/types/presentation";

export function generatePresentationSpec(dashboard: DashboardSpec, theme: PresentationTheme = "executive"): PresentationSpec {
  const kpis = dashboard.widgets.filter((widget) => widget.type === "kpi_card").map((widget) => widget.id);
  const charts = dashboard.widgets.filter((widget) => ["line_chart", "bar_chart", "area_chart", "donut_chart"].includes(widget.type));
  const table = dashboard.widgets.find((widget) => widget.type === "table");
  const insight = dashboard.widgets.find((widget) => widget.type === "insight_text");

  return {
    id: "presentation_demo",
    dashboardId: dashboard.id,
    title: "Analisis Comercial Q2 2024",
    subtitle: "Presentacion interactiva generada desde dashboard vivo.",
    theme,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    slides: [
      {
        id: "cover",
        title: "Analisis Comercial Q2 2024",
        subtitle: "Panorama ejecutivo del trimestre",
        narrative: "Abrimos con una lectura clara del crecimiento, margen y desempeno por region.",
        speakerNotes: "Enfatizar que la presentacion conserva filtros e interacciones.",
        layout: "cover",
        widgetIds: []
      },
      {
        id: "overview",
        title: "Panorama General",
        subtitle: "KPIs principales del periodo",
        narrative: "Ventas, margen, tickets y crecimiento muestran una base comercial saludable.",
        speakerNotes: "Dedicar menos de un minuto a esta slide y pasar rapidamente al driver regional.",
        layout: "kpi_grid",
        widgetIds: kpis
      },
      {
        id: "commercial-summary",
        title: "Resumen Comercial Q2 2024",
        subtitle: dashboard.subtitle,
        narrative: dashboard.executiveSummary,
        speakerNotes: "Explicar el crecimiento con foco en region Centro y vendedores top.",
        layout: "executive_summary",
        widgetIds: [...kpis, "sales_by_month", "sales_by_region", insight?.id].filter(Boolean) as string[]
      },
      {
        id: "region",
        title: "Analisis por Region",
        subtitle: "Comparativo regional y oportunidades",
        narrative: "Centro lidera el trimestre, pero Norte y Sur sostienen oportunidades de expansion.",
        speakerNotes: "Invitar a filtrar regiones en vivo si hay preguntas.",
        layout: "chart_focus",
        widgetIds: ["sales_by_region"]
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
