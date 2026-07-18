import { describe, expect, it } from "vitest";
import { createExecutionState, dryRunCommands, executeTransaction, manualCommandEnvelope, resolveCopilotContext, undoTransaction } from "@/lib/copilot-command-bus";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { demoRows } from "@/lib/data/demo-dataset";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { inferSemanticLayer } from "@/lib/semantic-layer";

function context() {
  const datasetProfile = profileDataset(demoRows);
  const dashboardSpec = generateDashboardSpec(datasetProfile, demoRows);
  const resolved = resolveCopilotContext({
    projectId: "project_1",
    dashboardId: dashboardSpec.id,
    revisionId: "rev_1",
    targetId: "sales_by_region",
    scope: "widget",
    userMessage: "vertical"
  }, {
    actor: { id: "user_1", role: "editor" },
    projectId: "project_1",
    dashboardId: dashboardSpec.id,
    currentRevisionId: "rev_1",
    dashboardSpec,
    viewState: { filters: [], selectedTargetType: "widget", selectedTargetId: "sales_by_region" },
    datasetProfile,
    semanticModel: inferSemanticLayer(datasetProfile, demoRows)
  });
  if (!resolved.success) throw new Error(resolved.error);
  return resolved.context;
}

describe("copilot dry-run, executor and undo redo", () => {
  it("dry-run previews a diff without mutating the source context", () => {
    const ctx = context();
    const command = manualCommandEnvelope(ctx, "dashboard.updateWidgetVisualConfig", { widgetId: "sales_by_region", visualConfig: { orientation: "vertical" } }, "visual");
    const before = ctx.dashboardSpec.widgets.find((widget) => widget.id === "sales_by_region")?.config.visualConfig?.orientation;

    const [preview] = dryRunCommands([command], ctx);

    expect(ctx.dashboardSpec.widgets.find((widget) => widget.id === "sales_by_region")?.config.visualConfig?.orientation).toBe(before);
    expect(preview.diff.some((entry) => entry.path.includes("visualConfig"))).toBe(true);
  });

  it("executes atomically, audits once per idempotency key and supports revision undo", () => {
    const ctx = context();
    const command = manualCommandEnvelope(ctx, "dashboard.updateWidgetVisualConfig", { widgetId: "sales_by_region", visualConfig: { orientation: "vertical" } }, "visual");
    const state = createExecutionState(ctx);

    const first = executeTransaction({ envelopes: [command], context: ctx, state });
    expect(first.success).toBe(true);
    if (!first.success) return;
    const second = executeTransaction({ envelopes: [command], context: first.context, state: first.state });

    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.auditEvents).toHaveLength(0);
    expect(first.auditEvents[0].diff.length).toBeGreaterThan(0);

    const undone = undoTransaction(first.state);
    expect(undone.success).toBe(true);
    if (undone.success) {
      expect(undone.revision.dashboardSpec.widgets.find((widget) => widget.id === "sales_by_region")?.config.visualConfig?.orientation).not.toBe("vertical");
    }
  });

  it("does not partially publish a failing transaction", () => {
    const ctx = context();
    const good = manualCommandEnvelope(ctx, "dashboard.updateWidgetVisualConfig", { widgetId: "sales_by_region", visualConfig: { orientation: "vertical" } }, "visual");
    const bad = manualCommandEnvelope(ctx, "dashboard.renameWidget", { widgetId: "missing", title: "Bad" }, "bad target");
    const state = createExecutionState(ctx);

    const result = executeTransaction({ envelopes: [good, bad], context: ctx, state });

    expect(result.success).toBe(false);
    expect(result.state.revisions).toHaveLength(1);
  });
});
