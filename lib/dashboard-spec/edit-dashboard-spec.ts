import type { DashboardSpec, DashboardWidget, WidgetType } from "@/types/dashboard";

const chartTypes: WidgetType[] = ["line_chart", "bar_chart"];

function touch(spec: DashboardSpec): DashboardSpec {
  return { ...spec, updatedAt: new Date().toISOString() };
}

function nextCopyId(widgets: DashboardWidget[], widgetId: string) {
  const ids = new Set(widgets.map((widget) => widget.id));
  let index = 1;
  let next = `${widgetId}_copy`;
  while (ids.has(next)) {
    index += 1;
    next = `${widgetId}_copy_${index}`;
  }
  return next;
}

export function compatibleWidgetTypes(widget: DashboardWidget): WidgetType[] {
  return chartTypes.includes(widget.type) ? chartTypes : [widget.type];
}

export function updateDashboardTitle(spec: DashboardSpec, title: string): DashboardSpec {
  const trimmed = title.trim();
  return touch({ ...spec, title: trimmed || spec.title });
}

export function updateDashboardSubtitle(spec: DashboardSpec, subtitle: string): DashboardSpec {
  return touch({ ...spec, subtitle: subtitle.trim() || undefined });
}

export function updateDashboardWidget(spec: DashboardSpec, widgetId: string, changes: Partial<DashboardWidget>): DashboardSpec {
  return touch({
    ...spec,
    widgets: spec.widgets.map((widget) =>
      widget.id === widgetId
        ? {
            ...widget,
            ...changes,
            query: changes.query === undefined ? widget.query : changes.query,
            config: changes.config ? { ...widget.config, ...changes.config } : widget.config,
            position: changes.position ?? widget.position
          }
        : widget
    )
  });
}

export function duplicateDashboardWidget(spec: DashboardSpec, widgetId: string): DashboardSpec {
  const widget = spec.widgets.find((item) => item.id === widgetId);
  if (!widget) return spec;
  const copy: DashboardWidget = {
    ...widget,
    id: nextCopyId(spec.widgets, widgetId),
    title: `${widget.title} copia`,
    config: { ...widget.config, hidden: false },
    position: { ...widget.position, y: widget.position.y + widget.position.h }
  };
  return touch({ ...spec, widgets: [...spec.widgets, copy] });
}

export function removeDashboardWidget(spec: DashboardSpec, widgetId: string): DashboardSpec {
  return touch({ ...spec, widgets: spec.widgets.filter((widget) => widget.id !== widgetId) });
}

export function setDashboardWidgetHidden(spec: DashboardSpec, widgetId: string, hidden: boolean): DashboardSpec {
  return updateDashboardWidget(spec, widgetId, { config: { hidden } });
}
