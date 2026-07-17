import { describe, expect, it } from "vitest";
import { buildPublicDashboardSnapshot, publicShareScopes } from "@/lib/share/public-snapshot";
import { createShareLink, getPublicSharedDashboard } from "@/lib/supabase/share-links";
import { createShareLinkToken } from "@/lib/supabase/persistence";
import { hashPublicSharePassword, hashPublicShareToken, isPublicShareRateLimited, isPublicShareUsable, verifyPublicSharePassword } from "@/lib/share/public-access";
import type { DataRow } from "@/types/dataset";
import type { DashboardSpec } from "@/types/dashboard";
import type { ShareLink } from "@/types/export";

describe("share links", () => {
  it("creates a high-entropy non-recoverable token input", () => {
    const token = createShareLinkToken();

    expect(token).toMatch(/^share_[a-f0-9]{48}$/);
  });

  it("hashes tokens and passwords before persistence checks", async () => {
    const token = createShareLinkToken();
    const tokenHash = await hashPublicShareToken(token);
    const passwordHash = await hashPublicSharePassword("correct-horse", "salt-1");

    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash).not.toContain(token);
    await expect(verifyPublicSharePassword({ password: "correct-horse", salt: "salt-1", expectedHash: passwordHash })).resolves.toBe(true);
    await expect(verifyPublicSharePassword({ password: "wrong", salt: "salt-1", expectedHash: passwordHash })).resolves.toBe(false);
  });

  it("keeps expiration, revocation, brute-force and download scopes explicit", () => {
    expect(isPublicShareUsable({ expiresAt: "2099-01-01T00:00:00.000Z" }, Date.parse("2026-01-01"))).toBe(true);
    expect(isPublicShareUsable({ expiresAt: "2020-01-01T00:00:00.000Z" }, Date.parse("2026-01-01"))).toBe(false);
    expect(isPublicShareUsable({ expiresAt: "2099-01-01T00:00:00.000Z", isActive: false }, Date.parse("2026-01-01"))).toBe(false);
    expect(isPublicShareRateLimited(9)).toBe(false);
    expect(isPublicShareRateLimited(10)).toBe(true);
    expect(publicShareScopes({ allowFilters: true, allowDownload: false })).toEqual(["view_dashboard", "use_filters"]);
    expect(publicShareScopes({ allowFilters: false, allowDownload: true })).toEqual(["view_dashboard", "export_snapshot"]);
  });

  it("rejects requested filters for local public links when filters are not allowed", async () => {
    const token = createShareLinkToken();
    const dashboard: DashboardSpec = {
      id: "dashboard-local-no-filters",
      title: "Local share",
      datasetId: "dataset-1",
      globalFilters: [{ id: "region-filter", field: "region", label: "Region", type: "single_select", allowedValues: [{ label: "North", value: "north" }] }],
      widgets: [{
        id: "sales-kpi",
        type: "kpi_card",
        title: "Sales",
        query: { metric: { field: "sales", aggregation: "sum" } },
        config: {},
        position: { x: 0, y: 0, w: 3, h: 2 }
      }],
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z"
    };
    const rows: DataRow[] = [
      { region: "north", sales: 100 },
      { region: "south", sales: 150 }
    ];
    const snapshot = buildPublicDashboardSnapshot({ dashboard, viewState: { filters: [] }, rows });
    const link: ShareLink = {
      id: token,
      dashboardId: dashboard.id,
      token,
      access: "public",
      allowFilters: false,
      allowDownload: false,
      scopes: ["view_dashboard"],
      createdAt: "2026-07-16T00:00:00.000Z"
    };

    await createShareLink(link, {
      snapshot,
      payload: {
        dashboard,
        viewState: { filters: [] },
        widgetResults: snapshot.widgetResults,
        allowedFilters: snapshot.allowedFilters
      }
    });

    await expect(getPublicSharedDashboard(token, undefined, [{ field: "region", operator: "in", value: ["north"] }])).resolves.toBeNull();
    await expect(getPublicSharedDashboard(token)).resolves.toMatchObject({ allowedFilters: [] });
  });
});
