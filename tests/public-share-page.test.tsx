import type { AnchorHTMLAttributes, ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicSharePage } from "@/components/public-share-page";
import type { PublicSharedDashboard } from "@/lib/data-access/types";

const loadPublicShareMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/data-access", () => ({
  loadPublicShare: loadPublicShareMock
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "share_token" })
}));

interface MockLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
}

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: MockLinkProps) => <a href={href} {...props}>{children}</a>
}));

function payload(input: { allowFilters: boolean; value: number; allowedValues?: Array<{ label: string; value: string }> }): PublicSharedDashboard {
  return {
    link: {
      id: "link-1",
      dashboardId: "dashboard-1",
      access: "public",
      allowFilters: input.allowFilters,
      allowDownload: false,
      scopes: input.allowFilters ? ["view_dashboard", "use_filters"] : ["view_dashboard"],
      createdAt: "2026-07-16T00:00:00.000Z"
    },
    dashboard: {
      id: "dashboard-1",
      title: "Dashboard publico",
      datasetId: "dataset-1",
      globalFilters: [{ id: "region", field: "region", label: "Region", type: "single_select", allowedValues: input.allowedValues ?? [{ label: "RM", value: "RM" }] }],
      widgets: [{
        id: "sales_kpi",
        type: "kpi_card",
        title: "Ventas",
        query: { metric: { field: "sales", aggregation: "sum" } },
        config: {},
        position: { x: 0, y: 0, w: 3, h: 2 }
      }],
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z"
    },
    viewState: { filters: [] },
    widgetResults: [{ widgetId: "sales_kpi", revisionId: "rev-1", rows: [{ label: "sum", value: input.value }] }],
    allowedFilters: input.allowFilters ? [{ id: "region", field: "region", label: "Region", type: "single_select", allowedValues: input.allowedValues ?? [{ label: "RM", value: "RM" }] }] : []
  };
}

beforeEach(() => {
  loadPublicShareMock.mockReset();
});

describe("PublicSharePage filters", () => {
  it("renders interactive public filters and sends requested_filters", async () => {
    loadPublicShareMock
      .mockResolvedValueOnce(payload({ allowFilters: true, value: 250 }))
      .mockResolvedValueOnce(payload({ allowFilters: true, value: 100 }));

    render(<PublicSharePage />);

    const selector = await screen.findByLabelText("Region");
    fireEvent.change(selector, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    await waitFor(() => expect(loadPublicShareMock).toHaveBeenLastCalledWith("share_token", undefined, [{ field: "region", operator: "in", value: ["RM"] }]));
    expect(await screen.findByText("region: RM")).toBeInTheDocument();
    expect(screen.queryByText("customer_secret")).not.toBeInTheDocument();
  });

  it("does not render interactive controls when allowFilters is false", async () => {
    loadPublicShareMock.mockResolvedValueOnce(payload({ allowFilters: false, value: 250 }));

    render(<PublicSharePage />);

    await expect(screen.findByText("Dashboard publico")).resolves.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aplicar filtros" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Region")).not.toBeInTheDocument();
  });

  it("clears public filters back to the base snapshot", async () => {
    loadPublicShareMock
      .mockResolvedValueOnce(payload({ allowFilters: true, value: 250 }))
      .mockResolvedValueOnce(payload({ allowFilters: true, value: 100 }))
      .mockResolvedValueOnce(payload({ allowFilters: true, value: 250 }));

    render(<PublicSharePage />);

    fireEvent.change(await screen.findByLabelText("Region"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    expect(await screen.findByText("region: RM")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));

    await waitFor(() => expect(loadPublicShareMock).toHaveBeenLastCalledWith("share_token", undefined, []));
    expect(await screen.findByText("Sin filtros activos")).toBeInTheDocument();
  });

  it("shows a clear error without breaking the dashboard when a filtered load fails", async () => {
    loadPublicShareMock
      .mockResolvedValueOnce(payload({ allowFilters: true, value: 250 }))
      .mockResolvedValueOnce(null);

    render(<PublicSharePage />);

    fireEvent.change(await screen.findByLabelText("Region"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(await screen.findByText("El filtro solicitado no es valido para este enlace.")).toBeInTheDocument();
    expect(screen.getByText("Dashboard publico")).toBeInTheDocument();
  });
});
