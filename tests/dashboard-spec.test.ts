import { describe, expect, it } from "vitest";
import { applyDashboardAction } from "@/lib/dashboard-spec/apply-dashboard-action";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { demoRows } from "@/lib/data/demo-dataset";
import { profileDataset } from "@/lib/profiling/profile-dataset";

describe("dashboard spec", () => {
  it("generates widgets and filters from a profile", () => {
    const profile = { ...profileDataset(demoRows), datasetVersionId: "dataset-version-test" };
    const spec = generateDashboardSpec(profile, demoRows);

    expect(spec.datasetVersionId).toBe("dataset-version-test");
    expect(spec.widgets.some((widget) => widget.type === "kpi_card")).toBe(true);
    expect(spec.widgets.some((widget) => widget.id === "sales_by_month")).toBe(true);
    expect(spec.globalFilters.map((filter) => filter.id)).toContain("region");
  });

  it("applies structured widget updates", () => {
    const profile = profileDataset(demoRows);
    const spec = generateDashboardSpec(profile, demoRows);
    const result = applyDashboardAction(spec, { filters: [] }, { type: "update_widget", widgetId: "sales_by_month", changes: { type: "bar_chart" } });

    expect(result.spec.widgets.find((widget) => widget.id === "sales_by_month")?.type).toBe("bar_chart");
  });
});
