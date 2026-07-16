import { describe, expect, it } from "vitest";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { demoRows } from "@/lib/data/demo-dataset";
import { generatePresentationSpec } from "@/lib/presentation-spec/generate-presentation-spec";
import { profileDataset } from "@/lib/profiling/profile-dataset";

describe("presentation spec", () => {
  it("creates live slides from dashboard widgets", () => {
    const dashboard = generateDashboardSpec(profileDataset(demoRows), demoRows);
    const presentation = generatePresentationSpec(dashboard);

    expect(presentation.slides.length).toBeGreaterThan(4);
    expect(presentation.title).toBe(`Presentacion de ${dashboard.title}`);
    expect(presentation.slides.some((slide) => slide.widgetIds.some((widgetId) => dashboard.widgets.some((widget) => widget.id === widgetId)))).toBe(true);
  });

  it("carries query quality warnings into presentation narrative", () => {
    const profile = profileDataset([
      { fecha: "2024-01-01", ventas: "100" },
      { fecha: "2024-01-02", ventas: "sin dato" }
    ], "ventas_con_alertas.csv");
    const dashboard = generateDashboardSpec(profile, [
      { fecha: "2024-01-01", ventas: "100" },
      { fecha: "2024-01-02", ventas: "sin dato" }
    ]);
    const presentation = generatePresentationSpec(dashboard);

    expect(presentation.slides.some((slide) => slide.narrative?.includes("advertencias de cobertura numerica"))).toBe(true);
  });
});
