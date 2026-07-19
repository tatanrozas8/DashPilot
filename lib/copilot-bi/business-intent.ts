import type { BusinessAudience, BusinessIntentResolution, BusinessIntentType } from "@/lib/copilot-bi/types";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function audienceFor(text: string): BusinessAudience {
  if (includesAny(text, ["gerencia", "directorio", "ejecutivo", "executive", "ceo", "cfo"])) return "executive";
  if (includesAny(text, ["comercial", "ventas", "sales"])) return "commercial";
  if (includesAny(text, ["finanzas", "financiero", "margen", "rentabilidad", "costo"])) return "finance";
  if (includesAny(text, ["operacion", "operacional", "logistica", "inventario", "stock"])) return "operations";
  return "analyst";
}

function metricFor(text: string) {
  if (includesAny(text, ["rentabilidad", "margen", "utilidad", "profit"])) return "margin";
  if (includesAny(text, ["ventas", "venta", "ingresos", "revenue", "monto"])) return "revenue";
  if (includesAny(text, ["costo", "costos", "gasto"])) return "cost";
  if (includesAny(text, ["cantidad", "unidades", "volumen"])) return "quantity";
  return undefined;
}

function dimensionsFor(text: string) {
  const dimensions: string[] = [];
  if (includesAny(text, ["region", "regiones", "zona", "pais", "ciudad"])) dimensions.push("geography");
  if (includesAny(text, ["canal", "channel"])) dimensions.push("channel");
  if (includesAny(text, ["cliente", "clientes"])) dimensions.push("client");
  if (includesAny(text, ["producto", "sku"])) dimensions.push("product");
  if (includesAny(text, ["categoria", "segmento"])) dimensions.push("category");
  if (includesAny(text, ["vendedor", "ejecutivo comercial"])) dimensions.push("seller");
  return dimensions;
}

function limitFor(text: string) {
  const match = text.match(/\btop\s+(\d+)|\bprimer[oa]s?\s+(\d+)|\b(\d+)\s+(?:principales|mejores|peores)\b/);
  const value = Number(match?.[1] ?? match?.[2] ?? match?.[3]);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 50) : undefined;
}

function classify(text: string): { primary: BusinessIntentType; secondary: BusinessIntentType[] } {
  if (includesAny(text, ["deshaz", "revertir", "revierte"])) return { primary: "ask_clarification", secondary: [] };
  if (includesAny(text, ["dashboard completo", "dashboard ejecutivo", "disena un dashboard", "diseñame un dashboard", "mejor dashboard", "vista completa", "dashboard de ventas"])) {
    return { primary: "create_full_dashboard", secondary: ["create_kpi", "create_chart", "create_table", "create_narrative"] };
  }
  if (includesAny(text, ["pagina ejecutiva", "vista ejecutiva"])) return { primary: "create_executive_page", secondary: ["create_kpi", "create_narrative"] };
  if (includesAny(text, ["pagina operacional", "vista operacional"])) return { primary: "create_operational_page", secondary: ["create_chart", "create_table"] };
  if (includesAny(text, ["pagina de detalle", "vista de detalle", "detalle"])) return { primary: "create_detail_page", secondary: ["create_table"] };
  if (includesAny(text, ["tabla", "top 10", "top diez"])) return { primary: "create_table", secondary: ["rank_contributors"] };
  if (includesAny(text, ["kpi", "indicador", "tarjeta"])) return { primary: "create_kpi", secondary: [] };
  if (includesAny(text, ["grafico", "gráfico", "barras", "linea", "lineas", "dona"])) return { primary: "create_chart", secondary: [] };
  if (includesAny(text, ["insight", "hallazgo", "explica la caida", "explicar la caida", "por que bajaron", "por que subieron"])) return { primary: "find_insight", secondary: ["explain_variation", "rank_contributors"] };
  if (includesAny(text, ["comparar", "periodo anterior", "ano anterior", "año anterior", "variacion"])) return { primary: "compare_periods", secondary: ["explain_variation"] };
  if (includesAny(text, ["anomalia", "outlier", "atipico"])) return { primary: "detect_anomaly", secondary: [] };
  if (includesAny(text, ["presentacion", "slides", "directorio"])) return { primary: "prepare_presentation", secondary: ["create_narrative"] };
  if (includesAny(text, ["titulo", "titulos", "subtitulo"])) return { primary: "create_title", secondary: ["create_narrative"] };
  if (includesAny(text, ["hazlo mas profesional", "haz este dashboard mas profesional", "mas gerencial", "ordena mejor", "mejorar layout"])) return { primary: "improve_layout", secondary: ["create_title", "create_narrative"] };
  if (text.endsWith("?") || includesAny(text, ["cual fue", "cual es", "que region", "cuanto"])) return { primary: "answer_analytical_question", secondary: [] };
  return { primary: "ask_clarification", secondary: [] };
}

export function resolveBusinessIntent(prompt: string): BusinessIntentResolution {
  const text = normalize(prompt);
  const classified = classify(text);
  const requestedMetric = metricFor(text);
  const requestedDimensions = dimensionsFor(text);
  const requestedDate = includesAny(text, ["fecha", "periodo", "ano", "año", "mes", "trimestre"]) ? "date" : undefined;
  const confidence = classified.primary === "ask_clarification" ? 0.58 : requestedMetric || requestedDimensions.length || classified.primary === "create_full_dashboard" ? 0.88 : 0.72;
  return {
    intent: classified.primary,
    secondaryIntents: classified.secondary,
    audience: audienceFor(text),
    requestedMetric,
    requestedDimensions,
    requestedDate,
    requestedLimit: limitFor(text),
    confidence,
    reason: `Intencion ${classified.primary} detectada desde verbos y conceptos de negocio.`,
    destructive: false
  };
}
