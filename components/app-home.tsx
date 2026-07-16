"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BarChart3, Database, FileUp, MonitorPlay, Share2, Sparkles, type LucideIcon } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useToast } from "@/components/shared/toast";
import { persistParsedDataset } from "@/lib/data-access";
import { parseUploadedFile } from "@/lib/files/parse-file";
import { useDashPilotStore } from "@/lib/store/app-store";

export function AppHome() {
  const loadDemo = useDashPilotStore((state) => state.loadDemo);
  const uploadedFileName = useDashPilotStore((state) => state.uploadedFileName);
  const currentProject = useDashPilotStore((state) => state.currentProject);
  const rows = useDashPilotStore((state) => state.rows);
  const dashboard = useDashPilotStore((state) => state.dashboard);
  const activeDashboardId = useDashPilotStore((state) => state.activeDashboardId);
  const activePresentationId = useDashPilotStore((state) => state.activePresentationId);
  const isExampleMode = useDashPilotStore((state) => state.isDemoMode);
  const setParsedDataset = useDashPilotStore((state) => state.setParsedDataset);
  const setPersistenceState = useDashPilotStore((state) => state.setPersistenceState);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();
  const hasProject = rows.length > 0;
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

  async function handleFile(file: File) {
    try {
      const parsed = await parseUploadedFile(file);
      setParsedDataset(parsed);
      toast("Guardando dataset...");
      const result = await persistParsedDataset({ file, parsed });
      setPersistenceState({
        activeDatasetId: result.datasetId,
        activeProjectId: result.projectId ?? "local-project",
        persistenceMode: result.mode,
        persistenceStatus: result.warning ?? (result.mode === "supabase" ? "Guardado en Supabase" : "Modo local"),
        executionMode: result.executionMode,
        syncStatus: result.syncStatus,
        lastSyncCorrelationId: result.correlationId,
        lastSyncError: result.warning
      });
      toast(result.warning ?? (result.mode === "supabase" ? "Dataset guardado en Supabase." : "Dataset guardado localmente."));
      router.push(`/app/datasets/${result.datasetId}/preview`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo procesar el archivo.");
    }
  }

  return (
    <AppShell>
      <div className="p-5 lg:p-8">
        <section className="soft-card rounded-2xl p-8">
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
              <button onClick={() => inputRef.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#dce3f4] bg-white px-5 text-sm font-semibold">
                <FileUp className="size-4" /> Subir dataset
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
        </section>

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

        <section className="mt-7 soft-card rounded-xl p-6">
          <h2 className="text-xl font-bold">Actividad reciente</h2>
          <div className="mt-4 divide-y divide-[#edf1fa] rounded-xl border border-[#edf1fa]">
            {(recentActivity.length ? recentActivity : ["Aún no hay actividad reciente"]).map((item) => (
              <p key={item} className="px-4 py-3 text-sm text-[#34405f]">{item}</p>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
