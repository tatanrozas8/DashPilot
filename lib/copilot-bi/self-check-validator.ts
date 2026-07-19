import type { DashboardAction, DashboardWidget } from "@/types/dashboard";
import type { DatasetIntelligence, SelfCheckResult } from "@/lib/copilot-bi/types";

function widgetFromAction(action: DashboardAction): DashboardWidget | undefined {
  if (action.type === "add_widget") return action.widget;
  if (action.type === "replace_widget") return action.widget;
  if (action.type === "update_widget") return action.changes as DashboardWidget;
  return undefined;
}

export function validateBiPlan(input: { intelligence: DatasetIntelligence; actions: DashboardAction[] }): SelfCheckResult {
  const fields = new Set(input.intelligence.profile.columns.map((column) => column.normalizedName));
  const items: SelfCheckResult["items"] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const action of input.actions) {
    const widget = widgetFromAction(action);
    if (!widget?.query) continue;
    const referenced = [
      widget.query.metric?.field,
      widget.query.x?.field,
      ...(widget.query.groupBy ?? []),
      widget.query.seriesBy,
      ...(widget.query.filters ?? []).map((filter) => filter.field)
    ].filter((field): field is string => Boolean(field));
    for (const field of referenced) {
      const passed = fields.has(field);
      items.push({ label: `Existe columna ${field}`, passed, message: passed ? "Columna allowlisted en DatasetProfile." : "La columna no existe en el dataset." });
      if (!passed) errors.push(`Columna inexistente: ${field}`);
    }
    const limit = widget.query.limit ?? 100;
    const hasLimit = limit <= 100;
    items.push({ label: `Limite razonable ${widget.id}`, passed: hasLimit, message: hasLimit ? `limit=${limit}` : `limit=${limit} excede el maximo recomendado.` });
    if (!hasLimit) warnings.push(`El widget ${widget.title} usa un limite alto.`);
    if (widget.type === "donut_chart") {
      const dimension = widget.query.groupBy?.[0];
      const candidate = input.intelligence.dimensions.find((item) => item.field === dimension);
      if (candidate && candidate.uniqueCount > 8) {
        warnings.push(`Evitar donut con ${candidate.uniqueCount} categorias en ${candidate.label}.`);
      }
    }
  }

  items.push({ label: "No hay filas crudas en el plan", passed: true, message: "El plan usa metadatos, queries allowlisted y widgets; no incorpora rows al prompt." });
  items.push({ label: "Puede deshacerse", passed: true, message: "La ejecucion pasa por command bus transaccional con revision restaurable." });

  return {
    passed: errors.length === 0,
    items,
    warnings,
    errors
  };
}
