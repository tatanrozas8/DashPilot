import { describe, expect, it } from "vitest";
import {
  activateDatasetVersion,
  buildDatasetImportIdentity,
  cancelDatasetVersion,
  createDatasetVersionDraft,
  findIdempotentDatasetVersion,
  transitionDatasetVersion
} from "@/lib/datasets/versioning";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import type { DataRow, DatasetProfile, FileParseResult, ParsedSheet } from "@/types/dataset";

const rows: DataRow[] = [
  { region: "Norte", ventas: 100 },
  { region: "Sur", ventas: 200 }
];

const sheet: ParsedSheet = {
  name: "CSV",
  rowCount: 2,
  columnCount: 2,
  isSelected: true,
  columns: [
    { id: "region", rawHeader: "Region", originalName: "Region", canonicalName: "region", normalizedName: "region", displayName: "Region", position: 0 },
    { id: "ventas", rawHeader: "Ventas", originalName: "Ventas", canonicalName: "ventas", normalizedName: "ventas", displayName: "Ventas", position: 1 }
  ],
  rows,
  previewRows: rows
};

const parsed: FileParseResult = {
  fileName: "ventas.csv",
  fileType: "csv",
  fileSize: 42,
  selectedSheetName: "CSV",
  sheets: [sheet],
  warnings: []
};

const profile: DatasetProfile = {
  id: "dataset-1",
  fileName: "ventas.csv",
  rowCount: 2,
  columnCount: 2,
  columns: [
    {
      originalName: "Region",
      normalizedName: "region",
      displayName: "Region",
      inferredType: "geography",
      semanticType: "geo",
      nullCount: 0,
      nullPercentage: 0,
      uniqueCount: 2,
      sampleValues: ["Norte", "Sur"]
    },
    {
      originalName: "Ventas",
      normalizedName: "ventas",
      displayName: "Ventas",
      inferredType: "number",
      semanticType: "metric",
      nullCount: 0,
      nullPercentage: 0,
      uniqueCount: 2,
      sampleValues: [100, 200],
      min: 100,
      max: 200
    }
  ],
  detectedDateColumns: [],
  detectedMetricColumns: ["ventas"],
  detectedDimensionColumns: ["region"],
  detectedGeoColumns: ["region"],
  qualityWarnings: [],
  qualityScore: 100,
  createdAt: "2026-07-16T00:00:00.000Z"
};

async function readyVersion(id: string, versionNumber: number) {
  const identity = await buildDatasetImportIdentity({ parsed, selectedSheet: sheet, rows, profile });
  return transitionDatasetVersion(
    transitionDatasetVersion(
      transitionDatasetVersion(
        createDatasetVersionDraft({
          id,
          datasetId: profile.id,
          parsed,
          selectedSheet: sheet,
          rows,
          profile,
          checksum: `${identity.checksum}-${versionNumber}`,
          schemaHash: identity.schemaHash,
          versionNumber
        }),
        "processing",
        { now: "2026-07-16T00:00:01.000Z" }
      ),
      "validating",
      { now: "2026-07-16T00:00:02.000Z" }
    ),
    "ready",
    { now: "2026-07-16T00:00:03.000Z" }
  );
}

describe("dataset version lifecycle", () => {
  it("keeps the active version untouched when an import fails between steps", async () => {
    const active = await readyVersion("version-1", 1);
    const candidate = transitionDatasetVersion(
      createDatasetVersionDraft({
        id: "version-2",
        datasetId: profile.id,
        parsed,
        selectedSheet: sheet,
        rows,
        profile,
        checksum: "retry-checksum",
        schemaHash: active.schemaHash,
        versionNumber: 2
      }),
      "failed",
      { now: "2026-07-16T00:00:04.000Z", errorMessage: "row batch failed" }
    );

    expect(candidate.status).toBe("failed");
    expect(() => activateDatasetVersion({ activeVersionId: active.id, activeVersionNumber: 1, versions: [active, candidate] }, candidate.id, active.id)).toThrow(/ready/);
  });

  it("allows retry as a new candidate after a failed version", async () => {
    const failed = transitionDatasetVersion(
      createDatasetVersionDraft({
        id: "version-failed",
        datasetId: profile.id,
        parsed,
        selectedSheet: sheet,
        rows,
        profile,
        checksum: "same-content",
        schemaHash: "schema",
        versionNumber: 2
      }),
      "failed"
    );
    const retry = createDatasetVersionDraft({
      id: "version-retry",
      datasetId: profile.id,
      parsed,
      selectedSheet: sheet,
      rows,
      profile,
      checksum: failed.checksum,
      schemaHash: failed.schemaHash,
      versionNumber: 3,
      idempotencyKey: "retry-2"
    });

    expect(failed.status).toBe("failed");
    expect(retry.versionNumber).toBe(3);
    expect(retry.id).not.toBe(failed.id);
  });

  it("deduplicates repeated imports by checksum or idempotency key", async () => {
    const identity = await buildDatasetImportIdentity({ parsed, selectedSheet: sheet, rows, profile, idempotencyKey: "upload-1" });
    const existing = createDatasetVersionDraft({
      id: "version-existing",
      datasetId: profile.id,
      parsed,
      selectedSheet: sheet,
      rows,
      profile,
      checksum: identity.checksum,
      schemaHash: identity.schemaHash,
      versionNumber: 1,
      idempotencyKey: "upload-1"
    });

    expect(findIdempotentDatasetVersion([existing], identity)?.id).toBe(existing.id);
    expect(findIdempotentDatasetVersion([existing], { checksum: identity.checksum, schemaHash: identity.schemaHash })?.id).toBe(existing.id);
  });

  it("prevents cancelled versions from becoming ready", () => {
    const cancelled = cancelDatasetVersion(createDatasetVersionDraft({
      id: "version-cancelled",
      datasetId: profile.id,
      parsed,
      selectedSheet: sheet,
      rows,
      profile,
      checksum: "cancelled",
      schemaHash: "schema",
      versionNumber: 2
    }));

    expect(() => transitionDatasetVersion(cancelled, "ready")).toThrow(/cancelled -> ready/);
  });

  it("activates a ready version with optimistic concurrency", async () => {
    const active = await readyVersion("version-1", 1);
    const next = await readyVersion("version-2", 2);
    const state = activateDatasetVersion({ activeVersionId: active.id, activeVersionNumber: 1, versions: [active, next] }, next.id, active.id);

    expect(state.activeVersionId).toBe(next.id);
    expect(state.activeVersionNumber).toBe(2);
    expect(state.versions.find((version) => version.id === active.id)?.status).toBe("superseded");
    expect(() => activateDatasetVersion(state, active.id, "stale-version")).toThrow(/concurrencia/);
  });

  it("rolls back by reactivating a superseded ready version", async () => {
    const first = await readyVersion("version-1", 1);
    const second = await readyVersion("version-2", 2);
    const afterUpgrade = activateDatasetVersion({ activeVersionId: first.id, activeVersionNumber: 1, versions: [first, second] }, second.id, first.id);
    const afterRollback = activateDatasetVersion(afterUpgrade, first.id, second.id);

    expect(afterRollback.activeVersionId).toBe(first.id);
    expect(afterRollback.versions.find((version) => version.id === first.id)?.status).toBe("ready");
    expect(afterRollback.versions.find((version) => version.id === second.id)?.status).toBe("superseded");
  });

  it("keeps historical dashboards pinned to their original dataset version", async () => {
    const first = await readyVersion("version-1", 1);
    const second = await readyVersion("version-2", 2);
    const historicalDashboard = generateDashboardSpec({ ...profile, datasetVersionId: first.id }, rows);
    const afterUpgrade = activateDatasetVersion({ activeVersionId: first.id, activeVersionNumber: 1, versions: [first, second] }, second.id, first.id);

    expect(afterUpgrade.activeVersionId).toBe(second.id);
    expect(historicalDashboard.datasetVersionId).toBe(first.id);
  });
});
