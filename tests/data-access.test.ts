import { describe, expect, it, vi } from "vitest";
import { persistDashboard, persistShareLink } from "@/lib/data-access";
import { chunkRows } from "@/lib/supabase/datasets";
import { isShareLinkValid } from "@/lib/supabase/share-links";
import type { DashboardSpec } from "@/types/dashboard";

describe("data access", () => {
  it("chunks dataset rows for batch inserts", () => {
    const rows = Array.from({ length: 1201 }, (_, index) => ({ id: index }));
    const batches = chunkRows(rows, 500);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(500);
    expect(batches[2]).toHaveLength(201);
  });

  it("validates share expiration", () => {
    expect(isShareLinkValid({ expiresAt: "2099-01-01" })).toBe(true);
    expect(isShareLinkValid({ expiresAt: "2000-01-01" })).toBe(false);
    expect(isShareLinkValid({ expiresAt: "2099-01-01", isActive: false })).toBe(false);
  });

  it("falls back to local dashboard persistence without Supabase", async () => {
    const spec: DashboardSpec = {
      id: "dashboard_test",
      title: "Test",
      datasetId: "dataset_test",
      globalFilters: [],
      widgets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const result = await persistDashboard({ spec, viewState: { filters: [] }, rows: [], profile: undefined });

    expect(result.mode).toBe("local");
    expect(window.localStorage.getItem("dashpilot:dashboard:dashboard_test")).toBeTruthy();
  });

  it("creates a local share url without Supabase", async () => {
    vi.stubGlobal("crypto", crypto);
    const result = await persistShareLink({
      dashboardId: "dashboard_test",
      access: "public",
      expiresAt: "2099-01-01",
      allowFilters: true,
      allowDownload: false,
      origin: "http://localhost:3000"
    });

    expect(result.mode).toBe("local");
    expect(result.url).toContain("/share/share_");
  });
});
