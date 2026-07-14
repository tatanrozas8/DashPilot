import { describe, expect, it } from "vitest";
import { moveDashboardWidget, reorderDashboardWidgets, duplicateDashboardWidget, removeDashboardWidget, setDashboardWidgetHidden, updateDashboardDesign, updateDashboardSubtitle, updateDashboardTitle, updateDashboardWidget } from "@/lib/dashboard-spec/edit-dashboard-spec";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { demoRows } from "@/lib/data/demo-dataset";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { useDashPilotStore } from "@/lib/store/app-store";

describe("dashboard spec editing", () => {
  it("updates dashboard and widget fields in the spec", () => {
    const spec = generateDashboardSpec(profileDataset(demoRows), demoRows);
    const renamed = updateDashboardTitle(spec, "Dashboard editable");
    const subtitled = updateDashboardSubtitle(renamed, "Revision ejecutiva");
    const updated = updateDashboardWidget(subtitled, "sales_by_month", {
      title: "Tendencia editada",
      type: "bar_chart",
      query: { metric: { field: "Ventas", aggregation: "avg" }, groupBy: ["Region"], limit: 3 }
    });
    const widget = updated.widgets.find((item) => item.id === "sales_by_month");

    expect(updated.title).toBe("Dashboard editable");
    expect(updated.subtitle).toBe("Revision ejecutiva");
    expect(widget?.title).toBe("Tendencia editada");
    expect(widget?.type).toBe("bar_chart");
    expect(widget?.query?.metric?.aggregation).toBe("avg");
    expect(widget?.query?.groupBy).toEqual(["Region"]);
    expect(widget?.query?.limit).toBe(3);
  });

  it("updates dashboard design settings without touching widgets", () => {
    const spec = generateDashboardSpec(profileDataset(demoRows), demoRows);
    const updated = updateDashboardDesign(spec, { density: "compact", accentColor: "emerald", cardStyle: "bordered", chartPalette: "business" });

    expect(updated.design).toEqual({
      density: "compact",
      accentColor: "emerald",
      cardStyle: "bordered",
      chartPalette: "business"
    });
    expect(updated.widgets).toEqual(spec.widgets);
  });

  it("duplicates, hides and removes widgets through DashboardSpec", () => {
    const spec = generateDashboardSpec(profileDataset(demoRows), demoRows);
    const duplicated = duplicateDashboardWidget(spec, "sales_by_region");
    const copy = duplicated.widgets.find((widget) => widget.id === "sales_by_region_copy");
    const hidden = setDashboardWidgetHidden(duplicated, "sales_by_region", true);
    const removed = removeDashboardWidget(hidden, "sales_by_region");

    expect(copy?.title).toContain("copia");
    expect(copy?.config.hidden).toBe(false);
    expect(hidden.widgets.find((widget) => widget.id === "sales_by_region")?.config.hidden).toBe(true);
    expect(removed.widgets.some((widget) => widget.id === "sales_by_region")).toBe(false);
  });

  it("reorders widgets and persists packed grid positions", () => {
    const spec = generateDashboardSpec(profileDataset(demoRows), demoRows);
    const moved = moveDashboardWidget(spec, "executive_summary", "kpi_sales");
    const reordered = reorderDashboardWidgets(spec, ["sales_detail", "sales_by_month"]);

    expect(moved.widgets[0].id).toBe("executive_summary");
    expect(moved.widgets[0].position).toMatchObject({ x: 0, y: 0 });
    expect(reordered.widgets[0].id).toBe("sales_detail");
    expect(reordered.widgets[1].id).toBe("sales_by_month");
    expect(reordered.widgets.every((widget) => widget.position.x + widget.position.w <= 12)).toBe(true);
  });

  it("applies live widget menu actions through the app store", () => {
    useDashPilotStore.getState().loadDemo();

    useDashPilotStore.getState().duplicateDashboardWidget("sales_by_region");
    useDashPilotStore.getState().setDashboardWidgetHidden("sales_by_region", true);
    useDashPilotStore.getState().openWidgetDataExplorer("sales_by_region_copy");

    const state = useDashPilotStore.getState();
    expect(state.dashboard.widgets.some((widget) => widget.id === "sales_by_region_copy")).toBe(true);
    expect(state.dashboard.widgets.find((widget) => widget.id === "sales_by_region")?.config.hidden).toBe(true);
    expect(state.viewState.dataExplorer?.isOpen).toBe(true);
    expect(state.viewState.dataExplorer?.visibleColumns).toContain("Region");
  });

  it("stores reusable themes and editable data dictionary metadata", () => {
    useDashPilotStore.getState().loadDemo();
    useDashPilotStore.getState().updateDashboardDesign({ density: "compact", accentColor: "emerald" });
    const theme = useDashPilotStore.getState().saveDashboardTheme("Directorio");
    useDashPilotStore.getState().updateColumnDictionary("Ventas", {
      businessName: "Ingreso neto",
      description: "Monto final despues de descuentos",
      userSemanticType: "metric",
      synonyms: ["revenue", "ingresos"]
    });

    expect(theme?.name).toBe("Directorio");
    expect(useDashPilotStore.getState().savedThemes[0].design.accentColor).toBe("emerald");
    const column = useDashPilotStore.getState().profile.columns.find((item) => item.normalizedName === "Ventas");
    expect(column?.displayName).toBe("Ingreso neto");
    expect(column?.description).toContain("descuentos");
    expect(column?.synonyms).toContain("revenue");
  });
});
