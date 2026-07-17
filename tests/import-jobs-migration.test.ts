import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("resumable import jobs migration", () => {
  const sql = readFileSync(resolve("supabase/migrations/0006_resumable_import_jobs.sql"), "utf8");

  it("adds worker recovery, scanning and artifact columns", () => {
    expect(sql).toContain("heartbeat_at");
    expect(sql).toContain("dead_letter_at");
    expect(sql).toContain("scanner_provider");
    expect(sql).toContain("scan_status");
    expect(sql).toContain("columnar_storage_path");
    expect(sql).toContain("active_artifact_path");
    expect(sql).toContain("retention_policy");
  });

  it("constrains recoverable job states and keeps owner RLS", () => {
    expect(sql).toContain("import_jobs_status_check");
    expect(sql).toContain("'dead_letter'");
    expect(sql).toContain("import_jobs_queue_idx");
    expect(sql).toContain("auth.uid() = user_id");
  });
});
