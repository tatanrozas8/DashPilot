import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvFile } from "@/lib/files/parse-csv";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { executeDashboardQuery } from "@/lib/query-engine/execute-dashboard-query";

describe("real CSV pipeline QA", () => {
  it("parses, profiles, generates dashboard widgets and runs a query", async () => {
    const fixture = readFileSync(resolve("tests/fixtures/ventas_real_test.csv"));
    const file = new File([fixture], "ventas_real_test.csv", { type: "text/csv" });
    const parsed = await parseCsvFile(file);
    const sheet = parsed.sheets[0]!;
    const profile = profileDataset(sheet.rows, parsed.fileName, sheet.columns);
    const dashboard = generateDashboardSpec(profile, sheet.rows);
    const regionWidget = dashboard.widgets.find((widget) => widget.id === "sales_by_region");
    const queryResult = executeDashboardQuery(sheet.rows, regionWidget?.query);

    expect(profile.detectedMetricColumns).toContain("ventas");
    expect(profile.detectedDateColumns).toContain("fecha");
    expect(dashboard.widgets.length).toBeGreaterThan(4);
    expect(queryResult.length).toBeGreaterThan(1);
    expect(queryResult.every((row) => typeof row.value === "number" && row.result?.state === "ok")).toBe(true);
  });
});
