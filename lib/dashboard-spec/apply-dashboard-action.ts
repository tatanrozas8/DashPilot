import type { DashboardAction, DashboardSpec, DashboardViewState } from "@/types/dashboard";
import { copilotActionSchema } from "@/lib/validation/copilot-actions";
import { duplicateDashboardWidget, moveDashboardWidget, reorderDashboardWidgets, updateDashboardDesign, updateDashboardSubtitle, updateDashboardTitle, updateDashboardWidget } from "@/lib/dashboard-spec/edit-dashboard-spec";

function targetTypeForWidget(type: DashboardSpec["widgets"][number]["type"]) {
  if (type === "kpi_card") return "kpi" as const;
  if (type === "table") return "table" as const;
  return "widget" as const;
}

function capabilitiesForWidget(type: DashboardSpec["widgets"][number]["type"]) {
  const base = ["select", "explain"];
  if (type === "bar_chart") return [...base, "change_chart_type", "update_query", "orientation", "resize", "duplicate", "remove"];
  if (["line_chart", "area_chart", "donut_chart", "scatter_plot"].includes(type)) return [...base, "change_chart_type", "update_query", "resize", "duplicate", "remove"];
  if (type === "kpi_card") return [...base, "update_query", "rename", "resize", "duplicate", "remove"];
  if (type === "table") return [...base, "select_columns", "open_data", "resize", "duplicate", "remove"];
  return base;
}

function selectedTargetViewState(spec: DashboardSpec, viewState: DashboardViewState, targetId?: string) {
  const widget = targetId ? spec.widgets.find((item) => item.id === targetId) : undefined;
  if (!widget) {
    return {
      ...viewState,
      highlightedWidgetId: undefined,
      selectedTargetType: "none" as const,
      selectedTargetId: undefined,
      selectedTargetTitle: undefined,
      selectedTargetSpec: undefined,
      selectedTargetCapabilities: []
    };
  }
  return {
    ...viewState,
    highlightedWidgetId: widget.id,
    selectedTargetType: targetTypeForWidget(widget.type),
    selectedTargetId: widget.id,
    selectedTargetTitle: widget.title,
    selectedTargetSpec: widget,
    selectedTargetCapabilities: capabilitiesForWidget(widget.type)
  };
}

export function applyDashboardAction(spec: DashboardSpec, viewState: DashboardViewState, action: DashboardAction): { spec: DashboardSpec; viewState: DashboardViewState; message: string } {
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

  if (action.type === "update_widget_visual_config") {
    const current = spec.widgets.find((widget) => widget.id === action.widgetId);
    const orientation = action.visualConfig.orientation;
    const nextConfig = {
      ...current?.config,
      visualConfig: {
        ...(current?.config.visualConfig ?? {}),
        ...action.visualConfig
      },
      ...(orientation ? { horizontal: orientation === "horizontal" } : {})
    };
    return {
      viewState: selectedTargetViewState(spec, viewState, action.widgetId),
      spec: {
        ...spec,
        widgets: spec.widgets.map((widget) => (widget.id === action.widgetId ? { ...widget, config: nextConfig } : widget)),
        updatedAt: new Date().toISOString()
      },
      message: orientation
        ? `Listo. Cambie solo la orientacion del grafico seleccionado a ${orientation}. No modifique metrica, filtros ni dimension.`
        : "Listo. Actualice solo la configuracion visual del widget seleccionado."
    };
  }

  if (action.type === "select_target") {
    if (action.targetType === "dashboard") {
      return {
        spec,
        viewState: {
          ...viewState,
          highlightedWidgetId: undefined,
          selectedTargetType: "dashboard",
          selectedTargetId: spec.id,
          selectedTargetTitle: spec.title,
          selectedTargetSpec: spec,
          selectedTargetCapabilities: ["update_design", "reorder_widgets", "create_widget", "presentation"]
        },
        message: "Seleccione el dashboard completo como objetivo del Copiloto."
      };
    }
    return { spec, viewState: selectedTargetViewState(spec, viewState, action.targetId), message: "Seleccione el elemento como objetivo del Copiloto." };
  }

  if (action.type === "clear_selected_target") {
    return { spec, viewState: selectedTargetViewState(spec, viewState), message: "Quite la seleccion actual del Copiloto." };
  }

  if (action.type === "replace_widget") {
    return {
      viewState: selectedTargetViewState({ ...spec, widgets: spec.widgets.map((widget) => (widget.id === action.widgetId ? { ...action.widget, id: action.widgetId } : widget)) }, viewState, action.widgetId),
      spec: {
        ...spec,
        widgets: spec.widgets.map((widget) => (widget.id === action.widgetId ? { ...action.widget, id: action.widgetId } : widget)),
        updatedAt: new Date().toISOString()
      },
      message: "Reemplace el widget seleccionado con la nueva especificacion validada."
    };
  }

  if (action.type === "undo_last_action") {
    return { spec, viewState, message: "Deshice el ultimo cambio del Copiloto." };
  }

  if (action.type === "update_dashboard_title") {
    return {
      spec: updateDashboardTitle(spec, action.title),
      viewState,
      message: `Actualice el titulo del dashboard a "${action.title}".`
    };
  }

  if (action.type === "update_dashboard_subtitle") {
    return {
      spec: updateDashboardSubtitle(spec, action.subtitle),
      viewState,
      message: "Actualice el subtitulo del dashboard."
    };
  }

  if (action.type === "update_dashboard_design") {
    return {
      spec: updateDashboardDesign(spec, action.design),
      viewState,
      message: "Actualice el estilo visual del dashboard desde DashboardSpec."
    };
  }

  if (action.type === "update_widget_title") {
    return {
      spec: updateDashboardWidget(spec, action.widgetId, { title: action.title }),
      viewState,
      message: `Actualice el titulo del widget a "${action.title}".`
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

  if (action.type === "resize_widget") {
    return {
      spec: updateDashboardWidget(spec, action.widgetId, { position: action.position }),
      viewState,
      message: "Redimensione el widget solicitado."
    };
  }

  if (action.type === "move_widget") {
    return {
      spec: moveDashboardWidget(spec, action.sourceWidgetId, action.targetWidgetId),
      viewState,
      message: "Movi el widget solicitado."
    };
  }

  if (action.type === "show_widget_data") {
    const widget = spec.widgets.find((item) => item.id === action.widgetId);
    const columns = [...new Set([widget?.query?.x?.field, ...(widget?.query?.groupBy ?? []), widget?.query?.seriesBy, widget?.query?.metric?.field].filter((field): field is string => Boolean(field)))];
    return {
      spec,
      viewState: { ...viewState, highlightedWidgetId: action.widgetId, dataExplorer: { ...viewState.dataExplorer, isOpen: true, visibleColumns: columns.length ? columns : viewState.dataExplorer?.visibleColumns } },
      message: "Abri la vista Datos enfocada en el widget solicitado."
    };
  }

  if (action.type === "add_filter" || action.type === "add_or_update_filter" || action.type === "update_filter") {
    return {
      spec,
      viewState: {
        ...viewState,
        filters: [...(viewState.filters ?? []).filter((filter) => filter.field !== action.filter.field), action.filter]
      },
      message: "Aplique el filtro solicitado al estado de vista."
    };
  }

  if (action.type === "remove_filter") {
    return {
      spec,
      viewState: {
        ...viewState,
        filters: (viewState.filters ?? []).filter((filter) => filter.field !== action.field)
      },
      message: "Quite el filtro solicitado."
    };
  }

  if (action.type === "clear_filters") {
    return { spec, viewState: { ...viewState, filters: [], selectedDateRange: undefined }, message: "Limpie los filtros activos del dashboard." };
  }

  if (action.type === "show_data_explorer") {
    return { spec, viewState: { ...viewState, dataExplorer: { ...viewState.dataExplorer, isOpen: true } }, message: "Abri la vista Datos para explorar la tabla completa." };
  }

  if (action.type === "search_table") {
    return { spec, viewState: { ...viewState, dataExplorer: { ...viewState.dataExplorer, isOpen: true, search: action.query } }, message: `Busque "${action.query}" en toda la tabla.` };
  }

  if (action.type === "select_visible_columns") {
    return { spec, viewState: { ...viewState, dataExplorer: { ...viewState.dataExplorer, isOpen: true, visibleColumns: action.columns } }, message: "Actualice las columnas visibles en la vista Datos." };
  }

  if (action.type === "sort_table") {
    return { spec, viewState: { ...viewState, dataExplorer: { ...viewState.dataExplorer, isOpen: true, sort: { field: action.field, direction: action.direction } } }, message: "Ordene la tabla con la columna solicitada." };
  }

  if (action.type === "group_by") {
    return { spec, viewState: { ...viewState, dataExplorer: { ...viewState.dataExplorer, isOpen: true, visibleColumns: action.fields } }, message: "Prepare la vista Datos agrupando visualmente por las columnas solicitadas." };
  }

  if (action.type === "explain_dataset") {
    return { spec, viewState: { ...viewState, dataExplorer: { ...viewState.dataExplorer, isOpen: true } }, message: "Abri la vista Datos para revisar columnas, tipos y calidad del Excel." };
  }

  if (action.type === "explain_column") {
    return { spec, viewState: { ...viewState, dataExplorer: { ...viewState.dataExplorer, isOpen: true, visibleColumns: [action.field] } }, message: `Enfoque la columna ${action.field} en la vista Datos.` };
  }

  if (action.type === "explain_widget") {
    return { spec, viewState: { ...viewState, highlightedWidgetId: action.widgetId }, message: "Resalte el widget para explicar su lectura." };
  }

  if (action.type === "focus_widget") {
    return { spec, viewState: { ...viewState, highlightedWidgetId: action.widgetId }, message: "Enfoque el widget solicitado en la vista." };
  }

  if (action.type === "update_view_state") {
    return { spec, viewState: { ...viewState, ...action.viewState }, message: "Aplique el cambio de vista solicitado." };
  }

  if (action.type === "remove_widget") {
    return { spec: { ...spec, widgets: spec.widgets.filter((widget) => widget.id !== action.widgetId), updatedAt: new Date().toISOString() }, viewState, message: "Quite el widget del dashboard." };
  }

  if (action.type === "duplicate_widget") {
    return { spec: duplicateDashboardWidget(spec, action.widgetId), viewState, message: "Duplique el widget solicitado para explorar una variante." };
  }

  if (action.type === "reorder_widgets") {
    return {
      spec: reorderDashboardWidgets(spec, action.widgetIds),
      viewState,
      message: "Reordene los widgets segun la prioridad solicitada."
    };
  }

  if (action.type === "generate_insight") {
    const widget = {
      id: `ai_insight_${spec.widgets.length + 1}`,
      type: "insight_text",
      title: "Insight del Copiloto",
      config: { bullets: [action.content] },
      position: { x: 0, y: Math.max(0, ...spec.widgets.map((item) => item.position.y + item.position.h)), w: 12, h: 2 }
    } satisfies DashboardSpec["widgets"][number];
    return {
      spec: {
        ...spec,
        widgets: [...spec.widgets, widget],
        updatedAt: new Date().toISOString()
      },
      viewState,
      message: "Agregue un insight basado en la lectura del dashboard."
    };
  }

  if (action.type === "create_calculated_metric") {
    return {
      spec: {
        ...spec,
        executiveSummary: `${spec.executiveSummary ?? ""} Metrica calculada propuesta: ${action.title} = ${action.formula}.`.trim(),
        updatedAt: new Date().toISOString()
      },
      viewState,
      message: "Registre la metrica calculada como propuesta validada. Requiere confirmacion antes de materializarla en el dataset."
    };
  }

  if (action.type === "add_widget") {
    return { spec: { ...spec, widgets: [...spec.widgets, action.widget], updatedAt: new Date().toISOString() }, viewState, message: "Agregue el widget al dashboard." };
  }

  return { spec, viewState, message: "Puedo crear la presentacion desde el constructor interactivo." };
}
