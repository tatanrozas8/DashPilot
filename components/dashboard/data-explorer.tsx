"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Download, Eye, Filter, Info, Plus, Search, Table2, X } from "lucide-react";
import { Button } from "@/components/shared/button";
import { executeDashboardQuery } from "@/lib/query-engine/execute-dashboard-query";
import { queryTableRows } from "@/lib/query-engine/search";
import { inferSemanticLayer } from "@/lib/semantic-layer";
import { useDashPilotStore } from "@/lib/store/app-store";
import { cn, formatNumber } from "@/lib/utils";
import type { DataRow, DatasetColumnProfile, DatasetProfile, SemanticColumnType } from "@/types/dataset";
import type { DashboardViewState, DashboardWidget, WidgetType } from "@/types/dashboard";

const PAGE_SIZE = 50;
const semanticOptions: SemanticColumnType[] = ["metric", "measure", "dimension", "category", "time", "geo", "identifier", "unknown"];

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
    Fechas: columns.filter((column) => column.semanticType === "time" || column.inferredType === "date" || column.inferredType === "datetime"),
    Geografia: columns.filter((column) => column.semanticType === "geo" || column.inferredType === "geography"),
    Identificadores: columns.filter((column) => column.semanticType === "identifier"),
    Texto: columns.filter((column) => column.inferredType === "string" && !["dimension", "category", "identifier"].includes(column.semanticType)),
    Otros: columns.filter((column) => column.semanticType === "unknown" && column.inferredType !== "string")
  };
}

function previewValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? formatNumber(value) : "No disponible";
}

function FieldRow({ column, selected, active, onToggle, onFilter, onInspect }: { column: DatasetColumnProfile; selected: boolean; active: boolean; onToggle: () => void; onFilter: () => void; onInspect: () => void }) {
  return (
    <div className={cn("rounded-lg border p-3", active ? "border-[#9aa0ff] bg-[#fbfbff]" : "border-[#edf1fa]")}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={onToggle} className="min-w-0 text-left">
          <p className="truncate text-sm font-bold text-[#071334]">{column.displayName}</p>
          <p className="truncate text-xs text-[#697597]">{column.originalName}</p>
        </button>
        <button onClick={onFilter} className="grid size-8 shrink-0 place-items-center rounded-md text-[#3d35ff] hover:bg-[#f4f5ff]" aria-label={`Mostrar solo ${column.displayName}`}>
          <Filter className="size-4" />
        </button>
        <button onClick={onInspect} className="grid size-8 shrink-0 place-items-center rounded-md text-[#536088] hover:bg-[#f4f5ff]" aria-label={`Ver estadisticas de ${column.displayName}`}>
          <Info className="size-4" />
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

function ColumnStatsPanel({
  column,
  onShowOnly,
  onAskCopilot,
  onCreateWidget,
  onUseAsFilter,
  onUpdateDictionary
}: {
  column?: DatasetColumnProfile;
  onShowOnly: () => void;
  onAskCopilot: () => void;
  onCreateWidget: () => void;
  onUseAsFilter: () => void;
  onUpdateDictionary: (changes: Partial<Pick<DatasetColumnProfile, "businessName" | "description" | "displayName" | "synonyms" | "isHidden" | "userSemanticType">>) => void;
}) {
  const [businessName, setBusinessName] = useState(column?.businessName ?? column?.displayName ?? "");
  const [description, setDescription] = useState(column?.description ?? "");
  const [semanticType, setSemanticType] = useState<SemanticColumnType>(column?.userSemanticType ?? column?.semanticType ?? "unknown");
  const [synonyms, setSynonyms] = useState((column?.synonyms ?? []).join(", "));
  const [isHidden, setIsHidden] = useState(column?.isHidden ?? false);

  useEffect(() => {
    setBusinessName(column?.businessName ?? column?.displayName ?? "");
    setDescription(column?.description ?? "");
    setSemanticType(column?.userSemanticType ?? column?.semanticType ?? "unknown");
    setSynonyms((column?.synonyms ?? []).join(", "));
    setIsHidden(column?.isHidden ?? false);
  }, [column]);

  if (!column) return null;

  function saveDictionary() {
    onUpdateDictionary({
      businessName,
      displayName: businessName,
      description,
      userSemanticType: semanticType,
      synonyms: synonyms.split(","),
      isHidden
    });
  }

  return (
    <section className="soft-card rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-bold">{column.displayName}</h3>
          <p className="mt-1 truncate text-xs font-semibold text-[#697597]">{column.originalName} · {column.normalizedName}</p>
        </div>
        <span className="rounded-lg bg-[#f0f1ff] px-2 py-1 text-xs font-bold text-[#3d35ff]">{column.semanticType}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-[#fbfcff] p-3"><p className="text-xs font-bold text-[#697597]">Tipo</p><p className="mt-1 font-semibold">{column.inferredType}</p></div>
        <div className="rounded-lg bg-[#fbfcff] p-3"><p className="text-xs font-bold text-[#697597]">Unicos</p><p className="mt-1 font-semibold">{formatNumber(column.uniqueCount)}</p></div>
        <div className="rounded-lg bg-[#fbfcff] p-3"><p className="text-xs font-bold text-[#697597]">Nulos</p><p className="mt-1 font-semibold">{formatNumber(column.nullCount)} ({column.nullPercentage}%)</p></div>
        <div className="rounded-lg bg-[#fbfcff] p-3"><p className="text-xs font-bold text-[#697597]">Rango</p><p className="mt-1 truncate font-semibold">{column.min ?? "-"} - {column.max ?? "-"}</p></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {column.sampleValues.slice(0, 5).map((value) => <span key={String(value)} className="rounded-full bg-[#f6f7ff] px-3 py-1 text-xs font-semibold text-[#697597]">{String(value)}</span>)}
      </div>
      <div className="mt-4 rounded-lg border border-[#e3e8f5] bg-[#fbfcff] p-3">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#697597]">Diccionario</p>
        <label className="mt-3 block text-xs font-bold text-[#34405f]">
          Nombre de negocio
          <input className="mt-1 h-9 w-full rounded-md border border-[#dfe5f0] bg-white px-3 text-sm" value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
        </label>
        <label className="mt-3 block text-xs font-bold text-[#34405f]">
          Rol semantico
          <select className="mt-1 h-9 w-full rounded-md border border-[#dfe5f0] bg-white px-3 text-sm" value={semanticType} onChange={(event) => setSemanticType(event.target.value as SemanticColumnType)}>
            {semanticOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="mt-3 block text-xs font-bold text-[#34405f]">
          Descripcion
          <textarea className="mt-1 min-h-16 w-full rounded-md border border-[#dfe5f0] bg-white px-3 py-2 text-sm" value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="mt-3 block text-xs font-bold text-[#34405f]">
          Sinonimos
          <input className="mt-1 h-9 w-full rounded-md border border-[#dfe5f0] bg-white px-3 text-sm" value={synonyms} onChange={(event) => setSynonyms(event.target.value)} placeholder="ventas, revenue, ingresos" />
        </label>
        <label className="mt-3 flex items-center gap-2 text-xs font-bold text-[#34405f]">
          <input type="checkbox" checked={isHidden} onChange={(event) => setIsHidden(event.target.checked)} />
          Ocultar de sugerencias principales
        </label>
        <button onClick={saveDictionary} className="mt-3 w-full rounded-lg bg-[#3d35ff] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3028df]">Guardar diccionario</button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button onClick={onShowOnly} className="rounded-lg border border-[#dfe5f0] px-3 py-2 text-sm font-semibold hover:bg-[#f6f7ff]">Mostrar solo</button>
        <button onClick={onUseAsFilter} className="rounded-lg border border-[#dfe5f0] px-3 py-2 text-sm font-semibold hover:bg-[#f6f7ff]">Usar como filtro</button>
        <button onClick={onCreateWidget} className="rounded-lg border border-[#dfe5f0] px-3 py-2 text-sm font-semibold hover:bg-[#f6f7ff]">Crear grafico</button>
        <button onClick={onAskCopilot} className="rounded-lg border border-[#dfe5f0] px-3 py-2 text-sm font-semibold hover:bg-[#f6f7ff]">Preguntar a IA</button>
      </div>
    </section>
  );
}

function RowDetailDrawer({ row, columns, onClose }: { row: DataRow | null; columns: string[]; onClose: () => void }) {
  if (!row) return null;
  return (
    <aside className="fixed bottom-0 right-0 top-20 z-50 w-full overflow-y-auto border-l border-[#e3e8f5] bg-white p-5 shadow-2xl shadow-slate-900/15 sm:w-[420px]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold">Detalle de fila</h3>
        <button onClick={onClose} aria-label="Cerrar detalle de fila" className="grid size-9 place-items-center rounded-md text-[#697597] hover:bg-[#f3f5ff]"><X className="size-5" /></button>
      </div>
      <div className="mt-5 divide-y divide-[#edf1fa] rounded-xl border border-[#edf1fa]">
        {columns.map((column) => (
          <div key={column} className="grid gap-1 p-3">
            <p className="text-xs font-bold text-[#697597]">{column}</p>
            <p className="break-words text-sm font-semibold text-[#1c2748]">{String(row[column] ?? "-")}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

function DataQualitySummary({ profile }: { profile: DatasetProfile }) {
  const warnings = profile.qualityWarnings.slice(0, 2);
  const qualityTone = profile.qualityScore >= 85 ? "text-emerald-700 bg-emerald-50" : profile.qualityScore >= 70 ? "text-amber-700 bg-amber-50" : "text-rose-700 bg-rose-50";
  const summaryItems = [
    { label: "Filas", value: formatNumber(profile.rowCount), detail: `${profile.columnCount} columnas`, icon: Table2 },
    { label: "Metricas", value: formatNumber(profile.detectedMetricColumns.length), detail: "listas para KPIs", icon: BarChart3 },
    { label: "Dimensiones", value: formatNumber(profile.detectedDimensionColumns.length), detail: "para segmentar", icon: Eye },
    { label: "Calidad", value: `${profile.qualityScore}/100`, detail: warnings[0] ?? "sin alertas criticas", icon: profile.qualityScore >= 85 ? CheckCircle2 : AlertTriangle }
  ];

  return (
    <section className="grid gap-3 md:grid-cols-4">
      {summaryItems.map((item) => (
        <div key={item.label} className="soft-card rounded-xl p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#697597]">{item.label}</p>
            <span className={cn("grid size-8 place-items-center rounded-lg", item.label === "Calidad" ? qualityTone : "bg-[#f4f5ff] text-[#3d35ff]")}>
              <item.icon className="size-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold tracking-[-0.03em]">{item.value}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#697597]">{item.detail}</p>
        </div>
      ))}
      {warnings.length > 1 && (
        <div className="soft-card rounded-xl border-amber-100 bg-amber-50/60 p-4 md:col-span-4">
          <p className="text-sm font-semibold text-amber-800">{warnings.join(" ")}</p>
        </div>
      )}
    </section>
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
      <p className="mt-3 text-xs text-[#697597]">
        Vista previa: {preview.slice(0, 3).map((row) => `${row.label}: ${previewValue(row.value)}`).join(" · ") || "sin datos"}
        {preview.some((row) => row.result?.state && row.result.state !== "ok") ? " · revisar cobertura de datos" : ""}
      </p>
    </section>
  );
}

export function DataExplorerPanel() {
  const rows = useDashPilotStore((state) => state.rows);
  const profile = useDashPilotStore((state) => state.profile);
  const dashboard = useDashPilotStore((state) => state.dashboard);
  const viewState = useDashPilotStore((state) => state.viewState);
  const setViewState = useDashPilotStore((state) => state.setViewState);
  const addDashboardWidget = useDashPilotStore((state) => state.addDashboardWidget);
  const sendPrompt = useDashPilotStore((state) => state.sendPrompt);
  const updateColumnDictionary = useDashPilotStore((state) => state.updateColumnDictionary);
  const [page, setPage] = useState(0);
  const [columnSearchText, setColumnSearchText] = useState("");
  const [selectedColumnName, setSelectedColumnName] = useState<string | undefined>();
  const [selectedRow, setSelectedRow] = useState<DataRow | null>(null);
  const allColumns = useMemo(() => profile.columns.map((column) => column.normalizedName), [profile.columns]);
  const allColumnSet = useMemo(() => new Set(allColumns), [allColumns]);
  const persistedColumns = viewState.dataExplorer?.visibleColumns?.filter((column) => allColumnSet.has(column)) ?? [];
  const visibleColumns = persistedColumns.length ? persistedColumns : allColumns;
  const search = viewState.dataExplorer?.search ?? "";
  const sort = viewState.dataExplorer?.sort && allColumnSet.has(viewState.dataExplorer.sort.field) ? viewState.dataExplorer.sort : undefined;
  const storedColumnSearch = viewState.dataExplorer?.columnSearch && allColumnSet.has(viewState.dataExplorer.columnSearch.field) ? viewState.dataExplorer.columnSearch : undefined;
  const columnSearch = storedColumnSearch?.query.trim() ? storedColumnSearch : undefined;
  const table = useMemo(() => queryTableRows(rows, { search, columns: visibleColumns, filters: viewState.filters, sort, columnSearch }), [rows, search, sort, viewState.filters, visibleColumns, columnSearch]);
  const pageRows = table.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const filteredProfileColumns = useMemo(() => {
    const needle = columnSearchText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (!needle) return profile.columns;
    return profile.columns.filter((column) => `${column.displayName} ${column.originalName} ${column.normalizedName}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(needle));
  }, [columnSearchText, profile.columns]);
  const columnGroups = useMemo(() => groupColumns(filteredProfileColumns), [filteredProfileColumns]);
  const semantic = useMemo(() => inferSemanticLayer(profile, rows), [profile, rows]);
  const selectedColumn = profile.columns.find((column) => column.normalizedName === selectedColumnName) ?? profile.columns[0];
  const selectedSearchField = storedColumnSearch?.field ?? selectedColumn?.normalizedName ?? allColumns[0] ?? "";
  const pageCount = Math.max(1, Math.ceil(table.filteredRows / PAGE_SIZE));

  useEffect(() => {
    setPage((value) => Math.min(value, pageCount - 1));
  }, [pageCount]);

  function patchExplorer(patch: Partial<NonNullable<DashboardViewState["dataExplorer"]>>) {
    setViewState({ dataExplorer: { ...viewState.dataExplorer, ...patch, isOpen: true } });
  }

  function setColumnSearch(field: string, query: string) {
    const trimmed = query.trim();
    patchExplorer({ columnSearch: trimmed ? { field, query } : undefined });
  }

  function showAllRowsAndColumns() {
    setViewState({
      filters: [],
      selectedDateRange: undefined,
      dataExplorer: {
        ...viewState.dataExplorer,
        isOpen: true,
        search: "",
        columnSearch: undefined,
        sort: undefined,
        visibleColumns: allColumns
      }
    });
    setSelectedColumnName(undefined);
    setPage(0);
  }

  function toggleColumn(column: string) {
    const next = visibleColumns.includes(column) ? visibleColumns.filter((item) => item !== column) : [...visibleColumns, column];
    patchExplorer({ visibleColumns: next.length ? next : [column] });
    setSelectedColumnName(column);
    setPage(0);
  }

  function createWidgetFromColumn(column: DatasetColumnProfile) {
    const isMetric = ["metric", "measure"].includes(column.semanticType) || ["number", "currency", "percentage"].includes(column.inferredType);
    const primaryMetric = semantic.primaryMetric?.field ?? profile.detectedMetricColumns[0];
    const widget: DashboardWidget = isMetric
      ? {
          id: nextWidgetId(dashboard.widgets),
          type: "kpi_card",
          title: `Total ${column.displayName}`,
          query: { metric: { field: column.normalizedName, aggregation: "sum" } },
          config: { format: column.inferredType === "currency" ? "currency" : "number", compact: true, generatedBy: "column_panel" },
          position: nextPosition(dashboard.widgets)
        }
      : {
          id: nextWidgetId(dashboard.widgets),
          type: "bar_chart",
          title: `${profile.columns.find((item) => item.normalizedName === primaryMetric)?.displayName ?? "Registros"} por ${column.displayName}`,
          query: { metric: primaryMetric ? { field: primaryMetric, aggregation: "sum" } : undefined, groupBy: [column.normalizedName], orderBy: { field: "value", direction: "desc" }, limit: 10 },
          config: { format: "number", compact: true, generatedBy: "column_panel" },
          position: nextPosition(dashboard.widgets)
        };
    addDashboardWidget(widget);
  }

  function exportCsv() {
    const labelFor = (column: string) => profile.columns.find((item) => item.normalizedName === column)?.displayName ?? column;
    const header = visibleColumns.map(labelFor).join(",");
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
      <DataQualitySummary profile={profile} />
      <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
        <aside className="soft-card max-h-[720px] overflow-y-auto rounded-xl p-4">
          <h3 className="flex items-center gap-2 font-bold"><Eye className="size-4 text-[#3d35ff]" /> Campos</h3>
          <p className="mt-2 text-xs text-[#697597]">{profile.columnCount} columnas detectadas desde {profile.fileName}</p>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#dfe5f0] px-3">
            <Search className="size-4 text-[#697597]" />
            <input className="h-10 min-w-0 flex-1 text-sm outline-none" placeholder="Buscar columna..." value={columnSearchText} onChange={(event) => setColumnSearchText(event.target.value)} />
          </div>
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
                      active={selectedColumnName === column.normalizedName}
                      onToggle={() => toggleColumn(column.normalizedName)}
                      onFilter={() => {
                        patchExplorer({ visibleColumns: [column.normalizedName], columnSearch: undefined });
                        setSelectedColumnName(column.normalizedName);
                        setPage(0);
                      }}
                      onInspect={() => setSelectedColumnName(column.normalizedName)}
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
              <div className="flex gap-2">
                <Button onClick={showAllRowsAndColumns} variant="secondary" className="h-10 px-3">Ver todo</Button>
                <Button onClick={exportCsv} variant="secondary" className="h-10 px-3"><Download className="size-4" /> CSV</Button>
              </div>
              <div className="flex min-w-[260px] items-center gap-2 rounded-xl border border-[#dfe5f0] px-3">
                <Search className="size-4 text-[#697597]" />
                <input className="h-10 min-w-0 flex-1 text-sm outline-none" placeholder="Buscar en toda la tabla..." value={search} onChange={(event) => { patchExplorer({ search: event.target.value }); setPage(0); }} />
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr_auto]">
              <select className="h-10 rounded-lg border border-[#dfe5f0] bg-white px-3 text-sm" value={selectedSearchField} onChange={(event) => {
                setSelectedColumnName(event.target.value);
                setColumnSearch(event.target.value, columnSearch?.query ?? "");
                setPage(0);
              }}>
                {profile.columns.map((column) => <option key={column.normalizedName} value={column.normalizedName}>{column.displayName}</option>)}
              </select>
              <input className="h-10 rounded-lg border border-[#dfe5f0] px-3 text-sm" placeholder="Buscar dentro de una columna..." value={columnSearch?.query ?? ""} onChange={(event) => {
                setColumnSearch(selectedSearchField, event.target.value);
                setPage(0);
              }} />
              <button className="rounded-lg border border-[#dfe5f0] px-3 text-sm font-semibold disabled:opacity-50" disabled={!columnSearch?.query} onClick={() => { patchExplorer({ columnSearch: undefined }); setPage(0); }}>Limpiar columna</button>
            </div>
            <div className="mt-4 h-[420px] overflow-auto rounded-xl border border-[#edf1fa] lg:h-[520px]">
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
                  {pageRows.length ? pageRows.map((row, index) => (
                    <tr key={`${page}-${index}`} onClick={() => setSelectedRow(row)} className="cursor-pointer border-b border-[#edf1fa] last:border-0 hover:bg-[#fbfcff]">
                      {visibleColumns.map((column) => <td key={column} className="max-w-[240px] truncate px-3 py-3 text-[#1c2748]">{String(row[column] ?? "-")}</td>)}
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={Math.max(1, visibleColumns.length)} className="px-4 py-10 text-center text-sm font-semibold text-[#697597]">
                        No hay filas para la busqueda o filtros actuales.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <button className="rounded-lg border border-[#dfe5f0] px-3 py-2 font-semibold disabled:opacity-50" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Anterior</button>
              <span className="text-[#697597]">Pagina {page + 1} de {pageCount}</span>
              <button className="rounded-lg border border-[#dfe5f0] px-3 py-2 font-semibold disabled:opacity-50" disabled={page >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Siguiente</button>
            </div>
          </section>
          <ColumnStatsPanel
            column={selectedColumn}
            onShowOnly={() => selectedColumn && patchExplorer({ visibleColumns: [selectedColumn.normalizedName] })}
            onAskCopilot={() => selectedColumn && void sendPrompt(`Explica la columna ${selectedColumn.displayName}`).catch(() => undefined)}
            onCreateWidget={() => selectedColumn && createWidgetFromColumn(selectedColumn)}
            onUseAsFilter={() => selectedColumn && selectedColumn.sampleValues[0] !== undefined && setColumnSearch(selectedColumn.normalizedName, String(selectedColumn.sampleValues[0]))}
            onUpdateDictionary={(changes) => selectedColumn && updateColumnDictionary(selectedColumn.normalizedName, changes)}
          />
          <ChartBuilder />
        </div>
      </div>
      <RowDetailDrawer row={selectedRow} columns={visibleColumns} onClose={() => setSelectedRow(null)} />
    </section>
  );
}
