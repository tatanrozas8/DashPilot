import type { BusinessAudience, DatasetFieldCandidate, DatasetIntelligence } from "@/lib/copilot-bi/types";

function audienceLabel(audience: BusinessAudience) {
  if (audience === "executive") return "Ejecutivo";
  if (audience === "commercial") return "Comercial";
  if (audience === "finance") return "Financiero";
  if (audience === "operations") return "Operacional";
  return "Analitico";
}

export function dashboardTitle(input: { audience: BusinessAudience; intelligence: DatasetIntelligence; metric?: DatasetFieldCandidate }) {
  const domain = input.intelligence.semanticModel.domain.name === "sales" ? "Ventas" : input.intelligence.semanticModel.domain.name;
  const metric = input.metric?.role === "revenue" ? "Ventas" : input.metric?.label;
  return `${audienceLabel(input.audience)} de ${metric ?? domain}`;
}

export function dashboardSubtitle(input: { intelligence: DatasetIntelligence; metric?: DatasetFieldCandidate; dimension?: DatasetFieldCandidate; date?: DatasetFieldCandidate }) {
  const pieces = [
    input.metric ? `metrica ${input.metric.label}` : undefined,
    input.dimension ? `segmentada por ${input.dimension.label}` : undefined,
    input.date ? `con evolucion por ${input.date.label}` : undefined
  ].filter(Boolean);
  return `Vista BI generada desde columnas reales: ${pieces.join(", ") || "perfil del dataset"}.`;
}

export function narrativeBullets(input: { intelligence: DatasetIntelligence; metric?: DatasetFieldCandidate; dimension?: DatasetFieldCandidate; date?: DatasetFieldCandidate }) {
  return [
    input.metric ? `Metrica principal: ${input.metric.label} con ${Math.round(input.metric.coverage * 100)}% de cobertura.` : "No hay metrica dominante; el dashboard queda en modo exploratorio.",
    input.dimension ? `Dimension principal: ${input.dimension.label}, limitada para evitar rankings saturados.` : "No hay dimension dominante para segmentacion.",
    input.date ? `La tendencia usa ${input.date.label}; si la granularidad no alcanza, QueryService mostrara advertencias.` : "No se detecto fecha confiable para comparaciones temporales.",
    "Los insights se expresan como evidencia descriptiva; no se afirma causalidad sin datos adicionales."
  ];
}
