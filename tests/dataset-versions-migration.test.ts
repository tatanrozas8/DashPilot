import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/0003_dataset_versions_lifecycle.sql"), "utf8");

describe("dataset versions migration", () => {
  it("creates version-owned artifacts, RLS and activation concurrency controls", () => {
    expect(migration).toContain("create table if not exists public.dataset_versions");
    expect(migration).toContain("status text not null default 'created' check");
    expect(migration).toContain("alter table public.dataset_versions enable row level security");
    expect(migration).toContain("create policy \"Users can manage dataset versions\"");
    expect(migration).toContain("dataset_rows_version_required");
    expect(migration).toContain("dataset_columns_version_required");
    expect(migration).toContain("dataset_sheets_version_required");
    expect(migration).toContain("public.prevent_dataset_version_content_update");
    expect(migration).toContain("expected_active_version_id uuid");
    expect(migration).toContain("active_version_id is not distinct from expected_active_version_id");
  });

  it("backfills existing data and resolves public shares through dashboard dataset versions", () => {
    expect(migration).toContain("insert into public.dataset_versions");
    expect(migration).toContain("'legacy-' || d.id::text");
    expect(migration).toContain("update public.dashboard_specs ds");
    expect(migration).toContain("dataset_version_id = d.active_version_id");
    expect(migration).toContain("resolved_version_id := coalesce(dashboard_row.dataset_version_id, dataset_row.active_version_id)");
    expect(migration).toContain("where dataset_version_id = resolved_version_id");
  });
});
