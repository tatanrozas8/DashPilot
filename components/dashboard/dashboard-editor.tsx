"use client";

import { useState } from "react";
import { BarChart3, Copy, Eye, EyeOff, Palette, Save, Trash2 } from "lucide-react";
import { StatusBadge, Tabs } from "@/components/shared/ui";
import { compatibleWidgetTypes, normalizeDashboardDesign } from "@/lib/dashboard-spec/edit-dashboard-spec";
import { useDashPilotStore } from "@/lib/store/app-store";
import { cn } from "@/lib/utils";
import type { DashboardDesignSettings, DashboardQuerySpec, DashboardWidget, WidgetType } from "@/types/dashboard";

const aggregations: NonNullable<DashboardQuerySpec["metric"]>["aggregation"][] = ["sum", "avg", "count", "count_distinct", "min", "max"];
const densityOptions: Array<[Required<DashboardDesignSettings>["density"], string]> = [["comfortable", "Comodo"], ["compact", "Compacto"]];
const accentOptions: Array<[Required<DashboardDesignSettings>["accentColor"], string]> = [["indigo", "Azul"], ["emerald", "Verde"], ["sky", "Celeste"], ["slate", "Sobrio"]];
const cardStyleOptions: Array<[Required<DashboardDesignSettings>["cardStyle"], string]> = [["soft", "Suave"], ["bordered", "Bordeado"]];
const paletteOptions: Array<[Required<DashboardDesignSettings>["chartPalette"], string]> = [["default", "Default"], ["business", "Business"], ["contrast", "Contraste"]];
type EditorTab = "data" | "visual" | "format" | "interaction";

const editorTabs: Array<{ value: EditorTab; label: string }> = [
  { value: "data", label: "Datos" },
  { value: "visual", label: "Visual" },
  { value: "format", label: "Formato" },
  { value: "interaction", label: "Interaccion" }
];

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
  const updateSubtitle = useDashPilotStore((state) => state.updateDashboardDraftSubtitle);
  const updateDesign = useDashPilotStore((state) => state.updateDashboardDraftDesign);
  const savedThemes = useDashPilotStore((state) => state.savedThemes);
  const saveTheme = useDashPilotStore((state) => state.saveDashboardTheme);
  const applyTheme = useDashPilotStore((state) => state.applySavedDashboardTheme);
  const deleteTheme = useDashPilotStore((state) => state.deleteSavedDashboardTheme);
  const updateWidget = useDashPilotStore((state) => state.updateDashboardDraftWidget);
  const duplicateWidget = useDashPilotStore((state) => state.duplicateDashboardDraftWidget);
  const removeWidget = useDashPilotStore((state) => state.removeDashboardDraftWidget);
  const setHidden = useDashPilotStore((state) => state.setDashboardDraftWidgetHidden);

  const [themeName, setThemeName] = useState("");
  const [activeTab, setActiveTab] = useState<EditorTab>("data");

  if (!draft) return null;

  const design = normalizeDashboardDesign(draft.design);
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
  const hasQueryInputs = metricOptions.length > 0 || dimensionOptions.length > 0;

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

      <Tabs value={activeTab} items={editorTabs} onChange={setActiveTab} ariaLabel="Secciones del editor de dashboard" className="mt-5 w-full justify-between" />
      <div className="mt-4 rounded-lg border border-[#edf1fa] bg-[#fbfcff] p-3 text-xs font-semibold leading-5 text-[#536088]">
        {activeTab === "data" && (hasQueryInputs ? "Valida metrica, dimension y limite antes de guardar." : "No hay columnas suficientes para editar consultas. Revisa el preview del dataset.")}
        {activeTab === "visual" && "Cambia el tipo de widget solo entre visualizaciones compatibles."}
        {activeTab === "format" && "Ajusta texto, densidad, color, tarjetas y temas guardados."}
        {activeTab === "interaction" && "Configura visibilidad, limites e interacciones sin mutar filas fuente."}
      </div>

      {activeTab === "format" && <>
      <label className="mt-6 block text-sm font-bold text-[#34405f]" htmlFor="dashboard-title">
        Titulo del dashboard
      </label>
      <input
        id="dashboard-title"
        className="focus-ring mt-2 h-10 w-full rounded-lg border border-[#dfe5f0] px-3 text-sm"
        value={draft.title}
        onChange={(event) => updateTitle(event.target.value)}
      />

      <label className="mt-4 block text-sm font-bold text-[#34405f]" htmlFor="dashboard-subtitle">
        Subtitulo
      </label>
      <textarea
        id="dashboard-subtitle"
        className="focus-ring mt-2 min-h-20 w-full rounded-lg border border-[#dfe5f0] px-3 py-2 text-sm"
        value={draft.subtitle ?? ""}
        onChange={(event) => updateSubtitle(event.target.value)}
      />

      <section className="mt-6 rounded-lg border border-[#dfe5f0] p-4">
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-[#3d35ff]" />
          <h3 className="text-sm font-bold text-[#071334]">Estilo visual</h3>
        </div>
        <div className="mt-4 space-y-4">
          <label className="block text-xs font-bold text-[#34405f]">
            Densidad
            <div className="mt-2 grid grid-cols-2 gap-2">
              {densityOptions.map(([value, label]) => (
                <button key={value} type="button" onClick={() => updateDesign({ density: value })} className={cn("focus-ring rounded-md border px-3 py-2 text-xs font-semibold", design.density === value ? "border-[#3d35ff] bg-[#f0f1ff] text-[#3d35ff]" : "border-[#dfe5f0] text-[#536088] hover:bg-[#f6f7ff]")}>{label}</button>
              ))}
            </div>
          </label>

          <label className="block text-xs font-bold text-[#34405f]">
            Color principal
            <div className="mt-2 grid grid-cols-4 gap-2">
              {accentOptions.map(([value, label]) => (
                <button key={value} type="button" onClick={() => updateDesign({ accentColor: value })} className={cn("focus-ring rounded-md border px-2 py-2 text-xs font-semibold", design.accentColor === value ? "border-[#3d35ff] bg-[#f0f1ff] text-[#3d35ff]" : "border-[#dfe5f0] text-[#536088] hover:bg-[#f6f7ff]")}>{label}</button>
              ))}
            </div>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-bold text-[#34405f]">
              Tarjetas
              <select className="focus-ring mt-1 h-9 w-full rounded-md border border-[#dfe5f0] bg-white px-2 text-sm" value={design.cardStyle} onChange={(event) => updateDesign({ cardStyle: event.target.value as Required<DashboardDesignSettings>["cardStyle"] })}>
                {cardStyleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold text-[#34405f]">
              Paleta
              <select className="focus-ring mt-1 h-9 w-full rounded-md border border-[#dfe5f0] bg-white px-2 text-sm" value={design.chartPalette} onChange={(event) => updateDesign({ chartPalette: event.target.value as Required<DashboardDesignSettings>["chartPalette"] })}>
                {paletteOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <div className="rounded-lg bg-[#f8faff] p-3">
            <label className="block text-xs font-bold text-[#34405f]">
              Guardar tema
              <div className="mt-2 flex gap-2">
                <input className="focus-ring h-9 min-w-0 flex-1 rounded-md border border-[#dfe5f0] bg-white px-3 text-sm" value={themeName} onChange={(event) => setThemeName(event.target.value)} placeholder="Ej. Directorio" />
                <button
                  type="button"
                  className="focus-ring grid size-9 place-items-center rounded-md bg-[#3d35ff] text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!themeName.trim()}
                  onClick={() => {
                    const saved = saveTheme(themeName);
                    if (saved) setThemeName("");
                  }}
                  aria-label="Guardar tema visual"
                >
                  <Save className="size-4" />
                </button>
              </div>
            </label>
            {savedThemes.length > 0 && (
              <div className="mt-3 space-y-2">
                {savedThemes.slice(0, 4).map((theme) => (
                  <div key={theme.id} className="flex items-center gap-2 rounded-md border border-[#e3e8f5] bg-white p-2">
                    <button type="button" onClick={() => applyTheme(theme.id)} className="min-w-0 flex-1 truncate text-left text-xs font-bold text-[#34405f]">{theme.name}</button>
                    <span className="text-[10px] font-bold uppercase text-[#697597]">{theme.scope}</span>
                    <button type="button" onClick={() => deleteTheme(theme.id)} className="grid size-7 place-items-center rounded-md text-red-600 hover:bg-red-50" aria-label={`Eliminar tema ${theme.name}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
      </>}

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
                <StatusBadge tone={hidden ? "neutral" : "success"}>{hidden ? "Oculto" : "Visible"}</StatusBadge>
                {(activeTab === "visual" || activeTab === "interaction") && <div className="flex shrink-0 gap-1">
                  <button type="button" className="focus-ring grid size-8 place-items-center rounded-md text-[#536088] hover:bg-[#f1f4ff]" onClick={() => duplicateWidget(widget.id)} aria-label={`Duplicar ${widget.title}`}>
                    <Copy className="size-4" />
                  </button>
                  <button type="button" className="focus-ring grid size-8 place-items-center rounded-md text-[#536088] hover:bg-[#f1f4ff]" onClick={() => setHidden(widget.id, !hidden)} aria-label={hidden ? `Mostrar ${widget.title}` : `Ocultar ${widget.title}`}>
                    {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </button>
                  <button type="button" className="focus-ring grid size-8 place-items-center rounded-md text-red-600 hover:bg-red-50" onClick={() => removeWidget(widget.id)} aria-label={`Eliminar ${widget.title}`}>
                    <Trash2 className="size-4" />
                  </button>
                </div>}
              </div>

              <div className="mt-4 space-y-3">
                {activeTab === "format" && <label className="block text-xs font-bold text-[#34405f]">
                  Titulo del widget
                  <input
                    className="focus-ring mt-1 h-9 w-full rounded-md border border-[#dfe5f0] px-3 text-sm font-medium"
                    value={widget.title}
                    onChange={(event) => updateWidget(widget.id, { title: event.target.value })}
                  />
                </label>}

                {activeTab === "visual" && <label className="block text-xs font-bold text-[#34405f]">
                  Tipo compatible
                  <select
                    className="focus-ring mt-1 h-9 w-full rounded-md border border-[#dfe5f0] bg-white px-3 text-sm"
                    value={widget.type}
                    disabled={typeOptions.length === 1}
                    onChange={(event) => updateWidget(widget.id, { type: event.target.value as WidgetType })}
                  >
                    {typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>}

                {activeTab === "data" && supportsQueryControls(widget) && (
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

                {activeTab === "data" && supportsDimension(widget) && (
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

                {(activeTab === "data" || activeTab === "interaction") && supportsLimit(widget) && (
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
                {activeTab === "interaction" && (
                  <div className="rounded-lg border border-[#edf1fa] bg-[#fbfcff] p-3 text-xs font-semibold leading-5 text-[#536088]">
                    Las interacciones usan filtros, seleccion de widget, Data Explorer y Copiloto. Las filas fuente no se modifican desde este editor.
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
