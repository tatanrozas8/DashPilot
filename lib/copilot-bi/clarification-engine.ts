import type { ClarificationDecision, DatasetFieldCandidate, DatasetIntelligence, BusinessIntentResolution } from "@/lib/copilot-bi/types";

function optionFor(candidate: DatasetFieldCandidate, recommended = false) {
  const suffix = recommended ? " - recomendada" : " - posible";
  return `${candidate.label}${suffix}, ${Math.round(candidate.coverage * 100)}% cobertura`;
}

export function resolveClarification(intent: BusinessIntentResolution, intelligence: DatasetIntelligence): ClarificationDecision {
  if (intent.requestedMetric === "margin" && !intelligence.semanticModel.marginMetrics.length) {
    const revenue = intelligence.semanticModel.revenueMetrics[0];
    const cost = intelligence.semanticModel.costMetrics[0];
    if (!revenue || !cost) {
      return {
        needsClarification: true,
        question: "Para rentabilidad no encontre margen/utilidad ni una combinacion clara de ventas y costo. Que metrica uso?",
        options: intelligence.metrics.slice(0, 3).map((metric, index) => optionFor(metric, index === 0)),
        reason: "Rentabilidad requiere una metrica real de margen, utilidad o costo; no se debe inventar.",
        confidence: 0.92
      };
    }
  }

  if (intent.intent === "ask_clarification") {
    return {
      needsClarification: true,
      question: "Que trabajo quieres que ejecute sobre el dashboard?",
      options: ["Disenar dashboard completo", "Crear grafico", "Crear tabla resumen", "Encontrar insights"],
      reason: "La instruccion no contiene una accion BI suficientemente concreta.",
      confidence: 0.82
    };
  }

  const competingMetrics = intelligence.metrics.filter((metric) => metric.confidence >= 0.58).slice(0, 4);
  if (!intent.requestedMetric && intent.intent !== "create_full_dashboard" && competingMetrics.length > 1 && competingMetrics[0].confidence - competingMetrics[1].confidence < 0.08) {
    return {
      needsClarification: true,
      question: "Encontre varias metricas posibles. Cual uso como metrica principal?",
      options: competingMetrics.map((metric, index) => optionFor(metric, index === 0)),
      reason: "Hay varias metricas con confianza similar.",
      confidence: 0.86
    };
  }

  if ((intent.intent === "compare_periods" || intent.intent === "explain_variation") && !intelligence.primaryDate) {
    return {
      needsClarification: true,
      question: "No encontre una fecha confiable para comparar periodos. Que columna temporal debo usar?",
      options: intelligence.dates.length ? intelligence.dates.map((date, index) => optionFor(date, index === 0)) : ["No usar comparacion temporal", "Crear tabla sin variacion", "Revisar diccionario de columnas"],
      reason: "La comparacion de periodos necesita una fecha con cobertura suficiente.",
      confidence: 0.9
    };
  }

  if (intent.intent === "improve_layout" && intent.requestedDimensions.length === 0 && !intent.requestedMetric) {
    return {
      needsClarification: true,
      question: "Quieres que mejore solo el diseno o tambien cambie metricas/graficos?",
      options: ["Solo diseno y titulos", "Reordenar widgets", "Agregar KPIs e insights"],
      reason: "Mejorar puede significar diseno visual o cambios de logica de datos.",
      confidence: 0.78
    };
  }

  return {
    needsClarification: false,
    options: [],
    reason: "Hay candidatos dominantes y la accion es ejecutable.",
    confidence: 0.86
  };
}
