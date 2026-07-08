"use client";

import Link from "next/link";
import { Calendar, FileSpreadsheet, MoreVertical, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/shared/button";
import { useToast } from "@/components/shared/toast";

export function ProjectsPage() {
  const toast = useToast();

  return (
    <AppShell>
      <div className="p-5 lg:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-[-0.04em]">Proyectos</h1>
            <p className="mt-2 text-[#617094]">Gestiona tus analisis, datasets y dashboards recientes.</p>
          </div>
          <Button onClick={() => toast("Nuevo proyecto preparado.")}><Sparkles className="size-4" /> Nuevo proyecto</Button>
        </div>
        <div className="mt-7 grid gap-5 lg:grid-cols-3">
          <article className="soft-card rounded-xl p-6">
            <div className="flex items-start justify-between">
              <FileSpreadsheet className="size-12 rounded-xl bg-[#f0f1ff] p-3 text-[#3d35ff]" />
              <button onClick={() => toast("Menu de proyecto abierto.")} className="text-[#697597]"><MoreVertical className="size-5" /></button>
            </div>
            <h2 className="mt-5 text-xl font-bold">Analisis Comercial Q2 2024</h2>
            <p className="mt-2 text-sm leading-6 text-[#617094]">Dashboard ejecutivo con ventas, margen, region, vendedores y presentacion interactiva.</p>
            <div className="mt-5 flex items-center gap-2 text-sm text-[#697597]"><Calendar className="size-4" /> Actualizado hace 5 min</div>
            <div className="mt-6 flex gap-3">
              <Link href="/app/datasets/preview" className="rounded-lg border border-[#dce3f4] px-4 py-2 text-sm font-semibold">Ver dataset</Link>
              <Link href="/app/dashboards/demo" className="rounded-lg bg-[#3d35ff] px-4 py-2 text-sm font-semibold text-white">Abrir dashboard</Link>
            </div>
          </article>
        </div>
      </div>
    </AppShell>
  );
}
