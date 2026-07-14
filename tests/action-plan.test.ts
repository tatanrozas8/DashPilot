import { describe, expect, it } from "vitest";
import { buildActionPlan } from "@/lib/ai/action-plan";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { demoRows } from "@/lib/data/demo-dataset";
import { profileDataset } from "@/lib/profiling/profile-dataset";

function context(selected = true) {
  const dashboardSpec = generateDashboardSpec(profileDataset(demoRows), demoRows);
  return {
    dashboardSpec,
    viewState: selected
      ? { filters: [], selectedTargetType: "widget" as const, selectedTargetId: "sales_by_region", selectedTargetTitle: "Ventas por Region" }
      : { filters: [] }
  };
}

describe("copilot action plan", () => {
  it("distinguishes visual-only orientation from data logic", () => {
    const ctx = context();
    const plan = buildActionPlan({ ...ctx, prompt: "Muestralo vertical" });

    expect(plan.action?.type).toBe("update_widget_visual_config");
    expect(plan.changesVisualOnly).toBe(true);
    expect(plan.changesDataLogic).toBe(false);
    expect(plan.orientation).toBe("vertical");
  });

  it("treats correction language as correction, not filter intent", () => {
    const ctx = context();
    const plan = buildActionPlan({ ...ctx, prompt: "No, no te pedi cambiar la logica" });

    expect(plan.messageKind).toBe("correction");
    expect(plan.changesDataLogic).toBe(false);
    expect(plan.action?.type).not.toBe("add_or_update_filter");
  });

  it("detects undo requests", () => {
    const ctx = context();
    const plan = buildActionPlan({ ...ctx, prompt: "No, vuelve atras" });

    expect(plan.messageKind).toBe("undo");
    expect(plan.action?.type).toBe("undo_last_action");
  });

  it("asks for a selected widget when the prompt says this chart without selection", () => {
    const ctx = context(false);
    const plan = buildActionPlan({ ...ctx, prompt: "Cambia este grafico a barras" });

    expect(plan.needsClarification).toBe(true);
    expect(plan.clarification).toContain("Selecciona primero");
  });
});
