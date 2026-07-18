import { describe, expect, it } from "vitest";
import { resolveCopilotContext } from "@/lib/copilot-command-bus";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { demoRows } from "@/lib/data/demo-dataset";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { inferSemanticLayer } from "@/lib/semantic-layer";

function authority() {
  const datasetProfile = profileDataset(demoRows);
  const dashboardSpec = generateDashboardSpec(datasetProfile, demoRows);
  return {
    actor: { id: "user_1", role: "editor" as const },
    projectId: "project_1",
    dashboardId: dashboardSpec.id,
    currentRevisionId: "rev_1",
    dashboardSpec,
    viewState: { filters: [] },
    datasetProfile,
    semanticModel: inferSemanticLayer(datasetProfile, demoRows)
  };
}

describe("copilot context resolver", () => {
  it("ignores manipulated selectedTargetSpec and resolves the real target by id", () => {
    const auth = authority();
    const result = resolveCopilotContext({
      projectId: auth.projectId,
      dashboardId: auth.dashboardId,
      revisionId: auth.currentRevisionId,
      scope: "widget",
      targetId: "sales_by_region",
      userMessage: "cambialo",
      selectedTargetSpec: { id: "evil_widget", title: "Injected" }
    }, auth);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.context.selectedTarget.id).toBe("sales_by_region");
      expect(result.context.viewState.selectedTargetSpec).toBeUndefined();
      expect(result.context.warnings[0]).toContain("ignorado");
    }
  });

  it("rejects foreign targets, stale revisions, invalid scopes and revoked access", () => {
    const auth = authority();

    expect(resolveCopilotContext({ projectId: auth.projectId, dashboardId: auth.dashboardId, revisionId: auth.currentRevisionId, scope: "widget", targetId: "missing", userMessage: "x" }, auth).success).toBe(false);
    expect(resolveCopilotContext({ projectId: auth.projectId, dashboardId: auth.dashboardId, revisionId: "old_rev", scope: "dashboard", userMessage: "x" }, auth).success).toBe(false);
    expect(resolveCopilotContext({ projectId: auth.projectId, dashboardId: auth.dashboardId, revisionId: auth.currentRevisionId, scope: "bad" as "dashboard", userMessage: "x" }, auth).success).toBe(false);
    expect(resolveCopilotContext({ projectId: auth.projectId, dashboardId: auth.dashboardId, revisionId: auth.currentRevisionId, scope: "dashboard", userMessage: "x" }, { ...auth, hasAccess: false }).success).toBe(false);
  });
});
