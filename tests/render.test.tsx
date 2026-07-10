import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CopilotPanel, DashboardRenderer } from "@/components/dashboard/dashboard-renderer";
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

  it("keeps the copilot input visible and sends prompts", async () => {
    useDashPilotStore.getState().loadDemo();

    render(<CopilotPanel />);

    const input = screen.getByPlaceholderText("Escribe tu mensaje...");
    fireEvent.change(input, { target: { value: "Hazlo mas ejecutivo" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    await waitFor(() => expect(input).toHaveValue(""));
    expect(screen.getAllByText("Hazlo mas ejecutivo").length).toBeGreaterThan(1);
    expect(await screen.findByText(/Simplifique la vista ejecutiva/)).toBeInTheDocument();
  });
});
