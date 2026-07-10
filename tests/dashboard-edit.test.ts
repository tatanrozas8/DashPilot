import { describe, expect, it } from "vitest";
import { duplicateDashboardWidget, removeDashboardWidget, setDashboardWidgetHidden, updateDashboardSubtitle, updateDashboardTitle, updateDashboardWidget } from "@/lib/dashboard-spec/edit-dashboard-spec";
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
});
