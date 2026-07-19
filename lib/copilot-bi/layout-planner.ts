import type { DashboardWidget } from "@/types/dashboard";

const layoutByType: Record<string, { w: number; h: number }> = {
  kpi_card: { w: 3, h: 1 },
  line_chart: { w: 6, h: 3 },
  bar_chart: { w: 6, h: 3 },
  table: { w: 8, h: 3 },
  insight_text: { w: 4, h: 3 }
};

export function layoutWidgets(widgets: DashboardWidget[]) {
  let kpiIndex = 0;
  let chartIndex = 0;
  let detailY = 5;
  return widgets.map((widget) => {
    if (widget.type === "kpi_card") {
      const position = { x: (kpiIndex % 4) * 3, y: Math.floor(kpiIndex / 4), w: 3, h: 1 };
      kpiIndex += 1;
      return { ...widget, position };
    }
    if (["line_chart", "bar_chart", "area_chart", "donut_chart", "scatter_plot"].includes(widget.type)) {
      const base = layoutByType[widget.type] ?? { w: 6, h: 3 };
      const position = { x: (chartIndex % 2) * 6, y: 1 + Math.floor(chartIndex / 2) * 3, ...base };
      chartIndex += 1;
      return { ...widget, position };
    }
    const base = layoutByType[widget.type] ?? { w: 12, h: 2 };
    const position = { x: widget.type === "insight_text" ? 8 : 0, y: detailY, ...base };
    detailY += base.h;
    return { ...widget, position };
  });
}
