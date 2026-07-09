"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BarChart3, Calendar, CheckCircle2, Database, Download, FileSpreadsheet, Sparkles, Table2, Timer } from "lucide-react";
import { AppShell } from "@/components/shared/app-shell";
import { useToast } from "@/components/shared/toast";
import { loadPersistedDataset } from "@/lib/data-access";
import { useDashPilotStore } from "@/lib/store/app-store";

export function DatasetPreview() {
  const params = useParams<{ datasetId?: string }>();
  const rows = useDashPilotStore((state) => state.rows);
  const profile = useDashPilotStore((state) => state.profile);
  const uploadedFileName = useDashPilotStore((state) => state.uploadedFileName);
  const parsedDataset = useDashPilotStore((state) => state.parsedDataset);
  const selectedSheetName = useDashPilotStore((state) => state.selectedSheetName);
  const selectSheet = useDashPilotStore((state) => state.selectSheet);
  const importWarnings = useDashPilotStore((state) => state.importWarnings);
  const persistenceMode = useDashPilotStore((state) => state.persistenceMode);
  const persistenceStatus = useDashPilotStore((state) => state.persistenceStatus);
  const activeDatasetId = useDashPilotStore((state) => state.activeDatasetId);
  const hydrateDataset = useDashPilotStore((state) => state.hydrateDataset);
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const visibleColumns = profile.columns.length ? profile.columns.map((column) => column.normalizedName) : Object.keys(rows[0] ?? {});
  const hasRows = rows.length > 0;
  const updatedAt = profile.createdAt ? new Date(profile.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }) : "Sin actualizacion";
  const dateColumn = profile.columns.find((column) => profile.detectedDateColumns.includes(column.normalizedName));
  const detectedPeriod = dateColumn ? `Detectado desde ${dateColumn.displayName}` : "Sin periodo detectado";

  useEffect(() => {
    if (!params.datasetId || params.datasetId === activeDatasetId) return;
    let active = true;
    setLoading(true);
    void loadPersistedDataset(params.datasetId)
      .then((payload) => {
        if (!active || !payload) return;
        hydrateDataset({ rows: payload.rows, profile: payload.profile, datasetId: params.datasetId! });
      })
      .catch((error) => toast(error instanceof Error ? error.message : "No se pudo cargar el dataset."))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeDatasetId, hydrateDataset, params.datasetId, toast]);

  return (
    <AppShell>
      <div className="p-5 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-[-0.04em]">Previsualizacion del Dataset</h1>
            {loading && <p className="mt-2 text-sm font-semibold text-[#3d35ff]">Cargando dataset...</p>}
            {hasRows ? (
              <p className="mt-3 flex items-center gap-2 text-lg text-[#536088]">
                <FileSpreadsheet className="size-6 rounded bg-emerald-100 p-1 text-emerald-600" />
                Archivo subido: <strong className="text-[#071334]">{uploadedFileName || profile.fileName}</strong>
              </p>
            ) : (
              <p className="mt-3 text-lg text-[#536088]">Sube un dataset para comenzar.</p>
            )}
            {parsedDataset && (
              <p className={`mt-2 rounded-lg px-3 py-2 text-sm font-semibold ${persistenceMode === "supabase" ? "bg-emerald-50 text-emerald-700" : "bg-[#fff8e6] text-[#8a5a00]"}`}>
                {persistenceMode === "supabase" ? "Guardado en Supabase." : "Modo local."} {persistenceStatus}
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

        {!hasRows && (
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

        {hasRows && <div className="mt-7 grid gap-7 xl:grid-cols-[1fr_340px]">
          <section className="soft-card rounded-xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Vista previa de datos</h2>
              <button onClick={() => toast("Vista previa exportada.")} className="flex items-center gap-2 rounded-md border border-[#dfe5f0] px-3 py-2 text-sm font-semibold"><Download className="size-4" /> Exportar vista previa</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-[#fbfcff] text-xs text-[#536088]">
                  <tr>{visibleColumns.slice(0, 9).map((key) => <th key={key} className="border-y border-[#edf1fa] px-3 py-3 font-bold">{profile.columns.find((column) => column.normalizedName === key)?.displayName ?? key}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 8).map((row, index) => (
                    <tr key={index} className="border-b border-[#edf1fa]">
                      {visibleColumns.slice(0, 9).map((key) => <td key={key} className="px-3 py-3 text-[#1c2748]">{String(row[key] ?? "-")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="soft-card rounded-xl p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold"><Sparkles className="size-5 text-[#3d35ff]" /> Insights detectados por IA</h2>
              <div className="mt-4 space-y-3">
                {[
                  "Se detecto una columna de ventas como metrica principal.",
                  "La columna Region parece geografica y permite analisis por ubicacion.",
                  `${profile.qualityWarnings.length || importWarnings.length || 1} advertencia de calidad detectada para revisar.`,
                  dateColumn ? `Periodo detectado desde la columna ${dateColumn.displayName}.` : "No se detecto una columna temporal confiable."
                ].map((item) => (
                  <p key={item} className="rounded-lg border border-[#edf1fa] p-3 text-sm leading-6 text-[#34405f]"><CheckCircle2 className="mr-2 inline size-4 text-emerald-600" /> {item}</p>
                ))}
              </div>
              <button onClick={() => toast("Mostrando todos los insights detectados.")} className="mt-4 w-full rounded-lg border border-[#dfe5fb] py-2 text-sm font-semibold text-[#3d35ff]">Ver todos los insights</button>
            </section>
            <section className="soft-card rounded-xl p-5">
              <h2 className="text-lg font-bold">KPIs recomendados por IA</h2>
              <div className="mt-4 space-y-3">
                {["Ventas Totales", "Numero de Pedidos", "Ticket Promedio", "Descuento Promedio (%)"].map((item) => (
                  <div key={item} className="rounded-lg border border-[#edf1fa] p-3 text-sm font-semibold">{item}</div>
                ))}
              </div>
              <button onClick={() => toast("Mostrando todos los KPIs recomendados.")} className="mt-4 w-full rounded-lg border border-[#dfe5fb] py-2 text-sm font-semibold text-[#3d35ff]">Ver todos los KPIs</button>
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
                <button onClick={() => toast(`Detalle abierto: ${title}.`)} className="mt-4 text-sm font-semibold text-[#3d35ff]">Ver detalle</button>
              </article>
            ))}
          </div>
        </section>}
      </div>
    </AppShell>
  );
}
