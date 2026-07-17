import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicDashboardSnapshot, PublicSharePayload } from "@/lib/share/public-snapshot";
import type { ShareLink } from "@/types/export";

const supabaseMocks = vi.hoisted(() => {
  const revokeEq = vi.fn((_field: string, _value: string) => Promise.resolve({ error: null }));
  const shareLinkUpdate = vi.fn((_payload: { is_active: boolean; revoked_at: string }) => ({ eq: revokeEq }));
  const shareLinkInsert = vi.fn((_payload: unknown) => ({
    select: vi.fn((_columns: string) => ({
      single: vi.fn(() => Promise.resolve({ data: { id: "share-link-1" }, error: null }))
    }))
  }));
  const filterSnapshotInsert = vi.fn((_payload: unknown) => Promise.resolve({ error: null }));
  const widgetResultInsert = vi.fn((_payload: unknown) => Promise.resolve({ error: { message: "snapshot insert failed" } }));
  return {
    revokeEq,
    shareLinkUpdate,
    shareLinkInsert,
    filterSnapshotInsert,
    widgetResultInsert,
    from: vi.fn((table: string) => {
      if (table === "share_links") {
        return { insert: shareLinkInsert, update: shareLinkUpdate };
      }
      if (table === "share_filter_snapshots") {
        return { insert: filterSnapshotInsert };
      }
      return { insert: widgetResultInsert };
    })
  };
});

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ from: supabaseMocks.from })
}));

vi.mock("@/lib/supabase/auth", () => ({
  getCurrentAuthState: () => Promise.resolve({ configured: true, session: {}, user: { id: "user-1" } })
}));

function shareLink(): ShareLink {
  return {
    id: "share_token",
    dashboardId: "dashboard-1",
    token: "share_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    access: "public",
    allowFilters: false,
    allowDownload: false,
    scopes: ["view_dashboard"],
    createdAt: "2026-07-16T00:00:00.000Z"
  };
}

function publicPayload(): { snapshot: PublicDashboardSnapshot; payload: PublicSharePayload } {
  const dashboard = {
    id: "dashboard-1",
    title: "Dashboard",
    datasetId: "dataset-1",
    globalFilters: [],
    widgets: [],
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z"
  };
  const snapshot = {
    revisionId: "dashboard-1:dataset-1:2026-07-16T00:00:00.000Z",
    widgetResults: [{ widgetId: "widget-1", revisionId: "rev-1", rows: [{ label: "Total", value: 10 }] }],
    allowedFilters: [],
    filterSnapshots: [{ filterKey: "base", filters: [], revisionId: "rev-1", widgetResults: [{ widgetId: "widget-1", revisionId: "rev-1", rows: [{ label: "Total", value: 10 }] }] }]
  };
  return {
    snapshot,
    payload: {
      dashboard,
      viewState: { filters: [] },
      widgetResults: snapshot.widgetResults,
      allowedFilters: []
    }
  };
}

describe("share link persistence", () => {
  beforeEach(() => {
    supabaseMocks.revokeEq.mockClear();
    supabaseMocks.shareLinkUpdate.mockClear();
    supabaseMocks.shareLinkInsert.mockClear();
    supabaseMocks.filterSnapshotInsert.mockClear();
    supabaseMocks.widgetResultInsert.mockClear();
    supabaseMocks.from.mockClear();
  });

  it("revokes a share link when persisted widget snapshot insertion fails", async () => {
    const { createShareLink } = await import("@/lib/supabase/share-links");
    const { snapshot, payload } = publicPayload();

    await expect(createShareLink(shareLink(), { snapshot, payload })).rejects.toThrow("No se pudo guardar el snapshot publico");

    expect(supabaseMocks.shareLinkInsert).toHaveBeenCalledOnce();
    expect(supabaseMocks.filterSnapshotInsert).toHaveBeenCalledOnce();
    expect(supabaseMocks.widgetResultInsert).toHaveBeenCalledOnce();
    expect(supabaseMocks.shareLinkUpdate).toHaveBeenCalledWith(expect.objectContaining({ is_active: false, revoked_at: expect.any(String) }));
    expect(supabaseMocks.revokeEq).toHaveBeenCalledWith("id", "share-link-1");
  });
});
