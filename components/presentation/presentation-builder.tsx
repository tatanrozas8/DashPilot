"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit3, GripVertical, Languages, Play, Save, Sparkles } from "lucide-react";
import { AppShell } from "@/components/shared/app-shell";
import { Button } from "@/components/shared/button";
import { DashboardRenderer } from "@/components/dashboard/dashboard-renderer";
import { useDashPilotStore } from "@/lib/store/app-store";
import { useToast } from "@/components/shared/toast";
import { persistPresentation } from "@/lib/data-access";
import { applyPresentationPrompt } from "@/lib/presentation-spec/apply-presentation-prompt";
import type { PresentationTheme } from "@/types/presentation";

export function PresentationBuilder() {
  const router = useRouter();
  const presentation = useDashPilotStore((state) => state.presentation);
  const dashboard = useDashPilotStore((state) => state.dashboard);
  const rows = useDashPilotStore((state) => state.rows);
  const generatePresentation = useDashPilotStore((state) => state.generatePresentation);
  const options = useDashPilotStore((state) => state.presentationOptions);
  const setOptions = useDashPilotStore((state) => state.setPresentationOptions);
  const activePresentationId = useDashPilotStore((state) => state.activePresentationId);
  const setPersistenceState = useDashPilotStore((state) => state.setPersistenceState);
  const toast = useToast();
  const [chat, setChat] = useState("");
  const [responses, setResponses] = useState(["Cuando tengas un dashboard, puedo ayudarte a convertirlo en una presentacion ejecutiva."]);
  const hasDashboard = rows.length > 0 && dashboard.widgets.length > 0;

  const themes: Array<[PresentationTheme, string]> = [
    ["executive", "Ejecutiva"],
    ["commercial", "Comercial"],
    ["financial", "Financiera"],
    ["operations", "Operacional"]
  ];

  async function savePresentation() {
    try {
      generatePresentation();
      const state = useDashPilotStore.getState();
      const nextPresentation = { ...state.presentation, dashboardId: state.activeDashboardId };
      const result = await persistPresentation(nextPresentation);
      setPersistenceState({
        activePresentationId: result.presentationId,
        persistenceMode: result.mode,
        persistenceStatus: result.warning ?? (result.mode === "supabase" ? "Presentacion guardada" : "Presentacion local"),
        executionMode: result.executionMode,
        syncStatus: result.syncStatus,
        lastSyncCorrelationId: result.correlationId,
        lastSyncError: result.warning
      });
      toast(result.warning ?? (result.mode === "supabase" ? "Presentacion guardada correctamente." : "Presentacion guardada localmente."));
      router.push(`/app/present/${result.presentationId}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo guardar la presentacion.");
    }
  }

  async function saveDraft() {
    try {
      generatePresentation();
      const state = useDashPilotStore.getState();
      const nextPresentation = { ...state.presentation, dashboardId: state.activeDashboardId };
      const result = await persistPresentation(nextPresentation);
      setPersistenceState({
        activePresentationId: result.presentationId,
        persistenceMode: result.mode,
        persistenceStatus: result.warning ?? (result.mode === "supabase" ? "Borrador de presentacion guardado" : "Borrador local"),
        executionMode: result.executionMode,
        syncStatus: result.syncStatus,
        lastSyncCorrelationId: result.correlationId,
        lastSyncError: result.warning
      });
      toast(result.warning ?? (result.mode === "supabase" ? "Borrador guardado correctamente." : "Borrador guardado localmente."));
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo guardar el borrador.");
    }
  }

  return (
    <AppShell>
      <div className="p-5 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-[-0.04em]">Crear presentacion interactiva</h1>
            <p className="mt-2 text-[#617094]">Convierte tu dashboard en una presentacion profesional e interactiva en minutos.</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => hasDashboard ? void saveDraft() : toast("Sube un dataset para guardar una presentacion.")} variant="secondary"><Save className="size-4" /> Guardar borrador</Button>
            <Button onClick={() => hasDashboard ? void savePresentation() : toast("Sube un dataset para comenzar.")}><Sparkles className="size-4" /> Generar presentacion</Button>
            <Link href={`/app/present/${activePresentationId}`} className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#bfc7ff] bg-white px-5 text-sm font-semibold text-[#3d35ff]"><Play className="size-4" /> Presentar ahora</Link>
          </div>
        </div>

        <div className="mt-7 grid gap-6 xl:grid-cols-[310px_1fr_330px]">
          <section className="soft-card rounded-xl p-5">
            <h2 className="font-bold">1. Configura tu presentacion</h2>
            <p className="mt-5 text-sm font-bold">Tipo de presentacion</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {themes.map(([value, label]) => (
                <button key={value} onClick={() => setOptions({ theme: value })} className={`rounded-xl border p-4 text-left ${options.theme === value ? "border-[#7a73ff] bg-[#f6f5ff]" : "border-[#e3e8f5]"}`}>
                  <p className="font-bold text-[#332cff]">{label}</p>
                  <p className="mt-2 text-xs leading-5 text-[#617094]">Vision estrategica para toma de decisiones.</p>
                </button>
              ))}
            </div>
            <p className="mt-6 text-sm font-bold">Duracion estimada</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[3, 5, 10].map((minutes) => <button key={minutes} onClick={() => setOptions({ durationMinutes: minutes as 3 | 5 | 10 })} className={`h-10 rounded-lg border text-sm font-semibold ${options.durationMinutes === minutes ? "border-[#7a73ff] bg-[#f6f5ff] text-[#332cff]" : "border-[#e3e8f5]"}`}>{minutes} minutos</button>)}
            </div>
            <p className="mt-6 text-sm font-bold">Nivel de detalle</p>
            <div className="mt-3 space-y-3">
              {[
                ["summary", "Resumen gerencial"],
                ["intermediate", "Analisis intermedio"],
                ["deep", "Analisis profundo"]
              ].map(([value, label]) => <button key={value} onClick={() => setOptions({ detailLevel: value as "summary" | "intermediate" | "deep" })} className={`w-full rounded-lg border p-4 text-left text-sm ${options.detailLevel === value ? "border-[#7a73ff] bg-[#f6f5ff] text-[#332cff]" : "border-[#e3e8f5]"}`}><strong>{label}</strong><br /><span className="text-xs text-[#617094]">Vista general de los insights clave.</span></button>)}
            </div>
            <div className="mt-6 rounded-lg border border-[#e3e8f5] p-4 text-sm">
              <p className="font-bold">Fuente de datos</p>
              <p className="mt-2 text-[#617094]">Dashboard: {hasDashboard ? dashboard.title : "Aún no hay dashboards"}</p>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#e3e8f5] p-3 text-sm">
              <Languages className="size-4 text-[#3d35ff]" /> Espanol (Latinoamerica)
            </div>
            {options.generated && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">Presentacion generada correctamente.</p>}
          </section>

          <section className="space-y-6">
            <div className="soft-card rounded-xl p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-bold">2. Esquema propuesto por IA</h2>
                <Button disabled title="La edicion granular de slides se realiza con el Copiloto de esta pantalla." variant="secondary" className="h-9 px-3"><Edit3 className="size-4" /> Editar esquema</Button>
              </div>
              <div className="divide-y divide-[#edf1fa] rounded-xl border border-[#edf1fa]">
                {(hasDashboard ? presentation.slides : []).map((slide) => (
                  <div key={slide.id} className="flex items-center gap-3 p-4">
                    <GripVertical className="size-4 text-[#9aa7c7]" />
                    <span className="grid size-8 place-items-center rounded-lg bg-[#f0f1ff] text-sm font-bold text-[#3d35ff]">{presentation.slides.indexOf(slide) + 1}</span>
                    <div>
                      <p className="font-bold">{slide.title}</p>
                      <p className="text-sm text-[#617094]">{slide.subtitle}</p>
                    </div>
                  </div>
                ))}
              </div>
              {!hasDashboard && <p className="mt-4 rounded-lg border border-[#edf1fa] p-4 text-sm text-[#617094]">Aún no hay presentaciones. Sube un dataset para comenzar.</p>}
            </div>
            <div className="soft-card rounded-xl p-5">
              <h2 className="font-bold">3. Vista previa de diapositivas</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {(hasDashboard ? presentation.slides : []).map((slide, index) => (
                  <div key={slide.id} className="rounded-xl border border-[#e3e8f5] p-4">
                    <span className="grid size-6 place-items-center rounded-full bg-[#3d35ff] text-xs font-bold text-white">{index + 1}</span>
                    <h3 className="mt-3 text-sm font-bold">{slide.title}</h3>
                    <div className="mt-3 max-h-40 overflow-hidden rounded-lg bg-[#fbfcff] p-2">
                      {slide.widgetIds.length ? <DashboardRenderer slideWidgetIds={slide.widgetIds.slice(0, 2)} /> : <div className="h-28 rounded-lg bg-gradient-to-br from-[#f0f1ff] to-white" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="soft-card rounded-xl p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold"><Sparkles className="size-6 text-[#3d35ff]" /> Copiloto IA</h2>
            <div className="mt-6 space-y-3">
              {responses.map((response) => <div key={response} className="rounded-xl bg-[#f0efff] p-4 text-sm leading-6">{response}</div>)}
            </div>
            <h3 className="mt-6 font-bold">Narrativa propuesta</h3>
            <p className="mt-3 text-sm leading-7 text-[#34405f]">
              {hasDashboard ? `Iniciaremos con un resumen ejecutivo de ${dashboard.title}, destacando los KPIs y dimensiones detectadas en el dataset.` : "Aún no hay presentaciones. Sube un dataset para comenzar."}
            </p>
            <h3 className="mt-6 font-bold">Notas del presentador</h3>
            {hasDashboard && presentation.slides.length ? (
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[#34405f]">
                {presentation.slides.slice(0, 3).map((slide) => (
                  <li key={slide.id}>{slide.speakerNotes ?? `Presentar ${slide.title} usando los widgets y filtros visibles.`}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-[#34405f]">Genera una presentacion para ver notas basadas en tus slides reales.</p>
            )}
            <form
              className="mt-6 flex gap-2 rounded-xl border border-[#dfe5f0] p-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!chat.trim()) return;
                const state = useDashPilotStore.getState();
                const result = applyPresentationPrompt(chat, state.presentation, state.dashboard);
                useDashPilotStore.setState({
                  presentation: result.presentation,
                  presentationSpec: result.presentation,
                  presentationOptions: result.options ? { ...state.presentationOptions, ...result.options, generated: true } : state.presentationOptions
                });
                setResponses((current) => [...current, result.reply]);
                setChat("");
              }}
            >
              <input className="min-w-0 flex-1 px-2 text-sm outline-none" placeholder="Pide un ajuste..." value={chat} onChange={(event) => setChat(event.target.value)} />
              <button className="rounded-lg bg-[#3d35ff] px-3 text-sm font-semibold text-white">Enviar</button>
            </form>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
