import type { ActionPlan } from "@/lib/ai/action-plan";
import type { DashboardAction, DashboardSpec, DashboardViewState, DashboardWidget } from "@/types/dashboard";

export interface ExecutionVerificationInput {
  plan: ActionPlan;
  action: DashboardAction;
  beforeDashboardSpec: DashboardSpec;
  afterDashboardSpec: DashboardSpec;
  beforeViewState: DashboardViewState;
  afterViewState: DashboardViewState;
}

export interface ExecutionVerificationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function widget(spec: DashboardSpec, id?: string) {
  return id ? spec.widgets.find((item) => item.id === id) : undefined;
}

function targetWidgetId(action: DashboardAction, plan: ActionPlan) {
  if ("widgetId" in action) return action.widgetId;
  if (action.type === "add_widget") return action.widget.id;
  return plan.target?.id;
}

function verifyWidgetChange(action: DashboardAction, before: DashboardWidget | undefined, after: DashboardWidget | undefined) {
  const errors: string[] = [];
  if ((action.type === "update_widget" || action.type === "change_chart_type" || action.type === "update_widget_visual_config" || action.type === "replace_widget") && !after) {
    errors.push("No encontre el widget final para verificar la accion.");
  }
  if (action.type === "change_chart_type" && after?.type !== action.chartType) {
    errors.push(`El widget final es ${after?.type ?? "ninguno"}, pero se pidio ${action.chartType}.`);
  }
  if (action.type === "update_widget" && action.changes.type && after?.type !== action.changes.type) {
    errors.push(`El widget final es ${after?.type ?? "ninguno"}, pero el plan pidio ${action.changes.type}.`);
  }
  if (action.type === "replace_widget" && before && after) {
    if (after.id !== before.id) errors.push("El reemplazo no conservo el id del widget seleccionado.");
    if (sameJson(before, after)) errors.push("El reemplazo no produjo cambios reales en el widget seleccionado.");
  }
  return errors;
}

export function verifyExecution(input: ExecutionVerificationInput): ExecutionVerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const widgetId = targetWidgetId(input.action, input.plan);
  const beforeWidget = widget(input.beforeDashboardSpec, widgetId);
  const afterWidget = widget(input.afterDashboardSpec, widgetId);

  errors.push(...verifyWidgetChange(input.action, beforeWidget, afterWidget));

  if (input.plan.changesVisualOnly || input.action.type === "update_widget_visual_config") {
    if (!sameJson(beforeWidget?.query, afterWidget?.query)) errors.push("La accion visual cambio la query del widget.");
    if (!sameJson(input.beforeViewState.filters, input.afterViewState.filters)) errors.push("La accion visual cambio filtros.");
    if (input.action.type === "update_widget_visual_config") {
      const expected = input.action.visualConfig.orientation;
      if (expected && afterWidget?.config.visualConfig?.orientation !== expected) {
        errors.push(`La orientacion final es ${afterWidget?.config.visualConfig?.orientation ?? "ninguna"}, pero se pidio ${expected}.`);
      }
    }
  }

  if (input.action.type === "add_widget" && input.afterDashboardSpec.widgets.length !== input.beforeDashboardSpec.widgets.length + 1) {
    errors.push("La accion de crear widget no agrego un widget nuevo.");
  }

  if (input.action.type === "replace_widget") {
    if (!input.plan.target || input.action.widgetId !== input.plan.target.id) errors.push("La accion de reemplazo no apunto al widget seleccionado.");
    if (input.afterDashboardSpec.widgets.length !== input.beforeDashboardSpec.widgets.length) errors.push("Reemplazar widget no debe cambiar la cantidad de widgets.");
  }

  if (input.action.type === "select_visible_columns" && !sameJson(input.afterViewState.dataExplorer?.visibleColumns, input.action.columns)) {
    errors.push("Las columnas visibles finales no coinciden con la accion.");
  }

  if (input.action.type === "add_filter" || input.action.type === "add_or_update_filter" || input.action.type === "update_filter") {
    const expectedFilter = input.action.filter;
    if (!input.afterViewState.filters.some((filter) => sameJson(filter, expectedFilter))) {
      errors.push("El filtro final no coincide con la accion solicitada.");
    }
  }

  if (input.action.type === "remove_filter") {
    const removedField = input.action.field;
    if (input.afterViewState.filters.some((filter) => filter.field === removedField)) {
      errors.push("El filtro solicitado sigue activo despues de removerlo.");
    }
  }

  if (input.action.type === "clear_filters" && input.afterViewState.filters.length > 0) {
    errors.push("La accion de limpiar filtros dejo filtros activos.");
  }

  if (input.action.type === "show_data_explorer" && input.afterViewState.dataExplorer?.isOpen !== true) {
    errors.push("La vista Datos no quedo abierta.");
  }

  if (input.action.type === "search_table" && input.afterViewState.dataExplorer?.search !== input.action.query) {
    errors.push("La busqueda final no coincide con la accion.");
  }

  if (input.action.type === "sort_table" && !sameJson(input.afterViewState.dataExplorer?.sort, { field: input.action.field, direction: input.action.direction })) {
    errors.push("El orden final de la tabla no coincide con la accion.");
  }

  return { success: errors.length === 0, errors, warnings };
}
