import type { DashboardAction, DashboardSpec, DashboardViewState } from "@/types/dashboard";
import { copilotActionSchema } from "@/lib/validation/copilot-actions";

export function applyDashboardAction(spec: DashboardSpec, viewState: DashboardViewState, action: DashboardAction) {
  const parsed = copilotActionSchema.safeParse(action);
  if (!parsed.success) {
    return { spec, viewState, message: "No pude aplicar la accion porque no paso la validacion estructurada." };
  }

  if (action.type === "update_widget") {
    return {
      viewState,
      spec: {
        ...spec,
        widgets: spec.widgets.map((widget) => (widget.id === action.widgetId ? { ...widget, ...action.changes, config: { ...widget.config, ...action.changes.config } } : widget)),
        updatedAt: new Date().toISOString()
      },
      message: "Listo. Actualice el widget solicitado usando una accion estructurada validada."
    };
  }

  if (action.type === "change_chart_type") {
    return {
      viewState,
      spec: {
        ...spec,
        widgets: spec.widgets.map((widget) => (widget.id === action.widgetId ? { ...widget, type: action.chartType } : widget)),
        updatedAt: new Date().toISOString()
      },
      message: "Cambie el tipo de grafico usando una accion validada."
    };
  }

  if (action.type === "add_filter") {
    return {
      spec,
      viewState: {
        ...viewState,
        filters: [...(viewState.filters ?? []).filter((filter) => filter.field !== action.filter.field), action.filter]
      },
      message: "Aplique el filtro solicitado al estado de vista."
    };
  }

  if (action.type === "clear_filters") {
    return { spec, viewState: { ...viewState, filters: [], selectedDateRange: undefined }, message: "Limpie los filtros activos del dashboard." };
  }

  if (action.type === "explain_widget") {
    return { spec, viewState: { ...viewState, highlightedWidgetId: action.widgetId }, message: "Resalte el widget para explicar su lectura." };
  }

  if (action.type === "update_view_state") {
    return { spec, viewState: { ...viewState, ...action.viewState }, message: "Aplique el cambio de vista solicitado." };
  }

  if (action.type === "remove_widget") {
    return { spec: { ...spec, widgets: spec.widgets.filter((widget) => widget.id !== action.widgetId), updatedAt: new Date().toISOString() }, viewState, message: "Quite el widget del dashboard." };
  }

  if (action.type === "add_widget") {
    return { spec: { ...spec, widgets: [...spec.widgets, action.widget], updatedAt: new Date().toISOString() }, viewState, message: "Agregue el widget al dashboard." };
  }

  return { spec, viewState, message: "Puedo crear la presentacion desde el constructor interactivo." };
}
