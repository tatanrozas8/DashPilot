"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Expand, Filter, LogOut, Play } from "lucide-react";
import { DashboardFilters, DashboardRenderer } from "@/components/dashboard/dashboard-renderer";
import { Logo } from "@/components/shared/logo";
import { useDashPilotStore } from "@/lib/store/app-store";

export function PresentationMode() {
  const presentation = useDashPilotStore((state) => state.presentation);
  const activeDashboardId = useDashPilotStore((state) => state.activeDashboardId);
  const [index, setIndex] = useState(2);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const slide = presentation.slides[index] ?? presentation.slides[0];
  const thumbnails = useMemo(() => presentation.slides, [presentation.slides]);
  const goNext = () => setIndex((value) => Math.min(presentation.slides.length - 1, value + 1));
  const goPrevious = () => setIndex((value) => Math.max(0, value - 1));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrevious();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function enterFullscreen() {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  }

  if (!slide) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-white px-6 text-[#071334]">
        <section className="max-w-md rounded-2xl border border-[#e3e8f5] bg-white p-8 text-center shadow-xl shadow-slate-900/5">
          <Logo className="justify-center" />
          <h1 className="mt-6 text-2xl font-black tracking-[-0.04em]">Aún no hay presentaciones</h1>
          <p className="mt-3 text-[#617094]">Sube un dataset para comenzar.</p>
          <Link href="/app" className="mt-6 inline-flex h-11 items-center rounded-lg bg-[#3d35ff] px-5 text-sm font-semibold text-white">Subir dataset</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-white text-[#071334]">
      <header className="flex h-[74px] items-center justify-between border-b border-[#e3e8f5] px-8">
        <div className="flex items-center gap-8"><Logo /><p className="font-semibold">Presentacion: <span className="text-[#3d35ff]">{presentation.title}</span></p></div>
        <div className="flex items-center gap-5 text-sm font-semibold">
          <button onClick={goPrevious} className="grid size-10 place-items-center rounded-full border border-[#e3e8f5]"><ChevronLeft className="size-5" /></button>
          <span>{index + 1} / {presentation.slides.length}</span>
          <button onClick={goNext} className="grid size-10 place-items-center rounded-full border border-[#e3e8f5]"><ChevronRight className="size-5" /></button>
          <span className="flex items-center gap-2 rounded-full border border-[#e3e8f5] px-4 py-2"><Play className="size-4 text-[#3d35ff]" /> 00:05:24</span>
          <button onClick={() => setFiltersOpen((value) => !value)} className="hidden gap-2 lg:flex"><Filter className="size-5" /> Filtros</button>
          <button onClick={enterFullscreen} className="hidden gap-2 lg:flex"><Expand className="size-5" /> Pantalla completa</button>
          <Link href={activeDashboardId ? `/app/dashboards/${activeDashboardId}` : "/app/proyectos"} className="flex items-center gap-2"><LogOut className="size-5" /> Salir</Link>
        </div>
      </header>

      <main className={`grid min-h-[calc(100dvh-74px)] ${filtersOpen ? "grid-cols-[1fr_300px]" : "grid-cols-1"}`}>
        <section className="p-10 pb-36">
          <div className="mb-7 border-l-4 border-[#3d35ff] pl-5">
            <h1 className="text-5xl font-black tracking-[-0.06em]">{slide.title}</h1>
            <p className="mt-2 text-lg text-[#617094]">{slide.subtitle}</p>
          </div>
          {slide.widgetIds.length ? <DashboardRenderer slideWidgetIds={slide.widgetIds} /> : (
            <div className="grid min-h-[520px] place-items-center rounded-2xl bg-gradient-to-br from-[#f1f3ff] to-white">
              <div className="text-center">
                <Logo className="justify-center" />
                <h2 className="mt-10 text-4xl font-black">De Excel a decisiones en minutos</h2>
              </div>
            </div>
          )}
          {slide.narrative && (
            <div className="mt-5 rounded-xl border border-[#cfd5ff] bg-[#fbfbff] p-6">
              <h2 className="font-bold">Resumen Ejecutivo</h2>
              <p className="mt-3 leading-7 text-[#34405f]">{slide.narrative}</p>
            </div>
          )}
        </section>
        {filtersOpen && (
          <aside className="border-l border-[#e3e8f5] bg-white p-5">
            <DashboardFilters />
          </aside>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t border-[#e3e8f5] bg-white p-5">
        <div className="mx-auto flex max-w-[1440px] items-center gap-6">
          <button onClick={goPrevious} className="h-20 rounded-xl border border-[#e3e8f5] px-6 font-bold">Anterior</button>
          <div className="flex min-w-0 flex-1 gap-5 overflow-x-auto">
            {thumbnails.map((thumb, thumbIndex) => (
              <button key={thumb.id} onClick={() => setIndex(thumbIndex)} className={`w-44 shrink-0 rounded-xl border p-3 text-left text-xs ${thumbIndex === index ? "border-[#3d35ff] text-[#3d35ff]" : "border-[#e3e8f5]"}`}>
                <div className="mb-2 h-12 rounded bg-[#f3f5ff]" />
                {thumbIndex + 1}. {thumb.title}
              </button>
            ))}
          </div>
          <button onClick={goNext} className="h-20 rounded-xl border border-[#e3e8f5] px-6 font-bold">Siguiente</button>
        </div>
      </div>
    </div>
  );
}
