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

  it("renders persisted dashboard pages when the spec has DashboardPage metadata", () => {
    useDashPilotStore.getState().loadDemo();
    const dashboard = useDashPilotStore.getState().dashboard;
    useDashPilotStore.setState({
      dashboard: {
        ...dashboard,
        pages: [
          { id: "page_executive", title: "Vista ejecutiva", order: 0, layout: { mode: "grid_12", columns: 12 }, filters: [], widgetIds: ["kpi_sales"] },
          { id: "page_operational", title: "Vista operacional", order: 1, layout: { mode: "grid_12", columns: 12 }, filters: [], widgetIds: ["sales_by_region"] },
          { id: "page_detail", title: "Detalle", order: 2, layout: { mode: "grid_12", columns: 12 }, filters: [], widgetIds: [] }
        ]
      }
    });

    render(
      <ToastProvider>
        <DashboardRenderer />
      </ToastProvider>
    );

    expect(screen.getByRole("heading", { name: "Vista ejecutiva" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Vista operacional" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Detalle" })).toBeInTheDocument();
  });

  it("renders direct analytical answers with highlighted evidence", () => {
    useDashPilotStore.getState().loadDemo();
    useDashPilotStore.setState({
      messages: [{
        id: "answer_1",
        role: "assistant",
        content: "El total de Ventas es $100K.",
        createdAt: "2026-07-19T00:00:00.000Z",
        analyticalAnswer: {
          answer: "El total de Ventas es $100K.",
          valueLabel: "$100K",
          metric: "Ventas",
          period: "Todo el dataset disponible",
          periodInferred: true,
          filters: [],
          evidenceId: "evidence_demo_qa_total",
          context: "Consulta gobernada por QueryService."
        }
      }]
    });

    render(<CopilotPanel />);

    expect(screen.getByText("$100K")).toBeInTheDocument();
    expect(screen.getByText(/Evidencia: evidence_demo_qa_total/)).toBeInTheDocument();
    expect(screen.getByText(/Periodo: Todo el dataset disponible \(inferido\)/)).toBeInTheDocument();
  });

  it("does not emit duplicate-key warnings for Fecha/fecha chips", () => {
    useDashPilotStore.getState().loadDemo();
    const profile = useDashPilotStore.getState().profile;
    const duplicated = {
      ...profile,
      columns: [
        ...profile.columns,
        {
          ...profile.columns[0]!,
          originalName: "fecha",
          displayName: "fecha",
          normalizedName: profile.columns[0]!.normalizedName
        }
      ]
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    useDashPilotStore.setState({ profile: duplicated, datasetProfile: duplicated });

    render(<CopilotPanel />);

    expect(errorSpy.mock.calls.some((call) => call.some((part) => String(part).includes("Encountered two children with the same key")))).toBe(false);
    errorSpy.mockRestore();
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
