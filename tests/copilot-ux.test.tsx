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
});
