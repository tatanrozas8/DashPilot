"use client";

import type { ChatMessage } from "@/types/ai";
import type { DataRow, DatasetProfile, FileParseResult } from "@/types/dataset";
import type { DashboardSpec, DashboardViewState } from "@/types/dashboard";
import type { ShareLink } from "@/types/export";
import type { PresentationSpec } from "@/types/presentation";
import { createCorrelationId, logDomainError, toDomainError } from "@/lib/observability/domain-error";
import type { SyncStatus } from "@/lib/observability/modes";
import { createDashboardSpec, createDashboardVersion, updateDashboardSpec } from "@/lib/supabase/dashboards";
import { createDataset, createProjectIfNeeded, saveDatasetColumns, saveDatasetProfile, saveDatasetRows, saveDatasetSheets } from "@/lib/supabase/datasets";
import { saveChatMessage } from "@/lib/supabase/chat";
import { createPresentation } from "@/lib/supabase/presentations";
import { createShareLink } from "@/lib/supabase/share-links";
import { nameFromFile } from "@/lib/utils/name-from-file";

const OUTBOX_KEY = "dashpilot:sync-outbox";
const MAX_ATTEMPTS = 5;

export type OutboxPayload =
  | { kind: "dataset"; parsed: FileParseResult; profile: DatasetProfile; rows: DataRow[] }
  | { kind: "dashboard"; projectId?: string; spec: DashboardSpec; viewState: DashboardViewState; rows?: DataRow[]; profile?: DatasetProfile; updateDashboardId?: string }
  | { kind: "presentation"; spec: PresentationSpec }
  | { kind: "share"; link: ShareLink }
  | { kind: "chat"; projectId: string; dashboardId?: string; message: ChatMessage }
  | { kind: "dashboard-version"; dashboardId: string; spec: DashboardSpec; reason?: string };

export interface OutboxItem {
  id: string;
  payload: OutboxPayload;
  status: SyncStatus;
  attempts: number;
  nextAttemptAt: string;
  createdAt: string;
  updatedAt: string;
  correlationId: string;
  lastError?: string;
}

function nowIso() {
  return new Date().toISOString();
}

function nextAttemptIso(attempts: number) {
  const delayMs = Math.min(60_000, 1_000 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + delayMs).toISOString();
}

function readOutbox(): OutboxItem[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(OUTBOX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isOutboxItem) : [];
  } catch {
    window.localStorage.removeItem(OUTBOX_KEY);
    return [];
  }
}

function writeOutbox(items: OutboxItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("dashpilot:outbox-change", { detail: { count: items.length } }));
}

function isOutboxItem(value: unknown): value is OutboxItem {
  if (typeof value !== "object" || !value) return false;
  const item = value as Partial<OutboxItem>;
  return typeof item.id === "string" && typeof item.correlationId === "string" && typeof item.payload === "object" && Boolean(item.payload);
}

export function listOutboxItems() {
  return readOutbox();
}

export function outboxCount() {
  return readOutbox().filter((item) => item.status !== "saved").length;
}

export function enqueueOutbox(payload: OutboxPayload, correlationId = createCorrelationId("sync")) {
  const timestamp = nowIso();
  const item: OutboxItem = {
    id: createCorrelationId("outbox"),
    payload,
    status: "retrying",
    attempts: 0,
    nextAttemptAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    correlationId
  };
  writeOutbox([...readOutbox(), item]);
  return item;
}

function updateOutboxItem(item: OutboxItem) {
  writeOutbox(readOutbox().map((current) => current.id === item.id ? item : current));
}

function removeOutboxItem(id: string) {
  writeOutbox(readOutbox().filter((item) => item.id !== id));
}

async function replayPayload(payload: OutboxPayload) {
  if (payload.kind === "dataset") {
    const project = await createProjectIfNeeded(nameFromFile(payload.parsed.fileName));
    const dataset = await createDataset(project.projectId, payload.parsed, payload.profile);
    await saveDatasetSheets(dataset.datasetId, payload.parsed);
    await saveDatasetColumns(dataset.datasetId, payload.profile);
    await saveDatasetRows(dataset.datasetId, payload.rows);
    await saveDatasetProfile(dataset.datasetId, payload.profile);
    return;
  }
  if (payload.kind === "dashboard") {
    if (payload.updateDashboardId) {
      await updateDashboardSpec(payload.updateDashboardId, payload.spec, payload.viewState);
      return;
    }
    await createDashboardSpec(payload.spec, payload.viewState, payload.projectId);
    return;
  }
  if (payload.kind === "presentation") {
    await createPresentation(payload.spec);
    return;
  }
  if (payload.kind === "share") {
    await createShareLink(payload.link);
    return;
  }
  if (payload.kind === "chat") {
    await saveChatMessage(payload.projectId, payload.dashboardId, payload.message);
    return;
  }
  await createDashboardVersion(payload.dashboardId, payload.spec, payload.reason);
}

export async function retryOutboxItem(item: OutboxItem) {
  const attempt = { ...item, status: "pending" as const, updatedAt: nowIso() };
  updateOutboxItem(attempt);
  try {
    await replayPayload(item.payload);
    removeOutboxItem(item.id);
    return { success: true as const, correlationId: item.correlationId };
  } catch (error) {
    const domainError = toDomainError(error, {
      code: "supabase_unavailable",
      fallbackMessage: "No se pudo sincronizar el cambio pendiente.",
      correlationId: item.correlationId,
      executionMode: "degraded",
      syncStatus: "retrying"
    });
    logDomainError(domainError, "outbox.retry");
    const attempts = item.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    updateOutboxItem({
      ...item,
      attempts,
      status: failed ? "failed" : "retrying",
      updatedAt: nowIso(),
      nextAttemptAt: failed ? item.nextAttemptAt : nextAttemptIso(attempts),
      lastError: domainError.message
    });
    return { success: false as const, correlationId: item.correlationId, error: domainError };
  }
}

export async function flushOutboxDueItems() {
  const due = readOutbox().filter((item) => item.status !== "failed" && new Date(item.nextAttemptAt).getTime() <= Date.now());
  const results = [];
  for (const item of due) {
    results.push(await retryOutboxItem(item));
  }
  return results;
}
