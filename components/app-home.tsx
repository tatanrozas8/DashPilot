"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BarChart3, Database, FileUp, MonitorPlay, Share2, Sparkles, type LucideIcon } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useToast } from "@/components/shared/toast";
import { EmptyState, Panel, StatusBadge } from "@/components/shared/ui";
import { persistParsedDataset } from "@/lib/data-access";
import { parseUploadedFile } from "@/lib/files/parse-file";
import { useDashPilotStore } from "@/lib/store/app-store";

export function AppHome() {
  const loadDemo = useDashPilotStore((state) => state.loadDemo);
  const uploadedFileName = useDashPilotStore((state) => state.uploadedFileName);
  const currentProject = useDashPilotStore((state) => state.currentProject);
  const activeDatasetId = useDashPilotStore((state) => state.activeDatasetId);
  const profile = useDashPilotStore((state) => state.profile);
  const dashboard = useDashPilotStore((state) => state.dashboard);
  const activeDashboardId = useDashPilotStore((state) => state.activeDashboardId);
  const activePresentationId = useDashPilotStore((state) => state.activePresentationId);
  const isExampleMode = useDashPilotStore((state) => state.isDemoMode);
  const setParsedDataset = useDashPilotStore((state) => state.setParsedDataset);
  const setPersistenceState = useDashPilotStore((state) => state.setPersistenceState);
  const inputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<"idle" | "loading" | "error">("idle");
  const [importError, setImportError] = useState("");
  const router = useRouter();
  const toast = useToast();
  const hasProject = Boolean(activeDatasetId && profile.rowCount > 0);
  const dashboardHref = activeDashboardId ? `/app/dashboards/${activeDashboardId}` : "/app/generando";
  const shareHref = activeDashboardId ? `/app/dashboards/${activeDashboardId}/compartir` : "/app/proyectos";
  const presentationHref = activePresentationId ? `/app/present/${activePresentationId}` : "/app/presentaciones/crear";
  const recentActivity = hasProject
    ? [
        `${isExampleMode ? "Datos de ejemplo" : "Dataset"} cargado: ${uploadedFileName}`,
        `Dashboard disponible: ${dashboard.title}`,
        activePresentationId ? "Presentacion interactiva disponible" : "Aún no hay presentaciones"
      ]
    : [];
  const importSteps = [
    { label: "Fuente", copy: "Archivo local CSV/XLS/XLSX", status: "Listo" },
    { label: "Archivo", copy: uploadedFileName || "Selecciona un archivo", status: importStatus === "loading" ? "Procesando" : hasProject ? "Listo" : "Pendiente" },
    { label: "Hoja", copy: "Seleccion en preview", status: hasProject ? "Listo" : "Pendiente" },
    { label: "Esquema", copy: "Tipos y columnas corregibles", status: hasProject ? "Listo" : "Pendiente" },
    { label: "Calidad", copy: `${profile.qualityWarnings.length} warning(s)`, status: hasProject ? "Revisar" : "Pendiente" },
    { label: "Generacion", copy: "DashboardSpec deterministico", status: activeDashboardId ? "Listo" : "Pendiente" }
  ];

  async function handleFile(file: File) {
    let completed = false;
    try {
      setImportStatus("loading");
      setImportError("");
      const parsed = await parseUploadedFile(file);
      setParsedDataset(parsed);
      toast("Guardando dataset...");
      const result = await persistParsedDataset({ file, parsed });
      setPersistenceState({
        activeDatasetId: result.datasetId,
        activeDatasetVersionId: result.datasetVersionId ?? "",
        activeProjectId: result.projectId ?? "local-project",
        persistenceMode: result.mode,
        persistenceStatus: result.warning ?? (result.mode === "supabase" ? "Guardado en Supabase" : "Modo local"),
        executionMode: result.executionMode,
        syncStatus: result.syncStatus,
        lastSyncCorrelationId: result.correlationId,
        lastSyncError: result.warning
      });
      toast(result.warning ?? (result.mode === "supabase" ? "Dataset guardado en Supabase." : "Dataset guardado localmente."));
      completed = true;
      router.push(`/app/datasets/${result.datasetId}/preview`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo procesar el archivo.";
      setImportStatus("error");
      setImportError(message);
      toast(message);
    } finally {
      if (completed) setImportStatus("idle");
    }
  }

  return (
    <AppShell>
      <div className="p-5 lg:p-8">
        <Panel className="rounded-2xl p-8">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-sm font-semibold text-[#3d35ff]">Home interna</p>
              <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">Bienvenido a DashPilot</h1>
              <p className="mt-3 max-w-2xl text-[#617094]">
                {hasProject ? `Proyecto activo: ${currentProject.name}. Convierte datasets en dashboards, presentaciones y enlaces compartidos sin perder interactividad.` : "Sin proyecto activo. Sube un dataset para comenzar."}
              </p>
            </div>
            <div className="flex gap-3">
              <input
                ref={inputRef}
                hidden
                type="file"
                accept=".csv,.xls,.xlsx"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              <button disabled={importStatus === "loading"} onClick={() => inputRef.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#dce3f4] bg-white px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60">
                <FileUp className="size-4" /> {importStatus === "loading" ? "Procesando..." : "Subir dataset"}
              </button>
              <Link
                href="/app/datasets/preview"
                onClick={loadDemo}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#3d35ff] px-5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25"
              >
                <Sparkles className="size-4" /> Probar con datos de ejemplo
              </Link>
            </div>
          </div>
          {importError && (
            <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
              {importError}
            </div>
          )}
        </Panel>

        <Panel className="mt-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Workflow principal</h2>
              <p className="mt-1 text-sm text-[#617094]">Cada paso muestra una capacidad real y te lleva a la siguiente pantalla verificable.</p>
            </div>
            <StatusBadge tone={hasProject ? "success" : importStatus === "error" ? "danger" : "info"}>
              {hasProject ? "Proyecto activo" : importStatus === "error" ? "Requiere retry" : "Listo para importar"}
            </StatusBadge>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {importSteps.map((step, index) => (
              <div key={step.label} className="rounded-lg border border-[#e3e8f5] bg-[#fbfcff] p-4">
                <p className="text-xs font-bold text-[#697597]">{index + 1}. {step.label}</p>
                <p className="mt-2 min-h-10 text-sm font-semibold text-[#1c2748]">{step.copy}</p>
                <StatusBadge tone={step.status === "Listo" ? "success" : step.status === "Revisar" ? "warning" : step.status === "Procesando" ? "info" : "neutral"} className="mt-3">
                  {step.status}
                </StatusBadge>
              </div>
            ))}
          </div>
        </Panel>

        <section className="mt-7 grid gap-5 md:grid-cols-4">
          {([
            [Database, "Datasets", "/app/datasets/preview", hasProject ? "Vista previa y perfilado" : "Sube un dataset para comenzar"],
            [BarChart3, "Dashboards", dashboardHref, hasProject ? "KPIs y Copiloto" : "Aún no hay dashboards"],
            [MonitorPlay, "Presentaciones", presentationHref, hasProject ? "Slides vivos" : "Aún no hay presentaciones"],
            [Share2, "Compartidos", shareHref, hasProject ? "Enlaces y exportacion" : "Aún no hay enlaces compartidos"]
          ] as Array<[LucideIcon, string, string, string]>).map(([Icon, title, href, copy]) => (
            <Link key={String(title)} href={String(href)} className="soft-card rounded-xl p-5 transition hover:-translate-y-0.5 hover:shadow-xl">
              <Icon className="size-10 rounded-lg bg-[#f0f1ff] p-2 text-[#3d35ff]" />
              <h2 className="mt-4 text-xl font-bold">{String(title)}</h2>
              <p className="mt-2 text-sm text-[#617094]">{String(copy)}</p>
            </Link>
          ))}
        </section>

        <Panel className="mt-7">
          <h2 className="text-xl font-bold">Actividad reciente</h2>
          {recentActivity.length ? (
            <div className="mt-4 divide-y divide-[#edf1fa] rounded-xl border border-[#edf1fa]">
              {recentActivity.map((item) => (
                <p key={item} className="px-4 py-3 text-sm text-[#34405f]">{item}</p>
              ))}
            </div>
          ) : (
            <EmptyState title="Aun no hay actividad reciente" description="Importa un dataset o abre el ejemplo para activar preview, dashboard, presentacion y sharing." />
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
