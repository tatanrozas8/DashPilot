import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDashPilotStore } from "@/lib/store/app-store";

describe("copilot UX store flow", () => {
  it("creates a visible plan and applies only after confirmation", async () => {
    act(() => {
      useDashPilotStore.getState().loadDemo();
      useDashPilotStore.getState().selectDashboardTarget("widget", "sales_by_region");
    });
    const beforeCount = useDashPilotStore.getState().dashboard.widgets.length;

    await act(async () => {
      await useDashPilotStore.getState().sendPrompt("Cambialo a barras verticales.");
    });

    expect(useDashPilotStore.getState().copilotStatus).toMatch(/planned|awaiting_confirmation/);
    expect(useDashPilotStore.getState().pendingCopilotPlan).toBeTruthy();
    expect(useDashPilotStore.getState().dashboard.widgets).toHaveLength(beforeCount);

    act(() => {
      useDashPilotStore.getState().applyPendingCopilotPlan();
    });

    expect(useDashPilotStore.getState().copilotStatus).toBe("verified");
    expect(useDashPilotStore.getState().pendingCopilotPlan).toBeUndefined();
    expect(useDashPilotStore.getState().copilotEvidence.length).toBeGreaterThan(0);
  });

  it("previews a BI dashboard blueprint before applying it", async () => {
    act(() => {
      useDashPilotStore.getState().loadDemo();
      useDashPilotStore.getState().clearSelectedTarget();
    });

    await act(async () => {
      await useDashPilotStore.getState().sendPrompt("Disenar dashboard ejecutivo completo para gerencia");
    });

    const state = useDashPilotStore.getState();
    expect(state.copilotStatus).toMatch(/planned|awaiting_confirmation/);
    expect(state.pendingCopilotPlan?.plan.blueprint?.title).toBeTruthy();
    expect(state.pendingCopilotPlan?.plan.selfCheck?.passed).toBe(true);
    expect(state.dashboard.widgets.some((widget) => widget.config.generatedBy === "copilot-bi")).toBe(false);
  });

  it("answers scalar analytical questions directly with evidence", async () => {
    act(() => {
      useDashPilotStore.getState().loadDemo();
      useDashPilotStore.getState().clearSelectedTarget();
    });

    await act(async () => {
      await useDashPilotStore.getState().sendPrompt("Cual es el total de ventas?");
    });

    const state = useDashPilotStore.getState();
    const assistant = state.messages.at(-1);
    expect(state.copilotStatus).toBe("verified");
    expect(state.pendingCopilotPlan).toBeUndefined();
    expect(assistant?.analyticalAnswer?.valueLabel).toMatch(/\$|[0-9]/);
    expect(assistant?.analyticalAnswer?.evidenceId).toContain("evidence_");
    expect(state.copilotEvidence.join(" ")).toContain("Respuesta analitica");
  });

  it("persists BI blueprint pages through the command bus and undoes them", async () => {
    act(() => {
      useDashPilotStore.getState().loadDemo();
      useDashPilotStore.getState().clearSelectedTarget();
    });

    await act(async () => {
      await useDashPilotStore.getState().sendPrompt("Disenar dashboard ejecutivo completo para gerencia");
    });

    expect(useDashPilotStore.getState().dashboard.pages).toBeUndefined();

    act(() => {
      useDashPilotStore.getState().applyPendingCopilotPlan();
    });

    expect(useDashPilotStore.getState().dashboard.pages?.map((page) => page.title)).toEqual(["Vista ejecutiva", "Vista operacional", "Detalle"]);
    expect(useDashPilotStore.getState().copilotDiff.some((entry) => entry.path === "dashboard.pages")).toBe(true);

    act(() => {
      useDashPilotStore.getState().undoCopilotChange();
    });

    expect(useDashPilotStore.getState().dashboard.pages).toBeUndefined();
  });
});
