"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Check, Copy, Eye, Filter, GripVertical, Highlighter, MoreVertical, Pencil, Presentation, RotateCcw, RotateCw, Search, Send, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/shared/button";
import { MetricIcon } from "@/components/shared/metric-icon";
import { useToast } from "@/components/shared/toast";
import { compatibleWidgetTypes, normalizeDashboardDesign } from "@/lib/dashboard-spec/edit-dashboard-spec";
import { applyDashboardFilters, executeDashboardQuery } from "@/lib/query-engine/execute-dashboard-query";
import { buildDatasetCatalog, inferSemanticLayer } from "@/lib/semantic-layer";
import { useDashPilotStore } from "@/lib/store/app-store";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { DataRow } from "@/types/dataset";
import type { DashboardDesignSettings, DashboardWidget } from "@/types/dashboard";

function formatValue(value: number, format: unknown) {
  if (format === "currency") return formatCurrency(value);
  if (format === "percentage") return `${(value * 100).toFixed(1)}%`;
  if (format === "percentageWhole") return `${value.toFixed(1)}%`;
  return formatNumber(value);
}

const DashboardDesignContext = createContext<Required<DashboardDesignSettings>>(normalizeDashboardDesign());

const accentMap: Record<Required<DashboardDesignSettings>["accentColor"], { primary: string; hover: string; soft: string; text: string }> = {
  indigo: { primary: "#3d35ff", hover: "#3028df", soft: "#f0f1ff", text: "#3d35ff" },
  emerald: { primary: "#059669", hover: "#047857", soft: "#ecfdf5", text: "#047857" },
  sky: { primary: "#0284c7", hover: "#0369a1", soft: "#eef8ff", text: "#0369a1" },
  slate: { primary: "#334155", hover: "#1f2937", soft: "#f1f5f9", text: "#334155" }
};

const paletteMap: Record<Required<DashboardDesignSettings>["chartPalette"], string[]> = {
  default: ["#3d35ff", "#16a34a", "#0ea5e9", "#f97316", "#8b5cf6", "#64748b"],
  business: ["#334155", "#3d35ff", "#0f766e", "#0284c7", "#7c3aed", "#475569"],
  contrast: ["#111827", "#2563eb", "#dc2626", "#f59e0b", "#059669", "#7c3aed"]
};

function useDashboardDesign() {
  return useContext(DashboardDesignContext);
}

function chartColors(design: Required<DashboardDesignSettings>) {
  const palette = paletteMap[design.chartPalette];
  const accent = accentMap[design.accentColor];
  return {
    primary: accent.primary,
    hover: accent.hover,
    soft: accent.soft,
    text: accent.text,
    muted: "#9aa7c7",
    grid: "#edf1fa",
    palette
  };
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  const design = useDashboardDesign();
  return (
    <section
      className={cn(
        design.cardStyle === "bordered" ? "rounded-xl border border-[#dfe5f0] bg-white shadow-none" : "soft-card rounded-xl",
        design.density === "compact" ? "p-4" : "p-5",
        className
      )}
    >
      {children}
    </section>
  );
}

function WidgetHeader({ widget }: { widget: DashboardWidget }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const startDashboardEditing = useDashPilotStore((state) => state.startDashboardEditing);
  const duplicateWidget = useDashPilotStore((state) => state.duplicateDashboardWidget);
  const removeWidget = useDashPilotStore((state) => state.removeDashboardWidget);
  const setHidden = useDashPilotStore((state) => state.setDashboardWidgetHidden);
  const openWidgetData = useDashPilotStore((state) => state.openWidgetDataExplorer);
  const updateWidget = useDashPilotStore((state) => state.updateDashboardWidget);
  const setViewState = useDashPilotStore((state) => state.setViewState);
  const sendPrompt = useDashPilotStore((state) => state.sendPrompt);
  const generatePresentation = useDashPilotStore((state) => state.generatePresentation);
  const typeOptions = compatibleWidgetTypes(widget).filter((type) => type !== widget.type);

  function editWidget() {
    setViewState({ highlightedWidgetId: widget.id });
    startDashboardEditing();
    setOpen(false);
  }

  function changeType(type: DashboardWidget["type"]) {
    updateWidget(widget.id, { type });
    setOpen(false);
    toast(`Cambie "${widget.title}" a ${type}.`);
  }

  function explainWidget() {
    void sendPrompt(`Explica el widget ${widget.title}`).catch(() => undefined);
    setOpen(false);
  }

  return (
    <div className="relative mb-4 flex items-center justify-between">
      <h3 className="font-bold tracking-[-0.02em]">{widget.title}</h3>
      <button aria-label={`Abrir opciones de ${widget.title}`} onClick={() => setOpen((value) => !value)} className="grid size-8 place-items-center rounded-md text-[#697597] hover:bg-[#f3f5ff]">
        <MoreVertical className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-64 rounded-xl border border-[#dfe5f0] bg-white p-2 text-sm shadow-2xl shadow-slate-900/10">
          <button onClick={editWidget} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left font-semibold hover:bg-[#f6f7ff]"><Pencil className="size-4" /> Editar</button>
          <button onClick={() => { duplicateWidget(widget.id); setOpen(false); toast(`Duplique "${widget.title}".`); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left font-semibold hover:bg-[#f6f7ff]"><Copy className="size-4" /> Duplicar</button>
          <button onClick={() => { setHidden(widget.id, true); setOpen(false); toast(`Oculte "${widget.title}".`); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left font-semibold hover:bg-[#f6f7ff]"><Eye className="size-4" /> Ocultar</button>
          <button onClick={() => { openWidgetData(widget.id); setOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left font-semibold hover:bg-[#f6f7ff]"><Search className="size-4" /> Ver datos detras</button>
          <button onClick={explainWidget} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left font-semibold hover:bg-[#f6f7ff]"><Sparkles className="size-4" /> Explicar con IA</button>
          <button onClick={() => { generatePresentation(); setOpen(false); toast("Agregue el dashboard actualizado a la presentacion."); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left font-semibold hover:bg-[#f6f7ff]"><Presentation className="size-4" /> Agregar a presentacion</button>
          <button onClick={() => { setViewState({ highlightedWidgetId: widget.id }); setOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left font-semibold hover:bg-[#f6f7ff]"><Highlighter className="size-4" /> Fijar o destacar</button>
          {typeOptions.map((type) => (
            <button key={type} onClick={() => changeType(type)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left font-semibold hover:bg-[#f6f7ff]"><SlidersHorizontal className="size-4" /> Cambiar a {type}</button>
          ))}
          <button
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              removeWidget(widget.id);
              setOpen(false);
              toast(`Elimine "${widget.title}".`);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left font-semibold text-red-600 hover:bg-red-50"
          >
            <Trash2 className="size-4" /> {confirmDelete ? "Confirmar eliminar" : "Eliminar"}
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyWidget({ message }: { message?: string }) {
  return (
    <div className="grid h-[220px] place-items-center rounded-lg border border-dashed border-[#d8def2] bg-[#fbfcff] px-6 text-center text-sm font-semibold text-[#697597]">
      {message ?? "Este widget no tiene datos con los filtros actuales."}
    </div>
  );
}

function KpiWidget({ widget, rows }: { widget: DashboardWidget; rows: DataRow[] }) {
  const viewState = useDashPilotStore((state) => state.viewState);
  const colors = chartColors(useDashboardDesign());
  const result = widget.query ? executeDashboardQuery(rows, widget.query, viewState)[0]?.value ?? 0 : Number(widget.config.fallbackValue ?? 0);
  const tone = String(widget.config.tone ?? "blue") as "blue" | "violet" | "green" | "sky" | "orange";
  return (
    <Card className="min-h-[150px]">
      <div className="flex items-start justify-between">
        <MetricIcon name={String(widget.config.icon ?? "chart")} tone={tone} />
        <span className="text-xs font-semibold text-emerald-600">{String(widget.config.comparison ?? "")}</span>
      </div>
      <p className="mt-4 text-sm font-semibold text-[#1c2748]">{widget.title}</p>
      <p className="mt-1 text-3xl font-bold tracking-[-0.04em]">{formatValue(result, widget.config.format)}</p>
      <div className="mt-4 h-9">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[12, 18, 15, 22, 17, 26, 28].map((value, index) => ({ index, value }))}>
            <Line type="monotone" dataKey="value" stroke={tone === "green" ? "#16a34a" : colors.primary} strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function LineWidget({ widget, rows }: { widget: DashboardWidget; rows: DataRow[] }) {
  const viewState = useDashPilotStore((state) => state.viewState);
  const colors = chartColors(useDashboardDesign());
  const data = widget.query ? executeDashboardQuery(rows, widget.query, viewState) : [];
  const seriesKeys = Object.keys(data[0] ?? {}).filter((key) => !["label", "value"].includes(key));
  const comparison = data.map((item) => ({ ...item, previous: Math.round(Number(item.value) * 0.72) }));

  return (
    <Card className="min-h-[310px]">
      <WidgetHeader widget={widget} />
      {data.length === 0 ? (
        <EmptyWidget message={String(widget.config.emptyMessage ?? "No hay datos suficientes para esta serie.")} />
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={seriesKeys.length ? data : comparison} margin={{ left: 4, right: 18, top: 10, bottom: 0 }}>
            <CartesianGrid stroke={colors.grid} vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#697597", fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "#697597", fontSize: 12 }} tickFormatter={(value) => formatCurrency(Number(value))} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: 10, borderColor: "#dfe5f0" }} />
            {seriesKeys.length ? (
              seriesKeys.map((key, index) => (
                <Line key={key} type="monotone" dataKey={key} name={key} stroke={colors.palette[index % colors.palette.length]} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              ))
            ) : (
              <>
                <Line type="monotone" dataKey="value" name="Actual" stroke={colors.primary} strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="previous" name="Comparativo" stroke={colors.muted} strokeDasharray="5 5" strokeWidth={2} dot={false} />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function BarWidget({ widget, rows }: { widget: DashboardWidget; rows: DataRow[] }) {
  const viewState = useDashPilotStore((state) => state.viewState);
  const colors = chartColors(useDashboardDesign());
  const data = widget.query ? executeDashboardQuery(rows, widget.query, viewState) : [];
  const compact = Boolean(widget.config.compact);
  return (
    <Card className="min-h-[310px]">
      <WidgetHeader widget={widget} />
      {data.length === 0 ? (
        <EmptyWidget />
      ) : (
        <ResponsiveContainer width="100%" height={compact ? 220 : 230}>
          <BarChart data={data} layout="vertical" margin={{ left: 16, right: 28, top: 4, bottom: 0 }}>
            <CartesianGrid stroke={colors.grid} horizontal={false} />
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#34405f", fontSize: 12 }} width={82} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: 10, borderColor: "#dfe5f0" }} />
            <Bar dataKey="value" radius={[0, 8, 8, 0]} fill={colors.primary} barSize={compact ? 16 : 24} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function DonutWidget({ widget, rows }: { widget: DashboardWidget; rows: DataRow[] }) {
  const viewState = useDashPilotStore((state) => state.viewState);
  const colors = chartColors(useDashboardDesign());
  const data = widget.query ? executeDashboardQuery(rows, widget.query, viewState) : [];
  return (
    <Card className="min-h-[310px]">
      <WidgetHeader widget={widget} />
      {data.length === 0 ? (
        <EmptyWidget />
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={58} outerRadius={92} paddingAngle={2}>
              {data.map((item, index) => <Cell key={String(item.label ?? index)} fill={colors.palette[index % colors.palette.length]} />)}
            </Pie>
            <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: 10, borderColor: "#dfe5f0" }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function ScatterWidget({ widget, rows }: { widget: DashboardWidget; rows: DataRow[] }) {
  const viewState = useDashPilotStore((state) => state.viewState);
  const colors = chartColors(useDashboardDesign());
  const data = widget.query ? executeDashboardQuery(rows, widget.query, viewState).map((row, index) => ({ ...row, index: index + 1 })) : [];
  return (
    <Card className="min-h-[310px]">
      <WidgetHeader widget={widget} />
      {data.length === 0 ? (
        <EmptyWidget />
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <ScatterChart margin={{ left: 4, right: 18, top: 10, bottom: 0 }}>
            <CartesianGrid stroke={colors.grid} />
            <XAxis dataKey="index" tick={{ fill: "#697597", fontSize: 12 }} />
            <YAxis dataKey="value" tick={{ fill: "#697597", fontSize: 12 }} tickFormatter={(value) => formatCurrency(Number(value))} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: 10, borderColor: "#dfe5f0" }} />
            <Scatter data={data} fill={colors.primary} />
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function TableWidget({ widget, rows }: { widget: DashboardWidget; rows: DataRow[] }) {
  const viewState = useDashPilotStore((state) => state.viewState);
  const setViewState = useDashPilotStore((state) => state.setViewState);
  const filtered = useMemo(() => applyDashboardFilters(rows, viewState.filters), [rows, viewState.filters]);
  const columns = (widget.config.columns as string[] | undefined)?.filter(Boolean) ?? Object.keys(rows[0] ?? {}).slice(0, 5);
  return (
    <Card className="min-h-[310px] overflow-hidden">
      <div className="mb-4 flex items-center justify-between">
        <WidgetHeader widget={widget} />
        <div className="flex gap-2">
          <button className="rounded-md border border-[#dfe5f0] px-3 py-1.5 text-xs font-semibold text-[#3d35ff]" onClick={() => setViewState({ dataExplorer: { ...viewState.dataExplorer, isOpen: true, visibleColumns: columns } })}>Elegir columnas</button>
          <button className="rounded-md border border-[#dfe5f0] px-3 py-1.5 text-xs font-semibold text-[#3d35ff]" onClick={() => setViewState({ dataExplorer: { ...viewState.dataExplorer, isOpen: true } })}>Ver tabla completa</button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyWidget message="No hay filas para mostrar con los filtros actuales." />
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="text-xs text-[#697597]">
            <tr>{columns.map((column) => <th key={column} className="border-b border-[#edf1fa] py-3 font-semibold">{column}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.slice(0, Number(widget.config.limit ?? 5)).map((row, index) => (
              <tr key={index} className="border-b border-[#edf1fa] last:border-0">
                {columns.map((column) => (
                  <td key={column} className="py-3 text-[#1c2748]">
                    {typeof row[column] === "number" && column.toLowerCase().includes("venta")
                      ? formatCurrency(row[column])
                      : String(row[column] ?? "-")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </Card>
  );
}

function InsightWidget({ widget }: { widget: DashboardWidget }) {
  const bullets = (widget.config.bullets as string[] | undefined) ?? [];
  return (
    <Card className="border-[#cfd5ff] bg-[#fbfbff]">
      <div className="flex gap-5">
        <MetricIcon name="magic" tone="violet" />
        <div>
          <h3 className="font-bold tracking-[-0.02em]">{widget.title}</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {bullets.map((bullet) => (
              <p key={bullet} className="flex gap-3 text-sm leading-6 text-[#34405f]">
                <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full border border-[#7069ff] text-[10px] text-[#3d35ff]">✓</span>
                {bullet}
              </p>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function DashboardRenderer({ slideWidgetIds }: { slideWidgetIds?: string[] }) {
  const rows = useDashPilotStore((state) => state.rows);
  const dashboard = useDashPilotStore((state) => state.dashboard);
  const isDashboardEditing = useDashPilotStore((state) => state.isDashboardEditing);
  const dashboardEditDraft = useDashPilotStore((state) => state.dashboardEditDraft);
  const highlightedWidgetId = useDashPilotStore((state) => state.viewState.highlightedWidgetId);
  const moveDashboardDraftWidget = useDashPilotStore((state) => state.moveDashboardDraftWidget);
  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
  const renderedDashboard = isDashboardEditing && dashboardEditDraft && !slideWidgetIds ? dashboardEditDraft : dashboard;
  const design = normalizeDashboardDesign(renderedDashboard.design);
  const widgets = slideWidgetIds
    ? renderedDashboard.widgets.filter((widget) => slideWidgetIds.includes(widget.id))
    : renderedDashboard.widgets.filter((widget) => widget.config.hidden !== true);

  return (
    <DashboardDesignContext.Provider value={design}>
      <div className={cn("grid grid-cols-12", design.density === "compact" ? "gap-3" : "gap-4")}>
        {widgets.map((widget) => {
          const width = widget.position.w >= 12 ? "col-span-12" : widget.position.w >= 8 ? "col-span-12 lg:col-span-8" : widget.position.w >= 6 ? "col-span-12 lg:col-span-6" : "col-span-12 sm:col-span-6 xl:col-span-3";
          return (
            <div
              key={widget.id}
              draggable={isDashboardEditing && !slideWidgetIds}
              onDragStart={(event) => {
                if (!isDashboardEditing || slideWidgetIds) return;
                setDraggedWidgetId(widget.id);
                event.dataTransfer.setData("text/plain", widget.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                if (!isDashboardEditing || slideWidgetIds) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                if (!isDashboardEditing || slideWidgetIds) return;
                event.preventDefault();
                const source = event.dataTransfer.getData("text/plain") || draggedWidgetId;
                if (source && source !== widget.id) moveDashboardDraftWidget(source, widget.id);
                setDraggedWidgetId(null);
              }}
              onDragEnd={() => setDraggedWidgetId(null)}
              className={cn(
                "relative transition",
                width,
                isDashboardEditing && !slideWidgetIds && "cursor-grab active:cursor-grabbing",
                draggedWidgetId === widget.id && "opacity-50",
                highlightedWidgetId === widget.id && "rounded-xl ring-2 ring-[#3d35ff] ring-offset-2 ring-offset-[#f8faff]"
              )}
            >
              {isDashboardEditing && !slideWidgetIds && (
                <span className="absolute left-3 top-3 z-20 grid size-8 place-items-center rounded-md border border-[#dfe5f0] bg-white/95 text-[#697597] shadow-sm" title="Arrastra para reordenar">
                  <GripVertical className="size-4" />
                </span>
              )}
              {widget.type === "kpi_card" && <KpiWidget widget={widget} rows={rows} />}
              {widget.type === "line_chart" && <LineWidget widget={widget} rows={rows} />}
              {widget.type === "bar_chart" && <BarWidget widget={widget} rows={rows} />}
              {widget.type === "donut_chart" && <DonutWidget widget={widget} rows={rows} />}
              {widget.type === "scatter_plot" && <ScatterWidget widget={widget} rows={rows} />}
              {widget.type === "table" && <TableWidget widget={widget} rows={rows} />}
              {widget.type === "insight_text" && <InsightWidget widget={widget} />}
            </div>
          );
        })}
      </div>
    </DashboardDesignContext.Provider>
  );
}

export function DashboardFilters() {
  const rows = useDashPilotStore((state) => state.rows);
  const profile = useDashPilotStore((state) => state.profile);
  const dashboard = useDashPilotStore((state) => state.dashboard);
  const viewState = useDashPilotStore((state) => state.viewState);
  const setViewState = useDashPilotStore((state) => state.setViewState);
  const resetFilters = useDashPilotStore((state) => state.resetFilters);
  const [isAddingFilter, setIsAddingFilter] = useState(false);
  const catalog = useMemo(() => buildDatasetCatalog(profile), [profile]);
  const [filterField, setFilterField] = useState(catalog.filters[0]?.normalizedName ?? "");
  const selectedFilterColumn = catalog.columns.find((column) => column.normalizedName === filterField) ?? catalog.filters[0];

  const optionsFor = (field: string) => Array.from(new Set(rows.map((row) => row[field]).filter(Boolean))).slice(0, 12);
  const setFilter = (field: string, value: unknown, operator: "in" | "between" = "in") => {
    setViewState({
      filters: [
        ...viewState.filters.filter((item) => item.field !== field),
        { field, operator, value }
      ]
    });
  };

  return (
    <aside className="soft-card rounded-xl p-4">
      <div className="flex items-center justify-between border-b border-[#edf1fa] pb-4">
        <div className="flex items-center gap-2 font-bold"><Filter className="size-4" /> Filtros</div>
        <button disabled title="Los filtros globales disponibles se listan debajo." className="cursor-not-allowed text-[#697597] opacity-60">⌃</button>
      </div>
      <button onClick={resetFilters} className="mt-5 text-sm font-semibold text-[#3d35ff]">Restablecer</button>
      <div className="mt-6 space-y-6">
        {dashboard.globalFilters.map((filter) => (
          <div key={filter.id}>
            <label className="mb-2 block text-sm font-semibold text-[#34405f]">{filter.label}</label>
            {filter.type === "date_range" ? (
              <div className="space-y-2">
                <input
                  className="h-10 w-full rounded-md border border-[#dfe5f0] px-3 text-sm"
                  type="date"
                  value={viewState.selectedDateRange?.from ?? ""}
                  onChange={(event) => {
                    const range = { from: event.target.value, to: viewState.selectedDateRange?.to ?? event.target.value };
                    setViewState({
                      selectedDateRange: range,
                      filters: [
                        ...viewState.filters.filter((item) => item.field !== filter.field),
                        { field: filter.field, operator: "between" as const, value: [range.from, range.to] }
                      ]
                    });
                  }}
                />
                <input
                  className="h-10 w-full rounded-md border border-[#dfe5f0] px-3 text-sm"
                  type="date"
                  value={viewState.selectedDateRange?.to ?? ""}
                  onChange={(event) => {
                    const range = { from: viewState.selectedDateRange?.from ?? event.target.value, to: event.target.value };
                    setViewState({
                      selectedDateRange: range,
                      filters: [
                        ...viewState.filters.filter((item) => item.field !== filter.field),
                        { field: filter.field, operator: "between" as const, value: [range.from, range.to] }
                      ]
                    });
                  }}
                />
              </div>
            ) : (
              <select
                className="h-10 w-full rounded-md border border-[#dfe5f0] bg-white px-3 text-sm"
                value={String(viewState.filters.find((item) => item.field === filter.field)?.value instanceof Array ? (viewState.filters.find((item) => item.field === filter.field)?.value as string[])[0] : "Todos")}
                onChange={(event) => {
                  const next = event.target.value;
                  setViewState({
                    filters: [
                      ...viewState.filters.filter((item) => item.field !== filter.field),
                      ...(next === "Todos" ? [] : [{ field: filter.field, operator: "in" as const, value: [next] }])
                    ]
                  });
                }}
              >
                <option>Todos</option>
                {optionsFor(filter.field).map((option) => <option key={String(option)}>{String(option)}</option>)}
              </select>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {viewState.selectedDateRange && (
          <span className="rounded-full bg-[#f0f1ff] px-3 py-1 text-xs font-semibold text-[#3d35ff]">
            {viewState.selectedDateRange.from} - {viewState.selectedDateRange.to}
          </span>
        )}
        {viewState.filters.map((filter) => (
          <span key={`${filter.field}-${String(filter.value)}`} className="rounded-full bg-[#f0f1ff] px-3 py-1 text-xs font-semibold text-[#3d35ff]">
            {filter.field}: {Array.isArray(filter.value) ? filter.value.join(", ") : String(filter.value)}
          </span>
        ))}
      </div>
      {isAddingFilter && selectedFilterColumn && (
        <div className="mt-4 rounded-lg border border-[#dfe5f0] bg-[#fbfcff] p-3">
          <label className="block text-xs font-bold text-[#34405f]">
            Columna
            <select className="mt-1 h-10 w-full rounded-md border border-[#dfe5f0] bg-white px-3 text-sm" value={selectedFilterColumn.normalizedName} onChange={(event) => setFilterField(event.target.value)}>
              {catalog.filters.map((column) => <option key={column.normalizedName} value={column.normalizedName}>{column.displayName}</option>)}
            </select>
          </label>
          {selectedFilterColumn.usableAsDate ? (
            <div className="mt-3 grid gap-2">
              <input className="h-10 rounded-md border border-[#dfe5f0] px-3 text-sm" type="date" onChange={(event) => {
                const current = viewState.filters.find((filter) => filter.field === selectedFilterColumn.normalizedName)?.value;
                const to = Array.isArray(current) ? String(current[1] ?? event.target.value) : event.target.value;
                setFilter(selectedFilterColumn.normalizedName, [event.target.value, to], "between");
              }} />
              <input className="h-10 rounded-md border border-[#dfe5f0] px-3 text-sm" type="date" onChange={(event) => {
                const current = viewState.filters.find((filter) => filter.field === selectedFilterColumn.normalizedName)?.value;
                const from = Array.isArray(current) ? String(current[0] ?? event.target.value) : event.target.value;
                setFilter(selectedFilterColumn.normalizedName, [from, event.target.value], "between");
              }} />
            </div>
          ) : selectedFilterColumn.usableAsMetric ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input className="h-10 rounded-md border border-[#dfe5f0] px-3 text-sm" placeholder="Min" type="number" onChange={(event) => {
                const current = viewState.filters.find((filter) => filter.field === selectedFilterColumn.normalizedName)?.value;
                const max = Array.isArray(current) ? current[1] : selectedFilterColumn.max ?? event.target.value;
                setFilter(selectedFilterColumn.normalizedName, [event.target.value, max], "between");
              }} />
              <input className="h-10 rounded-md border border-[#dfe5f0] px-3 text-sm" placeholder="Max" type="number" onChange={(event) => {
                const current = viewState.filters.find((filter) => filter.field === selectedFilterColumn.normalizedName)?.value;
                const min = Array.isArray(current) ? current[0] : selectedFilterColumn.min ?? event.target.value;
                setFilter(selectedFilterColumn.normalizedName, [min, event.target.value], "between");
              }} />
            </div>
          ) : (
            <select className="mt-3 h-10 w-full rounded-md border border-[#dfe5f0] bg-white px-3 text-sm" defaultValue="" onChange={(event) => event.target.value && setFilter(selectedFilterColumn.normalizedName, [event.target.value])}>
              <option value="">Selecciona valor</option>
              {optionsFor(selectedFilterColumn.normalizedName).map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}
            </select>
          )}
        </div>
      )}
      <Button onClick={() => setIsAddingFilter((value) => !value)} title="Agrega filtros desde columnas reales del dataset." variant="secondary" className="mt-4 w-full">+ Agregar filtro</Button>
    </aside>
  );
}

export function CopilotPanel() {
  const messages = useDashPilotStore((state) => state.messages);
  const rows = useDashPilotStore((state) => state.rows);
  const profile = useDashPilotStore((state) => state.profile);
  const sendPrompt = useDashPilotStore((state) => state.sendPrompt);
  const isCopilotThinking = useDashPilotStore((state) => state.isCopilotThinking);
  const undoCount = useDashPilotStore((state) => state.copilotUndoStack.length);
  const redoCount = useDashPilotStore((state) => state.copilotRedoStack.length);
  const pendingConfirmation = useDashPilotStore((state) => state.pendingCopilotConfirmation);
  const undoCopilotChange = useDashPilotStore((state) => state.undoCopilotChange);
  const redoCopilotChange = useDashPilotStore((state) => state.redoCopilotChange);
  const confirmPendingCopilotAction = useDashPilotStore((state) => state.confirmPendingCopilotAction);
  const cancelPendingCopilotAction = useDashPilotStore((state) => state.cancelPendingCopilotAction);
  const toggleCopilotPanel = useDashPilotStore((state) => state.toggleCopilotPanel);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState("");
  const quickPrompts = useMemo(() => {
    const semantic = inferSemanticLayer(profile, rows);
    const prompts = ["Hazlo mas ejecutivo"];
    const geo = semantic.primaryGeography;
    const seller = semantic.primarySeller;
    const margin = semantic.marginMetrics[0];
    const date = semantic.primaryDate;
    const productOrCategory = semantic.primaryProduct ?? semantic.primaryCategory;
    if (geo) prompts.push(`Analizar por ${geo.displayName}`);
    if (seller) prompts.push("Agregar ranking por vendedor");
    if (margin) prompts.push("Analizar margen");
    if (date) prompts.push("Comparar con periodo anterior");
    if (productOrCategory) prompts.push(`Top ${productOrCategory.displayName}`);
    return prompts.slice(0, 5);
  }, [profile, rows]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isCopilotThinking]);

  function submitPrompt(value: string) {
    const trimmed = value.trim();
    if (!trimmed || isCopilotThinking) return;
    void sendPrompt(trimmed).catch(() => undefined);
    setPrompt("");
  }

  return (
    <aside className="fixed bottom-0 right-0 top-20 z-40 flex w-full min-w-0 flex-col border-l border-[#e3e8f5] bg-white shadow-2xl shadow-slate-900/10 sm:w-[420px] xl:z-20 xl:w-[360px] xl:shadow-none">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#edf1fa] px-5">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Sparkles className="size-6 text-[#3d35ff]" /> Copiloto IA</h2>
        <div className="flex items-center gap-1">
          <button aria-label="Deshacer cambio del Copiloto" disabled={!undoCount || isCopilotThinking} onClick={undoCopilotChange} className="grid size-9 place-items-center rounded-md text-[#697597] transition hover:bg-[#f3f5ff] disabled:cursor-not-allowed disabled:opacity-40">
            <RotateCcw className="size-4" />
          </button>
          <button aria-label="Rehacer cambio del Copiloto" disabled={!redoCount || isCopilotThinking} onClick={redoCopilotChange} className="grid size-9 place-items-center rounded-md text-[#697597] transition hover:bg-[#f3f5ff] disabled:cursor-not-allowed disabled:opacity-40">
            <RotateCw className="size-4" />
          </button>
          <button
            aria-label="Cerrar Copiloto IA"
            onClick={toggleCopilotPanel}
            className="grid size-9 place-items-center rounded-md text-[#697597] transition hover:bg-[#f3f5ff]"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>
      {pendingConfirmation && (
        <div className="shrink-0 border-b border-[#edf1fa] bg-[#fffaf0] px-5 py-3">
          <p className="text-xs font-bold text-[#8a5a00]">Confirmacion requerida</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-[#1c2748]">{pendingConfirmation.envelope.reason}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={confirmPendingCopilotAction} disabled={isCopilotThinking} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-[#3d35ff] px-3 text-xs font-bold text-white disabled:opacity-50">
              <Check className="size-4" /> Confirmar
            </button>
            <button onClick={cancelPendingCopilotAction} disabled={isCopilotThinking} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-[#dfe5f0] bg-white px-3 text-xs font-bold text-[#536088] disabled:opacity-50">
              <X className="size-4" /> Cancelar
            </button>
          </div>
        </div>
      )}
      <div className="scrollbar-soft min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((message) => (
          <div key={message.id} className={cn("rounded-xl border p-4 text-sm leading-6", message.role === "user" ? "ml-8 border-[#d9dcff] bg-[#f0efff]" : "mr-4 border-[#e5e9f5] bg-white")}>
            <p className="mb-1 text-xs font-bold text-[#697597]">{message.role === "user" ? "Tu" : "Copiloto IA"}</p>
            {message.content}
          </div>
        ))}
        {isCopilotThinking && (
          <div className="mr-4 rounded-xl border border-[#e5e9f5] bg-white p-4 text-sm font-semibold leading-6 text-[#697597]">
            <p className="mb-1 text-xs font-bold text-[#697597]">Copiloto IA</p>
            Pensando...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="shrink-0 border-t border-[#edf1fa] px-5 pb-5 pt-4">
        <div className="space-y-2">
          {quickPrompts.map((quick) => (
            <button
              key={quick}
              disabled={isCopilotThinking}
              onClick={() => submitPrompt(quick)}
              className="w-full rounded-full border border-[#dfe5fb] px-4 py-2 text-left text-xs font-semibold text-[#3d35ff] transition hover:bg-[#f6f7ff] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles className="mr-2 inline size-3" /> {quick}
            </button>
          ))}
        </div>
        <form
          className="mt-4 flex items-center gap-2 rounded-xl border border-[#dfe5f0] bg-white p-2 focus-within:border-[#3d35ff] focus-within:ring-2 focus-within:ring-[#d8dcff]"
          onSubmit={(event) => {
            event.preventDefault();
            submitPrompt(prompt);
          }}
        >
          <input
            className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
            placeholder="Escribe tu mensaje..."
            value={prompt}
            disabled={isCopilotThinking}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <button
            aria-label="Enviar mensaje"
            disabled={!prompt.trim() || isCopilotThinking}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-[#3d35ff] text-white transition hover:bg-[#3028df] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="size-4" />
          </button>
        </form>
        <p className="mt-3 text-center text-xs text-[#697597]">DashPilot puede cometer errores. Verifica la informacion importante.</p>
      </div>
    </aside>
  );
}
