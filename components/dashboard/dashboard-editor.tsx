"use client";

import { BarChart3, Copy, Eye, EyeOff, Trash2 } from "lucide-react";
import { compatibleWidgetTypes } from "@/lib/dashboard-spec/edit-dashboard-spec";
import { useDashPilotStore } from "@/lib/store/app-store";
import { cn } from "@/lib/utils";
import type { DashboardQuerySpec, DashboardWidget, WidgetType } from "@/types/dashboard";

const aggregations: NonNullable<DashboardQuerySpec["metric"]>["aggregation"][] = ["sum", "avg", "count", "min", "max"];

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function labelFor(field: string, columns: { normalizedName: string; displayName: string }[]) {
  return columns.find((column) => column.normalizedName === field)?.displayName ?? field;
}

function queryWithMetric(query: DashboardQuerySpec | undefined, field: string): DashboardQuerySpec {
  const next = { ...(query ?? {}) };
  if (!field) {
    delete next.metric;
    return next;
  }
  return { ...next, metric: { field, aggregation: query?.metric?.aggregation ?? "sum" } };
}

function queryWithAggregation(query: DashboardQuerySpec | undefined, aggregation: NonNullable<DashboardQuerySpec["metric"]>["aggregation"]): DashboardQuerySpec {
  if (!query?.metric?.field) return query ?? {};
  return { ...query, metric: { field: query.metric.field, aggregation } };
}

function queryWithDimension(widget: DashboardWidget, field: string): DashboardQuerySpec {
  const query = widget.query ?? {};
  if (!field) {
    const next = { ...query };
    delete next.x;
    delete next.groupBy;
    return next;
  }
  if (widget.type === "line_chart" || query.x) return { ...query, x: { ...(query.x ?? {}), field } };
  return { ...query, groupBy: [field] };
}

function queryWithLimit(query: DashboardQuerySpec | undefined, limit: number): DashboardQuerySpec {
  return { ...(query ?? {}), limit };
}

function supportsQueryControls(widget: DashboardWidget) {
  return ["kpi_card", "line_chart", "bar_chart", "area_chart", "donut_chart", "scatter_plot"].includes(widget.type);
}

function supportsDimension(widget: DashboardWidget) {
  return ["line_chart", "bar_chart", "area_chart", "donut_chart", "scatter_plot", "map"].includes(widget.type);
}

function supportsLimit(widget: DashboardWidget) {
  return supportsDimension(widget) || widget.type === "table";
}

export function DashboardEditor() {
  const profile = useDashPilotStore((state) => state.profile);
  const draft = useDashPilotStore((state) => state.dashboardEditDraft);
  const updateTitle = useDashPilotStore((state) => state.updateDashboardDraftTitle);
  const updateWidget = useDashPilotStore((state) => state.updateDashboardDraftWidget);
  const duplicateWidget = useDashPilotStore((state) => state.duplicateDashboardDraftWidget);
  const removeWidget = useDashPilotStore((state) => state.removeDashboardDraftWidget);
  const setHidden = useDashPilotStore((state) => state.setDashboardDraftWidgetHidden);

  if (!draft) return null;

  const metricOptions = unique([
    ...profile.detectedMetricColumns,
    ...profile.columns.filter((column) => ["number", "currency", "percentage"].includes(column.inferredType)).map((column) => column.normalizedName)
  ]);
  const dimensionOptions = unique([
    ...profile.detectedDateColumns,
    ...profile.detectedGeoColumns,
    ...profile.detectedDimensionColumns,
    ...profile.columns.filter((column) => !metricOptions.includes(column.normalizedName)).map((column) => column.normalizedName)
  ]);

  return (
    <aside className="fixed bottom-0 right-0 top-20 z-20 hidden w-[360px] overflow-y-auto border-l border-[#e3e8f5] bg-white p-5 xl:block" aria-label="Editor de dashboard">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-[#f0f1ff] text-[#3d35ff]">
          <BarChart3 className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold">Editar dashboard</h2>
          <p className="text-xs font-semibold text-[#697597]">Los cambios se guardan en DashboardSpec.</p>
        </div>
      </div>

      <label className="mt-6 block text-sm font-bold text-[#34405f]" htmlFor="dashboard-title">
        Titulo del dashboard
      </label>
      <input
        id="dashboard-title"
        className="focus-ring mt-2 h-10 w-full rounded-lg border border-[#dfe5f0] px-3 text-sm"
        value={draft.title}
        onChange={(event) => updateTitle(event.target.value)}
      />

      <div className="mt-7 space-y-4">
        {draft.widgets.map((widget) => {
          const typeOptions = compatibleWidgetTypes(widget);
          const hidden = widget.config.hidden === true;
          const dimensionField = widget.query?.x?.field ?? widget.query?.groupBy?.[0] ?? "";
          const limit = Number(widget.query?.limit ?? widget.config.limit ?? 5);

          return (
            <section key={widget.id} className={cn("rounded-lg border border-[#dfe5f0] p-4", hidden && "bg-[#f8faff] opacity-75")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#071334]">{widget.title}</p>
                  <p className="mt-1 text-xs font-semibold text-[#697597]">{widget.type}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" className="focus-ring grid size-8 place-items-center rounded-md text-[#536088] hover:bg-[#f1f4ff]" onClick={() => duplicateWidget(widget.id)} aria-label={`Duplicar ${widget.title}`}>
                    <Copy className="size-4" />
                  </button>
                  <button type="button" className="focus-ring grid size-8 place-items-center rounded-md text-[#536088] hover:bg-[#f1f4ff]" onClick={() => setHidden(widget.id, !hidden)} aria-label={hidden ? `Mostrar ${widget.title}` : `Ocultar ${widget.title}`}>
                    {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </button>
                  <button type="button" className="focus-ring grid size-8 place-items-center rounded-md text-red-600 hover:bg-red-50" onClick={() => removeWidget(widget.id)} aria-label={`Eliminar ${widget.title}`}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block text-xs font-bold text-[#34405f]">
                  Titulo del widget
                  <input
                    className="focus-ring mt-1 h-9 w-full rounded-md border border-[#dfe5f0] px-3 text-sm font-medium"
                    value={widget.title}
                    onChange={(event) => updateWidget(widget.id, { title: event.target.value })}
                  />
                </label>

                <label className="block text-xs font-bold text-[#34405f]">
                  Tipo compatible
                  <select
                    className="focus-ring mt-1 h-9 w-full rounded-md border border-[#dfe5f0] bg-white px-3 text-sm"
                    value={widget.type}
                    disabled={typeOptions.length === 1}
                    onChange={(event) => updateWidget(widget.id, { type: event.target.value as WidgetType })}
                  >
                    {typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>

                {supportsQueryControls(widget) && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-xs font-bold text-[#34405f]">
                      Metrica
                      <select
                        className="focus-ring mt-1 h-9 w-full rounded-md border border-[#dfe5f0] bg-white px-2 text-sm"
                        value={widget.query?.metric?.field ?? ""}
                        onChange={(event) => updateWidget(widget.id, { query: queryWithMetric(widget.query, event.target.value) })}
                      >
                        <option value="">Sin metrica</option>
                        {metricOptions.map((field) => <option key={field} value={field}>{labelFor(field, profile.columns)}</option>)}
                      </select>
                    </label>
                    <label className="block text-xs font-bold text-[#34405f]">
                      Agregacion
                      <select
                        className="focus-ring mt-1 h-9 w-full rounded-md border border-[#dfe5f0] bg-white px-2 text-sm"
                        value={widget.query?.metric?.aggregation ?? "sum"}
                        onChange={(event) => updateWidget(widget.id, { query: queryWithAggregation(widget.query, event.target.value as NonNullable<DashboardQuerySpec["metric"]>["aggregation"]) })}
                      >
                        {aggregations.map((aggregation) => <option key={aggregation} value={aggregation}>{aggregation}</option>)}
                      </select>
                    </label>
                  </div>
                )}

                {supportsDimension(widget) && (
                  <label className="block text-xs font-bold text-[#34405f]">
                    Dimension
                    <select
                      className="focus-ring mt-1 h-9 w-full rounded-md border border-[#dfe5f0] bg-white px-3 text-sm"
                      value={dimensionField}
                      onChange={(event) => updateWidget(widget.id, { query: queryWithDimension(widget, event.target.value) })}
                    >
                      <option value="">Sin dimension</option>
                      {dimensionOptions.map((field) => <option key={field} value={field}>{labelFor(field, profile.columns)}</option>)}
                    </select>
                  </label>
                )}

                {supportsLimit(widget) && (
                  <label className="block text-xs font-bold text-[#34405f]">
                    Limite top N
                    <input
                      className="focus-ring mt-1 h-9 w-full rounded-md border border-[#dfe5f0] px-3 text-sm"
                      min={1}
                      max={50}
                      type="number"
                      value={limit}
                      onChange={(event) => updateWidget(widget.id, { query: queryWithLimit(widget.query, Number(event.target.value) || 1), config: widget.type === "table" ? { limit: Number(event.target.value) || 1 } : undefined })}
                    />
                  </label>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
