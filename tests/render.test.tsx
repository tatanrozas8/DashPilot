import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotPanel, DashboardRenderer } from "@/components/dashboard/dashboard-renderer";
import { ToastProvider } from "@/components/shared/toast";
import { barOrientation } from "@/lib/dashboard-spec/visual-config";
import { useDashPilotStore } from "@/lib/store/app-store";
import type { DashboardWidget } from "@/types/dashboard";

afterEach(() => {
  vi.unstubAllGlobals();
});

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
    expect(screen.getByRole("button", { name: /Recomendaciones inteligentes/ })).toBeInTheDocument();
    expect(screen.queryByText(/Crear barras de/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Recomendaciones inteligentes/ }));
    expect(screen.getByText(/Crear barras de/)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Hazlo mas ejecutivo" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    await waitFor(() => expect(input).toHaveValue(""));
    expect(screen.getByText("Hazlo mas ejecutivo")).toBeInTheDocument();
    expect(await screen.findByText(/Plan listo|Necesito una aclaracion/)).toBeInTheDocument();
    expect(screen.queryByText(/Accion aplicada/)).not.toBeInTheDocument();
  });

  it("resolves bar chart renderer orientation from visualConfig and legacy horizontal flag", () => {
    const base: DashboardWidget = {
      id: "bar",
      type: "bar_chart",
      title: "Ventas por Region",
      query: { metric: { field: "Ventas", aggregation: "sum" }, groupBy: ["Region"] },
      config: {},
      position: { x: 0, y: 0, w: 6, h: 3 }
    };

    expect(barOrientation({ ...base, config: { visualConfig: { orientation: "vertical" }, horizontal: true } })).toBe("vertical");
    expect(barOrientation({ ...base, config: { horizontal: false } })).toBe("vertical");
    expect(barOrientation({ ...base, config: { horizontal: true } })).toBe("horizontal");
  });
});
