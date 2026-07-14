import type { DashboardDesignSettings, DashboardSpec, DashboardWidget, WidgetType } from "@/types/dashboard";

const chartTypes: WidgetType[] = ["line_chart", "bar_chart"];
export const DEFAULT_DASHBOARD_DESIGN: Required<DashboardDesignSettings> = {
  density: "comfortable",
  accentColor: "indigo",
  cardStyle: "soft",
  chartPalette: "default"
};

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

function orderedWidgets(spec: DashboardSpec, widgetIds: string[]) {
  const requested = new Map(widgetIds.map((widgetId, index) => [widgetId, index]));
  return [...spec.widgets].sort((left, right) => {
    const leftOrder = requested.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = requested.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return spec.widgets.indexOf(left) - spec.widgets.indexOf(right);
  });
}

export function packDashboardWidgets(widgets: DashboardWidget[]): DashboardWidget[] {
  let x = 0;
  let y = 0;
  let rowHeight = 1;

  return widgets.map((widget) => {
    const width = Math.max(1, Math.min(12, widget.position.w));
    const height = Math.max(1, widget.position.h);
    if (x > 0 && x + width > 12) {
      x = 0;
      y += rowHeight;
      rowHeight = 1;
    }
    const packed = { ...widget, position: { ...widget.position, x, y, w: width, h: height } };
    x += width;
    rowHeight = Math.max(rowHeight, height);
    if (x >= 12) {
      x = 0;
      y += rowHeight;
      rowHeight = 1;
    }
    return packed;
  });
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

export function normalizeDashboardDesign(design?: DashboardDesignSettings): Required<DashboardDesignSettings> {
  return {
    ...DEFAULT_DASHBOARD_DESIGN,
    ...(design ?? {})
  };
}

export function updateDashboardDesign(spec: DashboardSpec, design: DashboardDesignSettings): DashboardSpec {
  return touch({
    ...spec,
    design: normalizeDashboardDesign({ ...spec.design, ...design })
  });
}

export function reorderDashboardWidgets(spec: DashboardSpec, widgetIds: string[]): DashboardSpec {
  const existingIds = new Set(spec.widgets.map((widget) => widget.id));
  const requested = widgetIds.filter((widgetId) => existingIds.has(widgetId));
  if (!requested.length) return spec;
  const missing = spec.widgets.map((widget) => widget.id).filter((widgetId) => !requested.includes(widgetId));
  return touch({
    ...spec,
    widgets: packDashboardWidgets(orderedWidgets(spec, [...requested, ...missing]))
  });
}

export function moveDashboardWidget(spec: DashboardSpec, sourceWidgetId: string, targetWidgetId: string): DashboardSpec {
  if (sourceWidgetId === targetWidgetId) return spec;
  const ids = spec.widgets.map((widget) => widget.id);
  const sourceIndex = ids.indexOf(sourceWidgetId);
  const targetIndex = ids.indexOf(targetWidgetId);
  if (sourceIndex < 0 || targetIndex < 0) return spec;
  const next = [...ids];
  const [source] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, source);
  return reorderDashboardWidgets(spec, next);
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
