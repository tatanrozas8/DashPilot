import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/copilot/route";
import { requestCopilotResponse } from "@/lib/ai/copilot-client";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { demoRows } from "@/lib/data/demo-dataset";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { inferSemanticLayer } from "@/lib/semantic-layer";
import type { CopilotRequestContext } from "@/lib/ai/copilot-service";
import type { DashboardSpec } from "@/types/dashboard";

function copilotContext(): CopilotRequestContext {
  const datasetProfile = profileDataset(demoRows);
  return {
    prompt: "hazlo mas ejecutivo",
    datasetProfile,
    semanticModel: inferSemanticLayer(datasetProfile, demoRows),
    dashboardSpec: generateDashboardSpec(datasetProfile, demoRows),
    viewState: { filters: [] },
    rows: demoRows
  };
}

function requestFromContext(context = copilotContext()) {
  return new Request("http://localhost/api/copilot", {
    method: "POST",
    body: JSON.stringify(context)
  });
}

function dashboardSpec(): DashboardSpec {
  const datasetProfile = profileDataset(demoRows);
  return generateDashboardSpec(datasetProfile, demoRows);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("observable AI and persistence failures", () => {
  it("returns deterministic mode when AI provider is intentionally unconfigured", async () => {
    vi.stubEnv("AI_API_KEY", "");

    const response = await POST(requestFromContext());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.source).toBe("deterministic");
    expect(payload.executionMode).toBe("deterministic");
    expect(payload.correlationId).toMatch(/^ai_local_/);
  });

  it("reports provider outage instead of returning deterministic output", async () => {
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));

    const response = await POST(requestFromContext());
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error.code).toBe("ai_provider_unavailable");
    expect(payload.error.executionMode).toBe("provider");
    expect(payload.error.correlationId).toBeTruthy();
  });

  it("reports provider timeout with correlation id", async () => {
    vi.useFakeTimers();
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    })));

    const pending = POST(requestFromContext());
    await vi.advanceTimersByTimeAsync(16_000);
    const response = await pending;
    const payload = await response.json();

    expect(response.status).toBe(504);
    expect(payload.error.code).toBe("ai_provider_timeout");
    expect(payload.error.correlationId).toBeTruthy();
  });

  it("reports invalid provider response without applying a fallback action", async () => {
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ output_text: "{invalid-json" })));

    const response = await POST(requestFromContext());
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error.code).toBe("ai_provider_invalid_response");
  });

  it("surfaces network loss in the copilot client", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));

    await expect(requestCopilotResponse(copilotContext())).rejects.toMatchObject({
      code: "network_offline",
      executionMode: "offline/local",
      syncStatus: "failed"
    });
  });

  it("marks Supabase persistence as degraded and queues retry when provider save fails", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/client", () => ({
      isSupabaseConfigured: () => true,
      getSupabaseBrowserClient: () => ({})
    }));
    vi.doMock("@/lib/supabase/auth", () => ({
      getCurrentAuthState: () => Promise.resolve({ configured: true, session: {}, user: { id: "user-1" } })
    }));
    vi.doMock("@/lib/supabase/dashboards", () => ({
      saveLocalDashboard: vi.fn(),
      createDashboardSpec: vi.fn(() => Promise.reject(new Error("supabase down"))),
      updateDashboardSpec: vi.fn(() => Promise.reject(new Error("supabase down"))),
      getDashboardById: vi.fn(),
      createDashboardVersion: vi.fn()
    }));
    const { persistDashboard } = await import("@/lib/data-access");
    const spec = dashboardSpec();

    const result = await persistDashboard({ spec, viewState: { filters: [] }, rows: demoRows }, "project-1");

    expect(result.mode).toBe("degraded");
    expect(result.executionMode).toBe("degraded");
    expect(result.syncStatus).toBe("retrying");
    expect(result.correlationId).toBeTruthy();
    const serializedOutbox = window.localStorage.getItem("dashpilot:sync-outbox:v2") ?? "";
    expect(serializedOutbox).toContain("dashboard");
    expect(serializedOutbox).not.toContain("ventas");
  });

  it("retries and clears outbox items after recovery", async () => {
    vi.resetModules();
    const createDashboardSpec = vi.fn(() => Promise.resolve({ mode: "supabase" as const, dashboardId: "dashboard-1" }));
    vi.doMock("@/lib/supabase/dashboards", () => ({
      createDashboardSpec,
      updateDashboardSpec: vi.fn(),
      createDashboardVersion: vi.fn(),
      saveLocalDashboard: vi.fn()
    }));
    vi.doMock("@/lib/supabase/datasets", () => ({
      createProjectIfNeeded: vi.fn(),
      createDataset: vi.fn(),
      saveDatasetSheets: vi.fn(),
      saveDatasetColumns: vi.fn(),
      saveDatasetRows: vi.fn(),
      saveDatasetProfile: vi.fn()
    }));
    vi.doMock("@/lib/supabase/chat", () => ({ saveChatMessage: vi.fn() }));
    vi.doMock("@/lib/supabase/presentations", () => ({ createPresentation: vi.fn() }));
    vi.doMock("@/lib/supabase/share-links", () => ({ createShareLink: vi.fn() }));
    const { enqueueOutbox, flushOutboxDueItems, listOutboxItems } = await import("@/lib/data-access/outbox");
    const spec = dashboardSpec();
    enqueueOutbox({ kind: "dashboard", projectId: "project-1", spec, viewState: { filters: [] } }, "sync_test");

    const results = await flushOutboxDueItems();

    expect(results).toEqual([{ success: true, correlationId: "sync_test" }]);
    expect(createDashboardSpec).toHaveBeenCalled();
    expect(listOutboxItems()).toHaveLength(0);
  });
});
