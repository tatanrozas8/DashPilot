"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell } from "@/components/shared/app-shell";
import { persistDashboard } from "@/lib/data-access";
import { capability } from "@/lib/product/capabilities";
import { useDashPilotStore } from "@/lib/store/app-store";

const generationSteps = [
  "Dataset disponible",
  "Perfil y reglas deterministicas aplicadas",
  "DashboardSpec generado",
  "Persistencia verificada"
];

export function GenerationPage() {
  const router = useRouter();
  const generateDashboard = useDashPilotStore((state) => state.generateDashboard);
  const setPersistenceState = useDashPilotStore((state) => state.setPersistenceState);
  const activeDashboardId = useDashPilotStore((state) => state.activeDashboardId);
  const rows = useDashPilotStore((state) => state.rows);
  const [completedStep, setCompletedStep] = useState(0);
  const [status, setStatus] = useState("Generando dashboard...");
  const dashboardGeneration = capability("dashboard.generate");

  useEffect(() => {
    let active = true;

    async function runGeneration() {
      if (!useDashPilotStore.getState().rows.length) {
        setStatus("Sube un dataset para comenzar.");
        return;
      }
      setCompletedStep(1);
      setStatus("Aplicando reglas deterministicas al perfil del dataset...");
      const dashboard = generateDashboard();
      if (!active) return;
      setCompletedStep(3);
      const state = useDashPilotStore.getState();
      setStatus("Guardando dashboard...");
      const result = await persistDashboard(
        {
          spec: dashboard,
          viewState: state.viewState,
          datasetId: state.activeDatasetId || dashboard.datasetId,
          datasetVersionId: state.activeDatasetVersionId || dashboard.datasetVersionId,
          rows: state.rows,
          profile: state.profile
        },
        state.activeProjectId
      );
      if (!active) return;
      setCompletedStep(4);
      setPersistenceState({
        activeDashboardId: result.dashboardId,
        persistenceMode: result.mode,
        persistenceStatus: result.warning ?? (result.mode === "supabase" ? "Dashboard guardado" : "Dashboard guardado localmente"),
        executionMode: result.executionMode,
        syncStatus: result.syncStatus,
        lastSyncCorrelationId: result.correlationId,
        lastSyncError: result.warning
      });
      setStatus(result.warning ?? (result.mode === "supabase" ? "Dashboard guardado en Supabase." : "Dashboard guardado en modo local."));
      window.setTimeout(() => router.push(`/app/dashboards/${result.dashboardId}`), 700);
    }

    void runGeneration().catch((error) => {
      if (!active) return;
      setStatus(error instanceof Error ? error.message : "No se pudo generar el dashboard.");
    });
    return () => {
      active = false;
    };
  }, [generateDashboard, router, setPersistenceState]);

  const progress = Math.round((completedStep / generationSteps.length) * 100);

  return (
    <AppShell>
      <div className="p-5 lg:p-8">
        <div className="flex justify-end gap-3">
          <Link href="/app/datasets/preview" className="inline-flex h-11 items-center rounded-lg border border-[#dce3f4] bg-white px-5 text-sm font-semibold">Cancelar generacion</Link>
          <Link href={activeDashboardId ? `/app/dashboards/${activeDashboardId}` : "/app/proyectos"} className="inline-flex h-11 items-center rounded-lg bg-[#3d35ff] px-5 text-sm font-semibold text-white">Ver mis dashboards</Link>
        </div>
        {!rows.length && (
          <section className="mt-6 rounded-2xl border border-[#e3e8f5] bg-white p-8 text-center">
            <h1 className="text-3xl font-black tracking-[-0.04em]">Sin proyecto activo</h1>
            <p className="mt-3 text-[#617094]">Sube un dataset para comenzar.</p>
            <Link href="/app" className="mt-6 inline-flex h-11 items-center rounded-lg bg-[#3d35ff] px-5 text-sm font-semibold text-white">Subir dataset</Link>
          </section>
        )}
        {rows.length > 0 && <section className="mt-6 rounded-2xl border border-[#e3e8f5] bg-white p-8 text-center">
          <Sparkles className="mx-auto size-9 text-[#3d35ff]" />
          <h1 className="mt-4 text-3xl font-black tracking-[-0.04em]">Generando tu dashboard</h1>
          <p className="mt-3 text-[#617094]">DashPilot esta aplicando analisis deterministico sobre columnas reales para construir un DashboardSpec.</p>
          <p className="mx-auto mt-3 max-w-2xl rounded-lg bg-[#f6f7ff] px-4 py-3 text-sm font-semibold text-[#536088]">
            Capacidad: {dashboardGeneration.label}. Estado: {dashboardGeneration.status === "real" ? "implementada" : dashboardGeneration.status}.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {generationSteps.map((step, index) => (
              <div key={step} className="text-center">
                <div className={`mx-auto grid size-12 place-items-center rounded-full border ${completedStep >= index + 1 ? "bg-[#3d35ff] text-white" : completedStep === index ? "border-[#9f9aff] bg-[#f2f1ff] text-[#3d35ff]" : "border-[#dfe5f0] text-[#7a85a6]"}`}>
                  {completedStep >= index + 1 ? <Check className="size-5" /> : index + 1}
                </div>
                <p className={`mt-3 text-sm font-bold ${completedStep === index ? "text-[#3d35ff]" : ""}`}>{step}</p>
                <p className="mt-1 text-xs text-[#7a85a6]">{completedStep >= index + 1 ? "Completado" : completedStep === index ? "En progreso..." : "Pendiente"}</p>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-10 h-2 max-w-[780px] rounded-full bg-[#e9e8ff]">
            <div className="h-full rounded-full bg-[#3d35ff] transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-3 text-sm text-[#7a85a6]">Etapa {completedStep} de {generationSteps.length} - {status}</p>

          <div className="mt-10 grid gap-5 text-left lg:grid-cols-[0.9fr_1.6fr]">
            <div className="soft-card rounded-xl p-6">
              <h2 className="font-bold">Lo que estamos encontrando</h2>
              {["Columnas normalizadas desde el archivo", "Metricas y dimensiones inferidas", "Widgets construidos desde reglas deterministicas", "Persistencia confirmada o degradada con estado visible"].map((item, index) => (
                <p key={item} className="mt-4 flex items-center gap-3 rounded-lg p-3 text-sm text-[#34405f] last:bg-[#f0efff]">
                  <Check className={`size-5 ${completedStep > index ? "text-emerald-600" : "text-[#3d35ff]"}`} /> {item}
                </p>
              ))}
            </div>
            <div className="soft-card rounded-xl p-6">
              <h2 className="font-bold">Vista previa en construccion</h2>
              <div className="mt-5 grid grid-cols-4 gap-4">
                {["Ventas Totales", "Margen Bruto", "Tickets", "Crecimiento"].map((item) => <div key={item} className="h-28 rounded-xl border border-[#edf1fa] bg-[#fbfcff] p-4 text-sm text-[#697597]">{item}<div className="mt-8 h-6 rounded-full bg-[#e3e7f8]" /></div>)}
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="h-44 rounded-xl border border-[#edf1fa] bg-[#fbfcff]" />
                <div className="h-44 rounded-xl border border-[#edf1fa] bg-[#fbfcff]" />
              </div>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-4 rounded-xl border border-[#cfd5ff] bg-[#fbfbff] p-5 text-left">
            <ShieldCheck className="size-10 text-[#3d35ff]" />
            <div>
              <h3 className="font-bold text-[#3d35ff]">Tu informacion esta segura con DashPilot</h3>
              <p className="mt-1 text-sm text-[#617094]">Verificaremos la calidad de los datos y entregaremos un analisis confiable y accionable.</p>
            </div>
          </div>
        </section>}
      </div>
    </AppShell>
  );
}
