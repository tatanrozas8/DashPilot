"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Filter, MoreVertical, Search, Send, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { Button } from "@/components/shared/button";
import { MetricIcon } from "@/components/shared/metric-icon";
import { useToast } from "@/components/shared/toast";
import { applyDashboardFilters, executeDashboardQuery } from "@/lib/query-engine/execute-dashboard-query";
import { inferSemanticLayer } from "@/lib/semantic-layer";
import { useDashPilotStore } from "@/lib/store/app-store";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { DataRow } from "@/types/dataset";
import type { DashboardWidget } from "@/types/dashboard";

function formatValue(value: number, format: unknown) {
  if (format === "currency") return formatCurrency(value);
  if (format === "percentage") return `${(value * 100).toFixed(1)}%`;
  if (format === "percentageWhole") return `${value.toFixed(1)}%`;
  return formatNumber(value);
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("soft-card rounded-xl p-5", className)}>{children}</section>;
}

function WidgetHeader({ title }: { title: string }) {
  const toast = useToast();
  return (
    <div className="mb-4 flex items-center justify-between">
      <h3 className="font-bold tracking-[-0.02em]">{title}</h3>
      <button onClick={() => toast(`Opciones abiertas para ${title}.`)} className="grid size-8 place-items-center rounded-md text-[#697597] hover:bg-[#f3f5ff]">
        <MoreVertical className="size-4" />
      </button>
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
            <Line type="monotone" dataKey="value" stroke={tone === "green" ? "#16a34a" : "#332cff"} strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function LineWidget({ widget, rows }: { widget: DashboardWidget; rows: DataRow[] }) {
  const viewState = useDashPilotStore((state) => state.viewState);
  const data = widget.query ? executeDashboardQuery(rows, widget.query, viewState) : [];
  const comparison = data.map((item) => ({ ...item, previous: Math.round(Number(item.value) * 0.72) }));

  return (
    <Card className="min-h-[310px]">
      <WidgetHeader title={widget.title} />
      {data.length === 0 ? (
        <EmptyWidget message={String(widget.config.emptyMessage ?? "No hay datos suficientes para esta serie.")} />
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={comparison} margin={{ left: 4, right: 18, top: 10, bottom: 0 }}>
            <CartesianGrid stroke="#edf1fa" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#697597", fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "#697597", fontSize: 12 }} tickFormatter={(value) => formatCurrency(Number(value))} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: 10, borderColor: "#dfe5f0" }} />
            <Line type="monotone" dataKey="value" name="Actual" stroke="#3d35ff" strokeWidth={3} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="previous" name="Comparativo" stroke="#9aa7c7" strokeDasharray="5 5" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function BarWidget({ widget, rows }: { widget: DashboardWidget; rows: DataRow[] }) {
  const viewState = useDashPilotStore((state) => state.viewState);
  const data = widget.query ? executeDashboardQuery(rows, widget.query, viewState) : [];
  const compact = Boolean(widget.config.compact);
  return (
    <Card className="min-h-[310px]">
      <WidgetHeader title={widget.title} />
      {data.length === 0 ? (
        <EmptyWidget />
      ) : (
        <ResponsiveContainer width="100%" height={compact ? 220 : 230}>
          <BarChart data={data} layout="vertical" margin={{ left: 16, right: 28, top: 4, bottom: 0 }}>
            <CartesianGrid stroke="#edf1fa" horizontal={false} />
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#34405f", fontSize: 12 }} width={82} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: 10, borderColor: "#dfe5f0" }} />
            <Bar dataKey="value" radius={[0, 8, 8, 0]} fill="#5a52ff" barSize={compact ? 16 : 24} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function TableWidget({ widget, rows }: { widget: DashboardWidget; rows: DataRow[] }) {
  const viewState = useDashPilotStore((state) => state.viewState);
  const filtered = useMemo(() => applyDashboardFilters(rows, viewState.filters), [rows, viewState.filters]);
  const columns = (widget.config.columns as string[] | undefined)?.filter(Boolean) ?? Object.keys(rows[0] ?? {}).slice(0, 5);
  return (
    <Card className="min-h-[310px] overflow-hidden">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-bold tracking-[-0.02em]">{widget.title}</h3>
        <div className="flex items-center gap-2 text-[#697597]">
          <Search className="size-4" />
          <SlidersHorizontal className="size-4" />
          <MoreVertical className="size-4" />
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
  const renderedDashboard = isDashboardEditing && dashboardEditDraft && !slideWidgetIds ? dashboardEditDraft : dashboard;
  const widgets = slideWidgetIds
    ? renderedDashboard.widgets.filter((widget) => slideWidgetIds.includes(widget.id))
    : renderedDashboard.widgets.filter((widget) => widget.config.hidden !== true);

  return (
    <div className="grid grid-cols-12 gap-4">
      {widgets.map((widget) => {
        const width = widget.position.w >= 12 ? "col-span-12" : widget.position.w >= 8 ? "col-span-12 lg:col-span-8" : widget.position.w >= 6 ? "col-span-12 lg:col-span-6" : "col-span-12 sm:col-span-6 xl:col-span-3";
        return (
          <div key={widget.id} className={cn(width, highlightedWidgetId === widget.id && "rounded-xl ring-2 ring-[#3d35ff] ring-offset-2 ring-offset-[#f8faff]")}>
            {widget.type === "kpi_card" && <KpiWidget widget={widget} rows={rows} />}
            {widget.type === "line_chart" && <LineWidget widget={widget} rows={rows} />}
            {widget.type === "bar_chart" && <BarWidget widget={widget} rows={rows} />}
            {widget.type === "table" && <TableWidget widget={widget} rows={rows} />}
            {widget.type === "insight_text" && <InsightWidget widget={widget} />}
          </div>
        );
      })}
    </div>
  );
}

export function DashboardFilters() {
  const rows = useDashPilotStore((state) => state.rows);
  const dashboard = useDashPilotStore((state) => state.dashboard);
  const viewState = useDashPilotStore((state) => state.viewState);
  const setViewState = useDashPilotStore((state) => state.setViewState);
  const resetFilters = useDashPilotStore((state) => state.resetFilters);
  const toast = useToast();

  const optionsFor = (field: string) => Array.from(new Set(rows.map((row) => row[field]).filter(Boolean))).slice(0, 12);

  return (
    <aside className="soft-card rounded-xl p-4">
      <div className="flex items-center justify-between border-b border-[#edf1fa] pb-4">
        <div className="flex items-center gap-2 font-bold"><Filter className="size-4" /> Filtros</div>
        <button onClick={() => toast("Panel de filtros activo.")} className="text-[#697597]">⌃</button>
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
      <Button onClick={() => toast("Opciones de filtro: canal, estado y producto.")} variant="secondary" className="mt-4 w-full">+ Agregar filtro</Button>
    </aside>
  );
}

export function CopilotPanel() {
  const messages = useDashPilotStore((state) => state.messages);
  const rows = useDashPilotStore((state) => state.rows);
  const profile = useDashPilotStore((state) => state.profile);
  const sendPrompt = useDashPilotStore((state) => state.sendPrompt);
  const isCopilotThinking = useDashPilotStore((state) => state.isCopilotThinking);
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
    void sendPrompt(trimmed);
    setPrompt("");
  }

  return (
    <aside className="fixed bottom-0 right-0 top-20 z-40 flex w-full min-w-0 flex-col border-l border-[#e3e8f5] bg-white shadow-2xl shadow-slate-900/10 sm:w-[420px] xl:z-20 xl:w-[360px] xl:shadow-none">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#edf1fa] px-5">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Sparkles className="size-6 text-[#3d35ff]" /> Copiloto IA</h2>
        <button
          aria-label="Cerrar Copiloto IA"
          onClick={toggleCopilotPanel}
          className="grid size-9 place-items-center rounded-md text-[#697597] transition hover:bg-[#f3f5ff]"
        >
          <X className="size-5" />
        </button>
      </div>
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
