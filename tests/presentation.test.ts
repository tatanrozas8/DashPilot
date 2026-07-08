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
    expect(presentation.slides.some((slide) => slide.widgetIds.includes("sales_by_region"))).toBe(true);
  });
});
