import { z } from "zod";
import type { DashboardAction, DashboardSpec, DashboardViewState } from "@/types/dashboard";

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add_widget"), widget: z.any() }),
  z.object({ type: z.literal("update_widget"), widgetId: z.string(), changes: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("remove_widget"), widgetId: z.string() }),
  z.object({ type: z.literal("add_filter"), filter: z.any() }),
  z.object({ type: z.literal("update_view_state"), viewState: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("generate_presentation"), options: z.record(z.string(), z.unknown()) })
]);

export function applyDashboardAction(spec: DashboardSpec, viewState: DashboardViewState, action: DashboardAction) {
  const parsed = actionSchema.safeParse(action);
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

  if (action.type === "add_filter") {
    if (spec.globalFilters.some((filter) => filter.id === action.filter.id)) {
      return { spec, viewState, message: "Ese filtro ya existe en el dashboard." };
    }
    return { spec: { ...spec, globalFilters: [...spec.globalFilters, action.filter] }, viewState, message: "Agregue el filtro al dashboard." };
  }

  if (action.type === "update_view_state") {
    return { spec, viewState: { ...viewState, ...action.viewState }, message: "Aplique el cambio de vista solicitado." };
  }

  if (action.type === "remove_widget") {
    return { spec: { ...spec, widgets: spec.widgets.filter((widget) => widget.id !== action.widgetId) }, viewState, message: "Quite el widget del dashboard." };
  }

  if (action.type === "add_widget") {
    return { spec: { ...spec, widgets: [...spec.widgets, action.widget] }, viewState, message: "Agregue el widget al dashboard." };
  }

  return { spec, viewState, message: "Puedo crear la presentacion desde el constructor interactivo." };
}
