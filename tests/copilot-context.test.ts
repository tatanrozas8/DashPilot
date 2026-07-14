import { describe, expect, it } from "vitest";
import { buildCopilotContext, toProviderContext } from "@/lib/ai/context-builder";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import type { DataRow } from "@/types/dataset";

describe("copilot context", () => {
  it("summarizes large datasets by chunks instead of sending every row", () => {
    const rows: DataRow[] = Array.from({ length: 2500 }, (_, index) => ({
      Fecha: `2024-01-${String((index % 28) + 1).padStart(2, "0")}`,
      Pais: index % 2 ? "Chile" : "Peru",
      Ventas: 1000 + index,
      Costo: 500 + index / 2
    }));
    const profile = profileDataset(rows, "ventas_grandes.csv");
    const dashboard = generateDashboardSpec(profile, rows);
    const context = buildCopilotContext({
      rows,
      datasetProfile: profile,
      dashboardSpec: dashboard,
      viewState: { filters: [] }
    });
    const providerContext = toProviderContext(context);

    expect(context.dataCoverage.strategy).toBe("full_profile_plus_chunk_summaries");
    expect(context.datasetChunks.length).toBeGreaterThan(1);
    expect(context.datasetChunks.length).toBeLessThanOrEqual(8);
    expect(context.sampleRows).toHaveLength(5);
    expect(providerContext.datasetChunks[0].rowCount).toBeGreaterThan(0);
    expect(providerContext.sampleRows).toHaveLength(5);
  });
});
