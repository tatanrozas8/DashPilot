"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Download, FileImage, FileText, Link2, MonitorPlay, Pencil, Play, Save, Share2, Sparkles, Users, X } from "lucide-react";
import { DashboardEditor } from "@/components/dashboard/dashboard-editor";
import { DataExplorerPanel } from "@/components/dashboard/data-explorer";
import { CopilotPanel, DashboardFilters, DashboardRenderer } from "@/components/dashboard/dashboard-renderer";
import { AppShell } from "@/components/shared/app-shell";
import { Button } from "@/components/shared/button";
import { useToast } from "@/components/shared/toast";
import { loadPersistedDashboard, updatePersistedDashboard } from "@/lib/data-access";
import { useDashPilotStore } from "@/lib/store/app-store";
import { cn } from "@/lib/utils";

export function DashboardWorkspace() {
  const toast = useToast();
  const params = useParams<{ dashboardId?: string }>();
  const [exportOpen, setExportOpen] = useState(false);
  const [activeView, setActiveView] = useState<"dashboard" | "data">("dashboard");
  const dashboard = useDashPilotStore((state) => state.dashboard);
  const viewState = useDashPilotStore((state) => state.viewState);
  const rows = useDashPilotStore((state) => state.rows);
  const profile = useDashPilotStore((state) => state.profile);
  const activeDashboardId = useDashPilotStore((state) => state.activeDashboardId);
  const isDashboardEditing = useDashPilotStore((state) => state.isDashboardEditing);
  const dashboardEditDraft = useDashPilotStore((state) => state.dashboardEditDraft);
  const isCopilotPanelOpen = useDashPilotStore((state) => state.isCopilotPanelOpen);
  const startDashboardEditing = useDashPilotStore((state) => state.startDashboardEditing);
  const cancelDashboardEditing = useDashPilotStore((state) => state.cancelDashboardEditing);
  const commitDashboardEditing = useDashPilotStore((state) => state.commitDashboardEditing);
  const toggleCopilotPanel = useDashPilotStore((state) => state.toggleCopilotPanel);
  const hydrateDashboard = useDashPilotStore((state) => state.hydrateDashboard);
  const setPersistenceState = useDashPilotStore((state) => state.setPersistenceState);
  const dashboardId = params.dashboardId ?? activeDashboardId;
  const shareHref = `/app/dashboards/${dashboardId}/compartir`;
  const visibleDashboard = isDashboardEditing && dashboardEditDraft ? dashboardEditDraft : dashboard;
  const hasRows = rows.length > 0;

  useEffect(() => {
    if (viewState.dataExplorer?.isOpen) setActiveView("data");
  }, [viewState.dataExplorer?.isOpen]);

  useEffect(() => {
    if (!params.dashboardId || params.dashboardId === "demo" || params.dashboardId === activeDashboardId) return;
    let active = true;
    void loadPersistedDashboard(params.dashboardId).then((payload) => {
      if (!active || !payload) return;
      hydrateDashboard({ rows: payload.rows ?? [], dashboard: payload.spec, viewState: payload.viewState, profile: payload.profile });
      setPersistenceState({ activeDashboardId: params.dashboardId, persistenceStatus: "Dashboard cargado" });
    }).catch((error) => toast(error instanceof Error ? error.message : "No se pudo cargar el dashboard."));
    return () => {
      active = false;
    };
  }, [activeDashboardId, hydrateDashboard, params.dashboardId, setPersistenceState, toast]);

  async function saveDashboard() {
    try {
      const result = await updatePersistedDashboard(activeDashboardId, dashboard, viewState, rows, profile);
      const warning = "warning" in result ? result.warning : undefined;
      setPersistenceState({ activeDashboardId: result.dashboardId, persistenceMode: result.mode, persistenceStatus: warning ?? "Dashboard guardado" });
      toast(warning ?? (result.mode === "local" ? "Dashboard guardado localmente." : "Dashboard guardado correctamente."));
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo guardar el dashboard.");
    }
  }

  async function saveDashboardEdits() {
    const draft = dashboardEditDraft;
    if (!draft) return;
    try {
      const result = await updatePersistedDashboard(activeDashboardId, draft, viewState, rows, profile);
      const warning = "warning" in result ? result.warning : undefined;
      const committed = commitDashboardEditing();
      setPersistenceState({ activeDashboardId: result.dashboardId, persistenceMode: result.mode, persistenceStatus: warning ?? "Dashboard guardado" });
      toast(warning ?? (result.mode === "local" ? "Cambios guardados localmente." : "Cambios guardados correctamente."));
      if (!committed) toast("No habia cambios pendientes para confirmar.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudieron guardar los cambios.");
    }
  }

  return (
    <AppShell right={isDashboardEditing ? <DashboardEditor /> : isCopilotPanelOpen ? <CopilotPanel /> : undefined}>
      <div className="p-5 lg:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold tracking-[-0.02em]">{visibleDashboard.title}</h2>
            <p className="mt-1 text-sm font-semibold text-[#697597]">{isDashboardEditing ? "Modo edicion activo" : visibleDashboard.subtitle ?? "Dashboard generado desde DashboardSpec"}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            {isDashboardEditing ? (
              <>
                <Button onClick={saveDashboardEdits} variant="primary"><Save className="size-4" /> Guardar</Button>
                <Button onClick={cancelDashboardEditing} variant="secondary"><X className="size-4" /> Cancelar</Button>
              </>
            ) : (
              <>
                <Button onClick={startDashboardEditing} variant="secondary"><Pencil className="size-4" /> Editar dashboard</Button>
                <Button onClick={saveDashboard} variant="secondary"><Save className="size-4" /> Guardar</Button>
                {!isCopilotPanelOpen && (
                  <Button onClick={toggleCopilotPanel} variant="soft"><Sparkles className="size-4" /> Copiloto IA</Button>
                )}
              </>
            )}
            <Link href="/app/presentaciones/crear" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#3d35ff] px-5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25"><Play className="size-4" /> Presentar</Link>
            <Link href={shareHref} className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#dce3f4] bg-white px-5 text-sm font-semibold"><Users className="size-4" /> Compartir</Link>
            <div className="relative">
              <Button onClick={() => setExportOpen((value) => !value)} variant="secondary"><Download className="size-4" /> Exportar</Button>
              {exportOpen && (
                <div className="absolute right-0 top-12 z-30 w-72 rounded-xl border border-[#dfe5f0] bg-white p-2 shadow-2xl shadow-slate-900/10">
                  <Link href={shareHref} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-[#f6f7ff]"><Link2 className="size-4" /> Compartir enlace interactivo</Link>
                  <Link href="/app/presentaciones/crear" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-[#f6f7ff]"><MonitorPlay className="size-4" /> Crear presentacion interactiva</Link>
                  <button onClick={() => toast("Exportacion PDF preparada.")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-[#f6f7ff]"><FileText className="size-4" /> Exportar PDF</button>
                  <button onClick={() => toast("Exportacion PNG preparada.")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-[#f6f7ff]"><FileImage className="size-4" /> Exportar PNG</button>
                  <button onClick={() => toast("Exportacion PowerPoint preparada.")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-[#f6f7ff]"><FileText className="size-4" /> Exportar PowerPoint</button>
                </div>
              )}
            </div>
            <Link href={shareHref} className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#dce3f4] bg-white px-5 text-sm font-semibold xl:hidden"><Share2 className="size-4" /> Share</Link>
          </div>
        </div>
        {hasRows ? (
          <>
            <div className="mb-5 flex flex-wrap gap-2">
              {[
                ["dashboard", "Dashboard"],
                ["data", "Datos"]
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setActiveView(value as "dashboard" | "data")}
                  className={cn(
                    "h-10 rounded-lg border px-4 text-sm font-semibold transition",
                    activeView === value ? "border-[#7a73ff] bg-[#f0f1ff] text-[#332cff]" : "border-[#dfe5f0] bg-white text-[#536088] hover:border-[#bfc9ea]"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {activeView === "dashboard" ? (
              <div className="grid gap-5 xl:grid-cols-[220px_1fr]">
                <DashboardFilters />
                <DashboardRenderer />
              </div>
            ) : (
              <DataExplorerPanel />
            )}
            <footer className="mt-5 flex gap-8 text-xs text-[#697597]">
              <span>Fuente: {profile.fileName}</span>
              <span>Ultima actualizacion: {new Date(profile.createdAt).toLocaleDateString("es-CL")}</span>
            </footer>
          </>
        ) : (
          <section className="soft-card rounded-xl p-8 text-center">
            <h2 className="text-xl font-bold">Aún no hay dashboards</h2>
            <p className="mt-2 text-[#617094]">Sube un dataset para comenzar.</p>
            <Link href="/app" className="mt-5 inline-flex h-11 items-center rounded-lg bg-[#3d35ff] px-5 text-sm font-semibold text-white">Subir dataset</Link>
          </section>
        )}
      </div>
    </AppShell>
  );
}
