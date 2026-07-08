"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Download, FileImage, FileText, Link2, MonitorPlay, Play, Save, Share2, Users } from "lucide-react";
import { CopilotPanel, DashboardFilters, DashboardRenderer } from "@/components/dashboard/dashboard-renderer";
import { AppShell } from "@/components/shared/app-shell";
import { Button } from "@/components/shared/button";
import { useToast } from "@/components/shared/toast";
import { loadPersistedDashboard, updatePersistedDashboard } from "@/lib/data-access";
import { useDashPilotStore } from "@/lib/store/app-store";

export function DashboardWorkspace() {
  const toast = useToast();
  const params = useParams<{ dashboardId?: string }>();
  const [exportOpen, setExportOpen] = useState(false);
  const dashboard = useDashPilotStore((state) => state.dashboard);
  const viewState = useDashPilotStore((state) => state.viewState);
  const rows = useDashPilotStore((state) => state.rows);
  const profile = useDashPilotStore((state) => state.profile);
  const activeDashboardId = useDashPilotStore((state) => state.activeDashboardId);
  const hydrateDashboard = useDashPilotStore((state) => state.hydrateDashboard);
  const setPersistenceState = useDashPilotStore((state) => state.setPersistenceState);
  const dashboardId = params.dashboardId ?? activeDashboardId;
  const shareHref = `/app/dashboards/${dashboardId}/compartir`;

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

  return (
    <AppShell right={<CopilotPanel />}>
      <div className="p-5 lg:p-8">
        <div className="mb-5 flex flex-wrap justify-end gap-3">
          <Button onClick={saveDashboard} variant="secondary"><Save className="size-4" /> Guardar</Button>
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
        <div className="grid gap-5 xl:grid-cols-[220px_1fr]">
          <DashboardFilters />
          <DashboardRenderer />
        </div>
        <footer className="mt-5 flex gap-8 text-xs text-[#697597]">
          <span>Fuente: Ventas_Q2_2024.xlsx</span>
          <span>Ultima actualizacion: 10 jun 2024, 10:30 a.m.</span>
        </footer>
      </div>
    </AppShell>
  );
}
