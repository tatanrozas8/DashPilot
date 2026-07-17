"use client";

import Link from "next/link";
import { Calendar, FileSpreadsheet, MoreVertical, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useDashPilotStore } from "@/lib/store/app-store";

export function ProjectsPage() {
  const currentProject = useDashPilotStore((state) => state.currentProject);
  const profile = useDashPilotStore((state) => state.profile);
  const activeDatasetId = useDashPilotStore((state) => state.activeDatasetId);
  const activeDashboardId = useDashPilotStore((state) => state.activeDashboardId);
  const hasProject = Boolean(activeDatasetId && profile.rowCount > 0);

  return (
    <AppShell>
      <div className="p-5 lg:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-[-0.04em]">Proyectos</h1>
            <p className="mt-2 text-[#617094]">Gestiona tus analisis, datasets y dashboards recientes.</p>
          </div>
          <Link href="/app" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#3d35ff] px-5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25"><Sparkles className="size-4" /> Nuevo proyecto</Link>
        </div>
        <div className="mt-7 grid gap-5 lg:grid-cols-3">
          {hasProject ? (
            <article className="soft-card rounded-xl p-6">
              <div className="flex items-start justify-between">
                <FileSpreadsheet className="size-12 rounded-xl bg-[#f0f1ff] p-3 text-[#3d35ff]" />
                <details className="relative">
                  <summary className="grid size-8 cursor-pointer place-items-center rounded-md text-[#697597] hover:bg-[#f3f5ff]"><MoreVertical className="size-5" /></summary>
                  <div className="absolute right-0 top-9 z-10 w-44 rounded-xl border border-[#dfe5f0] bg-white p-2 text-sm shadow-2xl shadow-slate-900/10">
                    <Link href="/app/datasets/preview" className="block rounded-lg px-3 py-2 font-semibold hover:bg-[#f6f7ff]">Ver dataset</Link>
                    <Link href={`/app/dashboards/${activeDashboardId}`} className="block rounded-lg px-3 py-2 font-semibold hover:bg-[#f6f7ff]">Abrir dashboard</Link>
                    <Link href="/app/presentaciones/crear" className="block rounded-lg px-3 py-2 font-semibold hover:bg-[#f6f7ff]">Crear presentacion</Link>
                  </div>
                </details>
              </div>
              <h2 className="mt-5 text-xl font-bold">{currentProject.name}</h2>
              <p className="mt-2 text-sm leading-6 text-[#617094]">Proyecto creado desde {profile.fileName}. Incluye dataset perfilado y dashboard generado desde columnas reales.</p>
              <div className="mt-5 flex items-center gap-2 text-sm text-[#697597]"><Calendar className="size-4" /> {currentProject.updatedAt}</div>
              <div className="mt-6 flex gap-3">
                <Link href="/app/datasets/preview" className="rounded-lg border border-[#dce3f4] px-4 py-2 text-sm font-semibold">Ver dataset</Link>
                <Link href={`/app/dashboards/${activeDashboardId}`} className="rounded-lg bg-[#3d35ff] px-4 py-2 text-sm font-semibold text-white">Abrir dashboard</Link>
              </div>
            </article>
          ) : (
            <section className="soft-card rounded-xl p-8 lg:col-span-3">
              <h2 className="text-xl font-bold">Sin proyecto activo</h2>
              <p className="mt-2 text-[#617094]">Sube un dataset para comenzar. Aún no hay dashboards, presentaciones ni enlaces compartidos.</p>
              <Link href="/app" className="mt-5 inline-flex h-11 items-center rounded-lg bg-[#3d35ff] px-5 text-sm font-semibold text-white">Subir dataset</Link>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
