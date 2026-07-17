"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BarChart3, Calendar, CheckCircle2, Database, Download, FileSpreadsheet, Sparkles, Table2, Timer } from "lucide-react";
import { AppShell } from "@/components/shared/app-shell";
import { useToast } from "@/components/shared/toast";
import { VirtualizedDataTable } from "@/components/shared/virtualized-data-table";
import { buildCopilotContext } from "@/lib/ai/context-builder";
import { loadImportJobForDataset, loadPersistedDataset } from "@/lib/data-access";
import { createDatasetDiagnostics, logDatasetDiagnostics } from "@/lib/debug/dataset-diagnostics";
import { getQueryableRowsSample } from "@/lib/query-service/client";
import { useDashPilotStore } from "@/lib/store/app-store";
import type { DataRow, SemanticColumnType } from "@/types/dataset";
import type { ImportJobRecord } from "@/types/imports";

const correctionOptions: Array<{ label: string; value: SemanticColumnType }> = [
  { label: "Metrica", value: "metric" },
  { label: "Dimension", value: "dimension" },
  { label: "Fecha / tiempo", value: "time" },
  { label: "Geografia", value: "geo" },
  { label: "Identificador", value: "identifier" },
  { label: "Texto / desconocido", value: "unknown" }
];

const PREVIEW_SAMPLE_LIMIT = 100;

function DatasetPreviewSkeleton() {
  return (
    <section className="mt-7 rounded-xl border border-[#e3e8f5] bg-white p-5" aria-label="Cargando vista previa">
      <div className="h-5 w-56 animate-pulse rounded bg-[#edf1fa]" />
      <div className="mt-5 grid gap-3">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="grid grid-cols-5 gap-3">
            {Array.from({ length: 5 }, (__, cellIndex) => <div key={cellIndex} className="h-9 animate-pulse rounded bg-[#f3f5fb]" />)}
          </div>
        ))}
      </div>
    </section>
  );
}

function exportRowsCsv(fileName: string, rows: DataRow[], columns: string[], labelFor: (column: string) => string) {
  const header = columns.map((column) => `"${labelFor(column).replace(/"/g, '""')}"`).join(",");
  const body = rows.map((row) => columns.map((column) => `"${String(row[column] ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([[header, body].filter(Boolean).join("\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function DatasetPreview() {
  const params = useParams<{ datasetId?: string }>();
  const profile = useDashPilotStore((state) => state.profile);
  const uploadedFileName = useDashPilotStore((state) => state.uploadedFileName);
  const parsedDataset = useDashPilotStore((state) => state.parsedDataset);
  const selectedSheetName = useDashPilotStore((state) => state.selectedSheetName);
  const selectSheet = useDashPilotStore((state) => state.selectSheet);
  const updateColumnDictionary = useDashPilotStore((state) => state.updateColumnDictionary);
  const importWarnings = useDashPilotStore((state) => state.importWarnings);
  const dashboard = useDashPilotStore((state) => state.dashboard);
  const viewState = useDashPilotStore((state) => state.viewState);
  const persistenceMode = useDashPilotStore((state) => state.persistenceMode);
  const persistenceStatus = useDashPilotStore((state) => state.persistenceStatus);
  const activeDatasetId = useDashPilotStore((state) => state.activeDatasetId);
  const activeDatasetVersionId = useDashPilotStore((state) => state.activeDatasetVersionId);
  const hydrateDataset = useDashPilotStore((state) => state.hydrateDataset);
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showAllInsights, setShowAllInsights] = useState(false);
  const [showAllKpis, setShowAllKpis] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [selectedProfileDetail, setSelectedProfileDetail] = useState<string | null>(null);
  const [importJob, setImportJob] = useState<ImportJobRecord | null>(null);
  const loadRequestRef = useRef(0);
  const selectedSheet = parsedDataset?.sheets.find((sheet) => sheet.name === selectedSheetName);
  const visibleColumns = useMemo(() => profile.columns.map((column) => column.normalizedName), [profile.columns]);
  const columnLabels = useMemo(() => new Map(profile.columns.map((column) => [column.normalizedName, column.displayName])), [profile.columns]);
  const querySampleRows = useMemo(() => getQueryableRowsSample(activeDatasetVersionId || profile.datasetVersionId || activeDatasetId, PREVIEW_SAMPLE_LIMIT), [activeDatasetId, activeDatasetVersionId, profile.datasetVersionId]);
  const previewRows = useMemo(() => {
    if (selectedSheet?.previewRows.length) return selectedSheet.previewRows.slice(0, PREVIEW_SAMPLE_LIMIT);
    return querySampleRows;
  }, [querySampleRows, selectedSheet]);
  const tableColumns = useMemo(
    () => visibleColumns.map((column) => ({ key: column, label: columnLabels.get(column) ?? column })),
    [columnLabels, visibleColumns]
  );
  const hasRows = Boolean(activeDatasetId && profile.rowCount > 0);
  const parseAudit = selectedSheet?.parseAudit ?? [];
  const columnsWithParseWarnings = profile.columns.filter((column) => (column.parseWarnings?.length ?? 0) > 0 || column.mixedType);
  const diagnostics = useMemo(() => {
    const copilotContext = process.env.NODE_ENV === "development" && hasRows
      ? buildCopilotContext({ rows: previewRows, datasetProfile: profile, dashboardSpec: dashboard, viewState })
      : undefined;
    return createDatasetDiagnostics({ profile, parsedDataset, dashboardSpec: dashboard, copilotContext });
  }, [dashboard, hasRows, parsedDataset, previewRows, profile, viewState]);
  const updatedAt = profile.createdAt ? new Date(profile.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }) : "Sin actualizacion";
  const dateColumn = profile.columns.find((column) => profile.detectedDateColumns.includes(column.normalizedName));
  const detectedPeriod = dateColumn ? `Detectado desde ${dateColumn.displayName}` : "Sin periodo detectado";
  const insightItems = [
    profile.detectedMetricColumns.length ? `Metricas detectadas: ${profile.detectedMetricColumns.join(", ")}.` : "No se detectaron metricas numericas confiables.",
    profile.detectedGeoColumns.length ? `Geografia detectada: ${profile.detectedGeoColumns.join(", ")}.` : "No se detectaron columnas geograficas confiables.",
    `${profile.qualityWarnings.length || importWarnings.length || 1} advertencia de calidad detectada para revisar.`,
    dateColumn ? `Periodo detectado desde la columna ${dateColumn.displayName}.` : "No se detecto una columna temporal confiable.",
    profile.detectedDimensionColumns.length ? `Dimensiones disponibles: ${profile.detectedDimensionColumns.slice(0, 8).join(", ")}.` : "No se detectaron dimensiones suficientes."
  ];
  const recommendedKpis = [
    ...profile.detectedMetricColumns.map((field) => `Total ${profile.columns.find((column) => column.normalizedName === field)?.displayName ?? field}`),
    profile.detectedMetricColumns[0] ? `Promedio ${profile.columns.find((column) => column.normalizedName === profile.detectedMetricColumns[0])?.displayName ?? profile.detectedMetricColumns[0]}` : undefined,
    profile.detectedDimensionColumns[0] ? `Conteo por ${profile.columns.find((column) => column.normalizedName === profile.detectedDimensionColumns[0])?.displayName ?? profile.detectedDimensionColumns[0]}` : undefined
  ].filter((item): item is string => Boolean(item));

  function exportPreviewCsv() {
    exportRowsCsv(`${profile.id || "dataset"}-preview-sample.csv`, previewRows, visibleColumns, (column) => columnLabels.get(column) ?? column);
    toast("Vista previa exportada en CSV.");
  }

  function cancelDatasetLoad() {
    loadRequestRef.current += 1;
    setLoading(false);
    setLoadError("Carga cancelada por el usuario.");
  }

  useEffect(() => {
    if (!params.datasetId || params.datasetId === activeDatasetId) return;
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    void Promise.resolve().then(() => {
      if (loadRequestRef.current === requestId) {
        setLoadError("");
        setLoading(true);
      }
    });
    void loadPersistedDataset(params.datasetId)
      .then((payload) => {
        if (loadRequestRef.current !== requestId || !payload) return;
        hydrateDataset({ rows: payload.rows, profile: payload.profile, datasetId: params.datasetId! });
      })
      .catch((error) => {
        if (loadRequestRef.current !== requestId) return;
        const message = error instanceof Error ? error.message : "No se pudo cargar el dataset.";
        setLoadError(message);
        toast(message);
      })
      .finally(() => {
        if (loadRequestRef.current === requestId) setLoading(false);
      });
    return () => {
      if (loadRequestRef.current === requestId) loadRequestRef.current += 1;
    };
  }, [activeDatasetId, hydrateDataset, params.datasetId, toast]);

  useEffect(() => {
    if (!params.datasetId || hasRows) {
      return;
    }
    let active = true;
    void loadImportJobForDataset(params.datasetId).then((job) => {
      if (active) setImportJob(job);
    });
    return () => {
      active = false;
    };
  }, [hasRows, params.datasetId]);

  useEffect(() => {
    if (hasRows) logDatasetDiagnostics(diagnostics);
  }, [diagnostics, hasRows]);

  return (
    <AppShell>
      <div className="p-5 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-[-0.04em]">Previsualizacion del Dataset</h1>
            {loading && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm font-semibold text-[#3d35ff]">
                <span>Cargando dataset...</span>
                <button onClick={cancelDatasetLoad} className="rounded-md border border-[#dfe5f0] bg-white px-3 py-1 text-xs text-[#536088]">Cancelar</button>
              </div>
            )}
            {hasRows ? (
              <p className="mt-3 flex items-center gap-2 text-lg text-[#536088]">
                <FileSpreadsheet className="size-6 rounded bg-emerald-100 p-1 text-emerald-600" />
                Archivo subido: <strong className="text-[#071334]">{uploadedFileName || profile.fileName}</strong>
              </p>
            ) : importJob ? (
              <p className="mt-3 flex items-center gap-2 text-lg text-[#536088]">
                <FileSpreadsheet className="size-6 rounded bg-[#f1f3ff] p-1 text-[#3d35ff]" />
                Importacion en proceso: <strong className="text-[#071334]">{importJob.fileName}</strong>
              </p>
            ) : (
              <p className="mt-3 text-lg text-[#536088]">Sube un dataset para comenzar.</p>
            )}
            {parsedDataset && (
              <p className={`mt-2 rounded-lg px-3 py-2 text-sm font-semibold ${persistenceMode === "supabase" ? "bg-emerald-50 text-emerald-700" : persistenceMode === "degraded" ? "bg-rose-50 text-rose-700" : "bg-[#fff8e6] text-[#8a5a00]"}`}>
                {persistenceMode === "supabase" ? "Guardado en Supabase." : persistenceMode === "degraded" ? "Sincronizacion degradada." : "Modo local."} {persistenceStatus}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <Link href="/app/proyectos" className="inline-flex h-11 items-center rounded-lg border border-[#dce3f4] bg-white px-5 text-sm font-semibold">← Volver a Proyectos</Link>
            <Link href={hasRows ? "/app/generando" : "/app"} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#3d35ff] px-5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25">
              <Sparkles className="size-4" /> Generar dashboard automaticamente
            </Link>
          </div>
        </div>

        {loading && !hasRows && <DatasetPreviewSkeleton />}

        {loadError && !loading && (
          <section className="mt-7 rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
            <h2 className="font-bold">No se pudo cargar la vista previa</h2>
            <p className="mt-2 text-sm font-semibold">{loadError}</p>
          </section>
        )}

        {!hasRows && importJob && (
          <section className="mt-7 rounded-xl border border-[#d9dcff] bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-[#1c2748]">Importacion recuperable</h2>
                <p className="mt-2 text-sm leading-6 text-[#536088]">
                  Estado {importJob.status}. Etapa {importJob.stage}. La UI no procesa el archivo completo; el worker continua desde la cola.
                </p>
              </div>
              <span className="rounded-full bg-[#f1f3ff] px-3 py-1 text-sm font-bold text-[#3d35ff]">{importJob.progress}%</span>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#edf1fa]" aria-label="Progreso de importacion">
              <div className="h-full rounded-full bg-[#3d35ff]" style={{ width: `${importJob.progress}%` }} />
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-xl border border-[#edf1fa] p-4">
                <h3 className="font-bold">Preview seguro</h3>
                <p className="mt-2 text-sm text-[#536088]">{importJob.safePreview.fileType.toUpperCase()} · {importJob.safePreview.detectedMimeType} · {importJob.safePreview.sizeBytes.toLocaleString("en-US")} bytes</p>
                {importJob.safePreview.sampleTextLines.length ? (
                  <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-[#fbfcff] p-3 text-xs text-[#34405f]">{importJob.safePreview.sampleTextLines.join("\n")}</pre>
                ) : (
                  <p className="mt-3 rounded-lg bg-[#fbfcff] p-3 text-sm text-[#536088]">Preview tabular pendiente hasta que el worker inspeccione el archivo fuera del navegador.</p>
                )}
              </div>
              <div className="rounded-xl border border-[#edf1fa] p-4">
                <h3 className="font-bold">Eventos</h3>
                <div className="mt-3 space-y-2 text-sm text-[#536088]">
                  {importJob.events.slice(-4).map((event) => (
                    <p key={`${event.stage}-${event.createdAt}`}><strong className="text-[#1c2748]">{event.stage}:</strong> {event.message}</p>
                  ))}
                  {importJob.error && <p className="rounded-lg bg-rose-50 p-2 font-semibold text-rose-700">{importJob.error.message}</p>}
                </div>
              </div>
            </div>
          </section>
        )}

        {!hasRows && !importJob && (
          <section className="mt-7 soft-card rounded-xl p-8 text-center">
            <h2 className="text-xl font-bold">Sin proyecto activo</h2>
            <p className="mt-2 text-[#617094]">Sube un dataset para comenzar. Aún no hay dashboards, presentaciones ni enlaces compartidos.</p>
          </section>
        )}

        {hasRows && <div className="mt-7 grid gap-4 rounded-xl border border-[#e3e8f5] bg-white p-4 md:grid-cols-5">
          {[
            [Table2, "Filas", profile.rowCount.toLocaleString("en-US")],
            [BarChart3, "Columnas", profile.columnCount],
            [Database, "Hojas", parsedDataset?.sheets.length ?? 1],
            [Timer, "Ultima actualizacion", updatedAt],
            [Calendar, "Periodo detectado", detectedPeriod]
          ].map(([Icon, label, value]) => (
            <div key={String(label)} className="flex items-center gap-4 border-[#edf1fa] p-3 md:border-r last:border-0">
              {/* @ts-expect-error tuple icon type is inferred broadly */}
              <Icon className="size-10 rounded-lg bg-[#f1f3ff] p-2 text-[#3d35ff]" />
              <div>
                <p className="text-xs text-[#697597]">{String(label)}</p>
                <p className="font-bold">{String(value)}</p>
              </div>
            </div>
          ))}
        </div>}

        {hasRows && parsedDataset && parsedDataset.sheets.length > 1 && (
          <section className="mt-5 soft-card rounded-xl p-5">
            <label className="text-sm font-bold">Hoja a analizar</label>
            <select
              aria-label="Hoja a analizar"
              className="mt-2 h-11 rounded-lg border border-[#dfe5f0] bg-white px-4 text-sm"
              value={selectedSheetName}
              onChange={(event) => selectSheet(event.target.value)}
            >
              {parsedDataset.sheets.map((sheet) => (
                <option key={sheet.name} value={sheet.name}>
                  {sheet.name} · {sheet.rowCount} filas · {sheet.columnCount} columnas
                </option>
              ))}
            </select>
          </section>
        )}

        {hasRows && (importWarnings.length > 0 || profile.qualityWarnings.length > 0) && (
          <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="font-bold text-amber-900">Advertencias de calidad</h2>
            <div className="mt-2 grid gap-2 text-sm text-amber-800">
              {[...importWarnings, ...profile.qualityWarnings].slice(0, 5).map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          </section>
        )}

        {hasRows && columnsWithParseWarnings.length > 0 && (
          <section className="mt-5 rounded-xl border border-[#d9dcff] bg-[#fbfbff] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-[#1c2748]">Correccion de tipos antes del dashboard</h2>
                <p className="mt-1 text-sm text-[#536088]">Revisa columnas mixtas, fechas ambiguas o valores que no pudieron normalizarse. Los cambios ajustan el rol usado para generar el dashboard.</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#3d35ff]">{columnsWithParseWarnings.length} columnas para revisar</span>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {columnsWithParseWarnings.slice(0, 6).map((column) => (
                <article key={column.normalizedName} className="rounded-xl border border-[#e3e8f5] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-[#1c2748]">{column.displayName}</p>
                      <p className="mt-1 text-xs font-semibold text-[#697597]">ID canonico: {column.canonicalName ?? column.normalizedName}</p>
                    </div>
                    <select
                      className="h-9 rounded-lg border border-[#dfe5f0] bg-white px-2 text-xs font-semibold"
                      value={column.userSemanticType ?? column.semanticType}
                      onChange={(event) => updateColumnDictionary(column.normalizedName, { userSemanticType: event.target.value as SemanticColumnType })}
                    >
                      {correctionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div className="mt-3 space-y-2 text-xs leading-5 text-[#697597]">
                    {(column.parseWarnings ?? []).slice(0, 3).map((warning) => <p key={warning}>{warning}</p>)}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {hasRows && parseAudit.length > 0 && (
          <section className="mt-5 rounded-xl border border-[#e3e8f5] bg-white p-5">
            <h2 className="font-bold text-[#1c2748]">Valores no normalizados automaticamente</h2>
            <p className="mt-1 text-sm text-[#536088]">Muestra auditable de celdas convertidas, ambiguas o invalidas. Las fechas ambiguas se conservan como texto hasta que corrijas el formato o el tipo.</p>
            <div className="mt-4 overflow-x-auto rounded-xl border border-[#edf1fa]">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-[#fbfcff] text-[#536088]">
                  <tr>{["Fila", "Columna", "Raw", "Normalizado", "Estado", "Mensaje"].map((header) => <th key={header} className="border-b border-[#edf1fa] px-3 py-2 font-bold">{header}</th>)}</tr>
                </thead>
                <tbody>
                  {parseAudit.slice(0, 12).map((item) => (
                    <tr key={`${item.rowIndex}-${item.columnId}-${item.rawValue}`} className="border-b border-[#edf1fa] last:border-0">
                      <td className="px-3 py-2">{item.rowIndex + 1}</td>
                      <td className="px-3 py-2 font-semibold">{item.originalName}</td>
                      <td className="max-w-[160px] truncate px-3 py-2">{item.rawValue || "-"}</td>
                      <td className="max-w-[160px] truncate px-3 py-2">{String(item.normalizedValue ?? "-")}</td>
                      <td className="px-3 py-2">{item.status}</td>
                      <td className="max-w-[300px] truncate px-3 py-2">{item.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {hasRows && <div className="mt-7 grid gap-7 xl:grid-cols-[1fr_340px]">
          <section className="soft-card rounded-xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Vista previa de datos</h2>
                <p className="mt-1 text-sm text-[#697597]">Mostrando {previewRows.length.toLocaleString("en-US")} de {profile.rowCount.toLocaleString("en-US")} filas. Usa Explorar datos para filtros y descarga completa.</p>
              </div>
              <button onClick={exportPreviewCsv} className="flex items-center gap-2 rounded-md border border-[#dfe5f0] px-3 py-2 text-sm font-semibold"><Download className="size-4" /> Exportar muestra</button>
            </div>
            <VirtualizedDataTable
              ariaLabel="Vista previa virtualizada del dataset"
              rows={previewRows}
              columns={tableColumns}
              totalRows={profile.rowCount}
              height={520}
              emptyMessage="No hay filas disponibles para la vista previa."
            />
          </section>

          <aside className="space-y-6">
            <section className="soft-card rounded-xl p-5">
                <h2 className="flex items-center gap-2 text-lg font-bold"><Sparkles className="size-5 text-[#3d35ff]" /> Insights detectados por reglas</h2>
              <div className="mt-4 space-y-3">
                {(showAllInsights ? insightItems : insightItems.slice(0, 4)).map((item) => (
                  <p key={item} className="rounded-lg border border-[#edf1fa] p-3 text-sm leading-6 text-[#34405f]"><CheckCircle2 className="mr-2 inline size-4 text-emerald-600" /> {item}</p>
                ))}
              </div>
              <button onClick={() => setShowAllInsights((value) => !value)} className="mt-4 w-full rounded-lg border border-[#dfe5fb] py-2 text-sm font-semibold text-[#3d35ff]">{showAllInsights ? "Ver menos insights" : "Ver todos los insights"}</button>
            </section>
            <section className="soft-card rounded-xl p-5">
                <h2 className="text-lg font-bold">KPIs recomendados automaticamente</h2>
              <div className="mt-4 space-y-3">
                {(showAllKpis ? recommendedKpis : recommendedKpis.slice(0, 4)).map((item) => (
                  <div key={item} className="rounded-lg border border-[#edf1fa] p-3 text-sm font-semibold">{item}</div>
                ))}
              </div>
              <button onClick={() => setShowAllKpis((value) => !value)} className="mt-4 w-full rounded-lg border border-[#dfe5fb] py-2 text-sm font-semibold text-[#3d35ff]">{showAllKpis ? "Ver menos KPIs" : "Ver todos los KPIs"}</button>
            </section>
          </aside>
        </div>}

        {hasRows && <section className="mt-7 soft-card rounded-xl p-5">
          <h2 className="text-lg font-bold">Perfilado del Dataset</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-5">
            {[
              ["Tipos detectados", profile.columns.map((column) => column.inferredType).join(", ")],
              ["Columnas metricas", profile.detectedMetricColumns.join(", ")],
              ["Dimensiones", profile.detectedDimensionColumns.slice(0, 5).join(", ")],
              ["Fechas", profile.detectedDateColumns.join(", ") || "Sin fecha"],
              ["Calidad de datos", `${profile.qualityScore}%`]
            ].map(([title, copy]) => (
              <article key={title} className="rounded-xl border border-[#e3e8f5] p-4">
                <h3 className="font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#536088]">{copy}</p>
                <button onClick={() => setSelectedProfileDetail(selectedProfileDetail === title ? null : title)} className="mt-4 text-sm font-semibold text-[#3d35ff]">Ver detalle</button>
                {selectedProfileDetail === title && <p className="mt-3 rounded-lg bg-[#fbfcff] p-3 text-xs leading-5 text-[#536088]">{copy || "Sin datos suficientes para este detalle."}</p>}
              </article>
            ))}
          </div>
        </section>}

        {hasRows && process.env.NODE_ENV === "development" && <section className="mt-7 rounded-xl border border-dashed border-[#b8c2e6] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Diagnostico dataset</h2>
              <p className="mt-1 text-sm text-[#536088]">{diagnostics.parsedRowCount.toLocaleString("en-US")} filas procesadas - {diagnostics.parsedColumnCount} columnas parseadas - hoja {diagnostics.selectedSheetName ?? "actual"}</p>
            </div>
            <button onClick={() => setShowDiagnostics((value) => !value)} className="rounded-lg border border-[#dfe5fb] px-4 py-2 text-sm font-semibold text-[#3d35ff]">{showDiagnostics ? "Ocultar columnas" : "Columnas detectadas"}</button>
          </div>
          {showDiagnostics && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-[#edf1fa]">
              <table className="w-full min-w-[920px] text-left text-xs">
                <thead className="bg-[#fbfcff] text-[#536088]">
                  <tr>
                    {["Original", "Normalizada", "Tipo", "Semantica", "GeoRole", "Unicos", "Muestras"].map((header) => <th key={header} className="border-b border-[#edf1fa] px-3 py-2 font-bold">{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {diagnostics.columns.map((column) => (
                    <tr key={column.normalized} className="border-b border-[#edf1fa] last:border-0">
                      <td className="px-3 py-2 font-semibold text-[#1c2748]">{column.original}</td>
                      <td className="px-3 py-2 text-[#1c2748]">{column.normalized}</td>
                      <td className="px-3 py-2 text-[#536088]">{column.inferredType}</td>
                      <td className="px-3 py-2 text-[#536088]">{column.semanticType}</td>
                      <td className="px-3 py-2 text-[#536088]">{column.geoRole ?? "-"}</td>
                      <td className="px-3 py-2 text-[#536088]">{column.uniqueCount}</td>
                      <td className="max-w-[260px] truncate px-3 py-2 text-[#536088]">{column.sampleValues.map((value) => String(value)).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>}
      </div>
    </AppShell>
  );
}
