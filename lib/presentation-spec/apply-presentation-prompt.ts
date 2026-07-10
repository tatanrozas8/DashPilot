import type { DashboardSpec } from "@/types/dashboard";
import type { PresentationSpec, PresentationTheme } from "@/types/presentation";

export interface PresentationPromptResult {
  presentation: PresentationSpec;
  options?: {
    theme?: PresentationTheme;
    durationMinutes?: 3 | 5 | 10;
    detailLevel?: "summary" | "intermediate" | "deep";
  };
  reply: string;
}

function touch(presentation: PresentationSpec): PresentationSpec {
  return { ...presentation, updatedAt: new Date().toISOString() };
}

function nextSlideId(presentation: PresentationSpec, prefix: string) {
  const ids = new Set(presentation.slides.map((slide) => slide.id));
  let index = 1;
  let id = prefix;
  while (ids.has(id)) {
    index += 1;
    id = `${prefix}_${index}`;
  }
  return id;
}

function widgetsByText(dashboard: DashboardSpec, words: string[]) {
  const normalized = words.map((word) => word.toLowerCase());
  return dashboard.widgets
    .filter((widget) => normalized.some((word) => `${widget.title} ${widget.query?.groupBy?.join(" ") ?? ""}`.toLowerCase().includes(word)))
    .map((widget) => widget.id);
}

export function applyPresentationPrompt(prompt: string, presentation: PresentationSpec, dashboard: DashboardSpec): PresentationPromptResult {
  const text = prompt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  if (text.includes("5 minutos") || text.includes("cinco minutos") || text.includes("reduce")) {
    return {
      presentation: touch({
        ...presentation,
        slides: presentation.slides.slice(0, Math.min(5, presentation.slides.length)).map((slide) => ({ ...slide, narrative: slide.narrative ?? "Mantener foco ejecutivo y avanzar rapido." }))
      }),
      options: { durationMinutes: 5, detailLevel: "summary" },
      reply: "Reduje la presentacion a un flujo de 5 minutos con foco en las slides principales."
    };
  }

  if (text.includes("notas")) {
    return {
      presentation: touch({
        ...presentation,
        slides: presentation.slides.map((slide) => ({
          ...slide,
          speakerNotes: slide.speakerNotes ?? `Presentar ${slide.title} conectando el insight con una decision concreta.`
        }))
      }),
      reply: "Genere notas del presentador para las slides que no tenian guia."
    };
  }

  if (text.includes("riesgo")) {
    const slide = {
      id: nextSlideId(presentation, "risks"),
      title: "Riesgos y mitigaciones",
      subtitle: "Puntos a monitorear antes de ejecutar el plan",
      narrative: "Priorizar riesgos de concentracion, calidad de datos y variaciones de costo antes de tomar decisiones.",
      speakerNotes: "Cerrar con acciones concretas y responsables por cada riesgo.",
      layout: "insights" as const,
      widgetIds: widgetsByText(dashboard, ["margen", "costo", "descuento", "calidad"]).slice(0, 2)
    };
    return { presentation: touch({ ...presentation, slides: [...presentation.slides, slide] }), reply: "Agregue una slide de riesgos basada en los widgets disponibles." };
  }

  if (text.includes("region") || text.includes("regiones") || text.includes("pais") || text.includes("zona")) {
    const slide = {
      id: nextSlideId(presentation, "regions"),
      title: "Analisis regional",
      subtitle: "Desempeno por territorio",
      narrative: "Comparar territorios permite identificar oportunidades y brechas de ejecucion.",
      speakerNotes: "Usar filtros en vivo si la audiencia pide detalle por territorio.",
      layout: "chart_focus" as const,
      widgetIds: widgetsByText(dashboard, ["region", "pais", "zona", "ciudad"]).slice(0, 2)
    };
    return { presentation: touch({ ...presentation, slides: [...presentation.slides, slide] }), reply: "Agregue una slide enfocada en regiones usando widgets compatibles." };
  }

  if (text.includes("orden")) {
    const priority = ["cover", "overview", "commercial-summary", "region", "sellers", "detail"];
    const ordered = [...presentation.slides].sort((left, right) => {
      const leftIndex = priority.indexOf(left.id);
      const rightIndex = priority.indexOf(right.id);
      return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
    });
    return { presentation: touch({ ...presentation, slides: ordered }), reply: "Reordene las slides para abrir con contexto, KPIs, drivers y detalle." };
  }

  if (text.includes("oportunidad") || text.includes("oportunidades")) {
    return {
      presentation: touch({
        ...presentation,
        slides: presentation.slides.map((slide) => ({
          ...slide,
          narrative: slide.narrative ? `${slide.narrative} Enfatizar oportunidades accionables.` : "Enfatizar oportunidades accionables."
        }))
      }),
      reply: "Enfoque la narrativa en oportunidades y acciones recomendadas."
    };
  }

  if (text.includes("ejecutiva") || text.includes("ejecutivo")) {
    return {
      presentation: touch({
        ...presentation,
        theme: "executive",
        title: presentation.title.replace(/^Presentacion de /, "Presentacion ejecutiva de "),
        slides: presentation.slides.map((slide) => ({
          ...slide,
          narrative: slide.narrative ?? "Sintetizar el mensaje para decision ejecutiva."
        }))
      }),
      options: { theme: "executive", detailLevel: "summary" },
      reply: "Ajuste la presentacion a tono ejecutivo y resumen gerencial."
    };
  }

  return {
    presentation,
    reply: "Puedo ajustar la presentacion con prompts como: hazla mas ejecutiva, reduce a 5 minutos, agrega slide de riesgos, agrega slide de regiones o genera notas del presentador."
  };
}
