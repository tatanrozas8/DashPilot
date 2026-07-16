import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/0004_public_share_security.sql"), "utf8");

describe("public share security migration", () => {
  it("stores token hashes, revocation metadata, scopes, snapshots and audit logs", () => {
    expect(migration).toContain("token_hash");
    expect(migration).toContain("digest(token, 'sha256')");
    expect(migration).toContain("set token = null");
    expect(migration).toContain("revoked_at");
    expect(migration).toContain("share_widget_results");
    expect(migration).toContain("public_share_access_logs");
    expect(migration).toContain("view_dashboard");
    expect(migration).toContain("use_filters");
    expect(migration).toContain("export_snapshot");
  });

  it("validates password, rate limit, resource scope and widget allowlist server-side", () => {
    expect(migration).toContain("invalid_password");
    expect(migration).toContain("too_many_failed_attempts");
    expect(migration).toContain("scope_not_allowed");
    expect(migration).toContain("filter_not_allowed");
    expect(migration).toContain("widget_config ->> 'id' = swr.widget_id");
    expect(migration).toContain("'export_snapshot' = any(link_row.scopes)");
  });

  it("does not return source dataset rows or dataset profiles from the public RPC", () => {
    const functionBody = migration.slice(migration.indexOf("create or replace function public.get_public_shared_dashboard"));

    expect(functionBody).not.toContain("dataset_rows");
    expect(functionBody).not.toContain("'rows', data_rows");
    expect(functionBody).not.toContain("'profile'");
    expect(functionBody).toContain("'widgetResults'");
    expect(functionBody).toContain("'allowedFilters'");
  });
});
