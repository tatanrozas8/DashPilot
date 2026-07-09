import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardRenderer } from "@/components/dashboard/dashboard-renderer";
import { ToastProvider } from "@/components/shared/toast";
import { useDashPilotStore } from "@/lib/store/app-store";

describe("DashboardRenderer", () => {
  it("renders core dashboard widgets", () => {
    useDashPilotStore.getState().loadDemo();

    render(
      <ToastProvider>
        <DashboardRenderer slideWidgetIds={["kpi_sales", "sales_by_region"]} />
      </ToastProvider>
    );

    expect(screen.getByText("Ventas Totales")).toBeInTheDocument();
    expect(screen.getByText("Ventas por Region")).toBeInTheDocument();
  });
});
