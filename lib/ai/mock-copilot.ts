import type { ChatMessage } from "@/types/ai";
import type { DashboardAction, DashboardSpec } from "@/types/dashboard";

export function createCopilotAction(prompt: string, spec: DashboardSpec): { reply: string; action?: DashboardAction } {
  const lower = prompt.toLowerCase();

  if (lower.includes("barra") || lower.includes("barras")) {
    return {
      reply: "Entendido. Cambie la visualizacion mensual a barras para comparar mejor el periodo.",
      action: { type: "update_widget", widgetId: "sales_by_month", changes: { type: "bar_chart" } }
    };
  }

  if (lower.includes("trimestre anterior") || lower.includes("comparar") || lower.includes("comparacion") || lower.includes("comparación")) {
    return {
      reply: "He agregado comparacion contra el trimestre anterior en los graficos principales.",
      action: {
        type: "update_widget",
        widgetId: "sales_by_month",
        changes: { config: { comparison: true } }
      }
    };
  }

  if (lower.includes("vendedor")) {
    return {
      reply: "He destacado el ranking de vendedores y ordenado la vista por ventas.",
      action: { type: "update_view_state", viewState: { highlightedWidgetId: "top_sellers" } }
    };
  }

  if (lower.includes("region") || lower.includes("región") || lower.includes("5 regiones")) {
    return {
      reply: "He enfocado el analisis en el desempeno por region y resaltado las principales variaciones.",
      action: { type: "update_view_state", viewState: { highlightedWidgetId: "sales_by_region" } }
    };
  }

  if (lower.includes("margen") && lower.includes("categoria")) {
    return {
      reply: "He preparado una lectura de margen por categoria y deje el resumen ejecutivo listo para explicar oportunidades.",
      action: { type: "update_view_state", viewState: { highlightedWidgetId: "executive_summary" } }
    };
  }

  if (lower.includes("factores") || lower.includes("crecimiento")) {
    return {
      reply: "Los factores principales del crecimiento son region Centro, mejor margen promedio y mayor volumen de tickets.",
      action: { type: "update_view_state", viewState: { highlightedWidgetId: "kpi_growth" } }
    };
  }

  if (lower.includes("ejecutivo") || lower.includes("resumen")) {
    return {
      reply: "He ajustado el dashboard para una lectura mas ejecutiva y deje visibles los KPIs principales con un resumen accionable.",
      action: {
        type: "update_widget",
        widgetId: "executive_summary",
        changes: {
          config: {
            bullets: [
              "Q2 2024 muestra crecimiento solido en ventas, margen y tickets.",
              "La region Centro lidera el desempeno y conviene proteger su dinamica comercial.",
              "Norte y Sur muestran oportunidades claras de expansion con bajo esfuerzo operativo.",
              "Recomendacion: priorizar vendedores top y revisar categorias con menor margen."
            ]
          }
        }
      }
    };
  }

  if (lower.includes("norte")) {
    const regionFilter = spec.globalFilters.find((filter) => filter.id === "region");
    if (!regionFilter) {
      return { reply: "No puedo filtrar por Norte porque el dataset no tiene una dimension de region detectada." };
    }
    return {
      reply: "Filtre el dashboard para mostrar solo Region Norte.",
      action: { type: "update_view_state", viewState: { filters: [{ field: regionFilter.field, operator: "in", value: ["Norte"] }] } }
    };
  }

  if (lower.includes("presentacion") || lower.includes("presentación")) {
    return {
      reply: "Puedo convertir este dashboard en una presentacion ejecutiva con filtros vivos. Abre el constructor desde Presentar.",
      action: { type: "generate_presentation", options: { theme: "executive", durationMinutes: 5, detailLevel: "summary" } }
    };
  }

  return {
      reply: "Puedo ayudarte a cambiar graficos, comparar contra el trimestre anterior, destacar vendedores, enfocar regiones o preparar una presentacion."
  };
}

export function assistantMessage(content: string, structuredAction?: DashboardAction): ChatMessage {
  return { id: crypto.randomUUID(), role: "assistant", content, structuredAction, createdAt: new Date().toISOString() };
}
