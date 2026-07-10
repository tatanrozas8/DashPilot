"use client";

import { useMemo, useState } from "react";
import { BarChart3, Download, Eye, Filter, Plus, Search, Table2 } from "lucide-react";
import { Button } from "@/components/shared/button";
import { executeDashboardQuery } from "@/lib/query-engine/execute-dashboard-query";
import { queryTableRows } from "@/lib/query-engine/search";
import { inferSemanticLayer } from "@/lib/semantic-layer";
import { useDashPilotStore } from "@/lib/store/app-store";
import { cn, formatNumber } from "@/lib/utils";
import type { DatasetColumnProfile } from "@/types/dataset";
import type { DashboardWidget, WidgetType } from "@/types/dashboard";

const PAGE_SIZE = 50;

function nextWidgetId(widgets: DashboardWidget[]) {
  const ids = new Set(widgets.map((widget) => widget.id));
  let index = widgets.length + 1;
  let id = `manual_widget_${index}`;
  while (ids.has(id)) {
    index += 1;
    id = `manual_widget_${index}`;
  }
  return id;
}

function nextPosition(widgets: DashboardWidget[]) {
  return { x: 0, y: Math.max(0, ...widgets.map((widget) => widget.position.y + widget.position.h)), w: 6, h: 3 };
}

function groupColumns(columns: DatasetColumnProfile[]) {
  return {
    Metricas: columns.filter((column) => column.semanticType === "metric"),
    Dimensiones: columns.filter((column) => column.semanticType === "dimension" || column.semanticType === "category"),
    Fechas: columns.filter((column) => column.semanticType === "time" || column.inferredType === "date"),
    Geografia: columns.filter((column) => column.semanticType === "geo" || column.inferredType === "geography"),
    Identificadores: columns.filter((column) => column.semanticType === "identifier"),
    Texto: columns.filter((column) => column.inferredType === "string" && !["dimension", "category", "identifier"].includes(column.semanticType)),
    Otros: columns.filter((column) => column.semanticType === "unknown" && column.inferredType !== "string")
  };
}

function FieldRow({ column, selected, onToggle, onFilter }: { column: DatasetColumnProfile; selected: boolean; onToggle: () => void; onFilter: () => void }) {
  return (
    <div className="rounded-lg border border-[#edf1fa] p-3">
      <div className="flex items-start justify-between gap-2">
        <button onClick={onToggle} className="min-w-0 text-left">
          <p className="truncate text-sm font-bold text-[#071334]">{column.displayName}</p>
          <p className="truncate text-xs text-[#697597]">{column.originalName}</p>
        </button>
        <button onClick={onFilter} className="grid size-8 shrink-0 place-items-center rounded-md text-[#3d35ff] hover:bg-[#f4f5ff]" aria-label={`Filtrar por ${column.displayName}`}>
          <Filter className="size-4" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-[11px] font-semibold text-[#697597]">
        <span className="rounded-full bg-[#f6f7ff] px-2 py-1">{column.inferredType}</span>
        <span className="rounded-full bg-[#f6f7ff] px-2 py-1">{column.semanticType}</span>
        <span className="rounded-full bg-[#f6f7ff] px-2 py-1">{column.uniqueCount} unicos</span>
        <span className={cn("rounded-full px-2 py-1", column.nullCount ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>{column.nullCount} nulos</span>
        {selected && <span className="rounded-full bg-[#f0f1ff] px-2 py-1 text-[#3d35ff]">visible</span>}
      </div>
    </div>
  );
}

function ChartBuilder() {
  const rows = useDashPilotStore((state) => state.rows);
  const profile = useDashPilotStore((state) => state.profile);
  const dashboard = useDashPilotStore((state) => state.dashboard);
  const addDashboardWidget = useDashPilotStore((state) => state.addDashboardWidget);
  const semantic = useMemo(() => inferSemanticLayer(profile, rows), [profile, rows]);
  const [chartType, setChartType] = useState<WidgetType>("bar_chart");
  const [metric, setMetric] = useState(semantic.primaryMetric?.field ?? profile.detectedMetricColumns[0] ?? "");
  const [dimension, setDimension] = useState(semantic.primaryDimension?.field ?? profile.detectedDimensionColumns[0] ?? "");
  const [aggregation, setAggregation] = useState<"sum" | "avg" | "count" | "count_distinct" | "min" | "max">("sum");
  const [limit, setLimit] = useState(10);

  const metrics = profile.columns.filter((column) => ["metric", "measure"].includes(column.semanticType) || ["number", "currency", "percentage"].includes(column.inferredType));
  const dimensions = profile.columns.filter((column) => !metrics.some((metricColumn) => metricColumn.normalizedName === column.normalizedName));
  const preview = useMemo(() => executeDashboardQuery(rows, { metric: metric ? { field: metric, aggregation } : undefined, groupBy: dimension ? [dimension] : undefined, orderBy: { field: "value", direction: "desc" }, limit }, { filters: [] }), [aggregation, dimension, limit, metric, rows]);

  function addWidget() {
    const widget: DashboardWidget = {
      id: nextWidgetId(dashboard.widgets),
      type: chartType === "kpi_card" ? "kpi_card" : chartType,
      title: `${profile.columns.find((column) => column.normalizedName === metric)?.displayName ?? "Registros"}${dimension ? ` por ${profile.columns.find((column) => column.normalizedName === dimension)?.displayName ?? dimension}` : ""}`,
      query: chartType === "kpi_card" ? { metric: metric ? { field: metric, aggregation } : undefined } : { metric: metric ? { field: metric, aggregation } : undefined, groupBy: dimension ? [dimension] : undefined, orderBy: { field: "value", direction: "desc" }, limit },
      config: { format: "number", compact: true, generatedBy: "manual_builder" },
      position: nextPosition(dashboard.widgets)
    };
    addDashboardWidget(widget);
  }

  return (
    <section className="soft-card rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-bold"><BarChart3 className="size-4 text-[#3d35ff]" /> Agregar grafico</h3>
        <Button onClick={addWidget} className="h-9 px-3"><Plus className="size-4" /> Agregar</Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <select className="h-10 rounded-lg border border-[#dfe5f0] bg-white px-3 text-sm" value={chartType} onChange={(event) => setChartType(event.target.value as WidgetType)}>
          {[
            ["kpi_card", "KPI"],
            ["bar_chart", "Barra"],
            ["line_chart", "Linea"],
            ["donut_chart", "Dona"],
            ["table", "Tabla"],
            ["scatter_plot", "Scatter"]
          ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select className="h-10 rounded-lg border border-[#dfe5f0] bg-white px-3 text-sm" value={metric} onChange={(event) => setMetric(event.target.value)}>
          <option value="">Conteo de filas</option>
          {metrics.map((column) => <option key={column.normalizedName} value={column.normalizedName}>{column.displayName}</option>)}
        </select>
        <select className="h-10 rounded-lg border border-[#dfe5f0] bg-white px-3 text-sm" value={aggregation} onChange={(event) => setAggregation(event.target.value as typeof aggregation)}>
          {["sum", "avg", "count", "count_distinct", "min", "max"].map((item) => <option key={item}>{item}</option>)}
        </select>
        <select className="h-10 rounded-lg border border-[#dfe5f0] bg-white px-3 text-sm" value={dimension} onChange={(event) => setDimension(event.target.value)}>
          <option value="">Sin dimension</option>
          {dimensions.map((column) => <option key={column.normalizedName} value={column.normalizedName}>{column.displayName}</option>)}
        </select>
        <input className="h-10 rounded-lg border border-[#dfe5f0] px-3 text-sm" type="number" min={1} max={100} value={limit} onChange={(event) => setLimit(Number(event.target.value) || 10)} />
      </div>
      <p className="mt-3 text-xs text-[#697597]">Vista previa: {preview.slice(0, 3).map((row) => `${row.label}: ${formatNumber(Number(row.value ?? 0))}`).join(" · ") || "sin datos"}</p>
    </section>
  );
}

export function DataExplorerPanel() {
  const rows = useDashPilotStore((state) => state.rows);
  const profile = useDashPilotStore((state) => state.profile);
  const viewState = useDashPilotStore((state) => state.viewState);
  const setViewState = useDashPilotStore((state) => state.setViewState);
  const [page, setPage] = useState(0);
  const allColumns = profile.columns.map((column) => column.normalizedName);
  const visibleColumns = viewState.dataExplorer?.visibleColumns?.length ? viewState.dataExplorer.visibleColumns : allColumns.slice(0, 8);
  const search = viewState.dataExplorer?.search ?? "";
  const sort = viewState.dataExplorer?.sort;
  const table = useMemo(() => queryTableRows(rows, { search, columns: visibleColumns, filters: viewState.filters, sort }), [rows, search, sort, viewState.filters, visibleColumns]);
  const pageRows = table.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const columnGroups = useMemo(() => groupColumns(profile.columns), [profile.columns]);
  const pageCount = Math.max(1, Math.ceil(table.filteredRows / PAGE_SIZE));

  function patchExplorer(patch: NonNullable<typeof viewState.dataExplorer>) {
    setViewState({ dataExplorer: { ...viewState.dataExplorer, ...patch, isOpen: true } });
  }

  function toggleColumn(column: string) {
    const next = visibleColumns.includes(column) ? visibleColumns.filter((item) => item !== column) : [...visibleColumns, column];
    patchExplorer({ visibleColumns: next.length ? next : [column] });
    setPage(0);
  }

  function exportCsv() {
    const header = visibleColumns.join(",");
    const body = table.rows
      .map((row) => visibleColumns.map((column) => `"${String(row[column] ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([[header, body].filter(Boolean).join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${profile.id}-vista-filtrada.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
        <aside className="soft-card max-h-[720px] overflow-y-auto rounded-xl p-4">
          <h3 className="flex items-center gap-2 font-bold"><Eye className="size-4 text-[#3d35ff]" /> Campos</h3>
          <p className="mt-2 text-xs text-[#697597]">{profile.columnCount} columnas detectadas desde {profile.fileName}</p>
          <div className="mt-4 space-y-5">
            {Object.entries(columnGroups).map(([group, columns]) => columns.length ? (
              <div key={group}>
                <p className="mb-2 text-xs font-bold uppercase text-[#697597]">{group}</p>
                <div className="space-y-2">
                  {columns.map((column) => (
                    <FieldRow
                      key={column.normalizedName}
                      column={column}
                      selected={visibleColumns.includes(column.normalizedName)}
                      onToggle={() => toggleColumn(column.normalizedName)}
                      onFilter={() => patchExplorer({ visibleColumns: [column.normalizedName] })}
                    />
                  ))}
                </div>
              </div>
            ) : null)}
          </div>
        </aside>

        <div className="space-y-5">
          <section className="soft-card rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 font-bold"><Table2 className="size-4 text-[#3d35ff]" /> Explorar datos</h3>
                <p className="mt-1 text-sm text-[#697597]">{formatNumber(table.filteredRows)} filas visibles de {formatNumber(table.totalRows)} totales</p>
              </div>
              <Button onClick={exportCsv} variant="secondary" className="h-10 px-3"><Download className="size-4" /> CSV</Button>
              <div className="flex min-w-[260px] items-center gap-2 rounded-xl border border-[#dfe5f0] px-3">
                <Search className="size-4 text-[#697597]" />
                <input className="h-10 min-w-0 flex-1 text-sm outline-none" placeholder="Buscar en toda la tabla..." value={search} onChange={(event) => { patchExplorer({ search: event.target.value }); setPage(0); }} />
              </div>
            </div>
            <div className="mt-4 overflow-auto rounded-xl border border-[#edf1fa]">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="sticky top-0 bg-[#fbfcff] text-xs text-[#697597]">
                  <tr>
                    {visibleColumns.map((column) => (
                      <th key={column} className="border-b border-[#edf1fa] px-3 py-3">
                        <button className="font-semibold" onClick={() => patchExplorer({ sort: { field: column, direction: sort?.field === column && sort.direction === "desc" ? "asc" : "desc" } })}>
                          {profile.columns.find((item) => item.normalizedName === column)?.displayName ?? column}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, index) => (
                    <tr key={`${page}-${index}`} className="border-b border-[#edf1fa] last:border-0">
                      {visibleColumns.map((column) => <td key={column} className="max-w-[240px] truncate px-3 py-3 text-[#1c2748]">{String(row[column] ?? "-")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <button className="rounded-lg border border-[#dfe5f0] px-3 py-2 font-semibold disabled:opacity-50" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Anterior</button>
              <span className="text-[#697597]">Pagina {page + 1} de {pageCount}</span>
              <button className="rounded-lg border border-[#dfe5f0] px-3 py-2 font-semibold disabled:opacity-50" disabled={page >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Siguiente</button>
            </div>
          </section>
          <ChartBuilder />
        </div>
      </div>
    </section>
  );
}
