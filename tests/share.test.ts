import { describe, expect, it } from "vitest";
import { createShareLinkToken } from "@/lib/supabase/persistence";
import { hashPublicSharePassword, hashPublicShareToken, isPublicShareRateLimited, isPublicShareUsable, verifyPublicSharePassword } from "@/lib/share/public-access";
import { publicShareScopes } from "@/lib/share/public-snapshot";

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
});
