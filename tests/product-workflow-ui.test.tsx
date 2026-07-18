import type { AnchorHTMLAttributes, ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardEditor } from "@/components/dashboard/dashboard-editor";
import { AppShell } from "@/components/layout/AppShell";
import { PresentationBuilder } from "@/components/presentation/presentation-builder";
import { ToastProvider } from "@/components/shared/toast";
import { useDashPilotStore } from "@/lib/store/app-store";

const navigation = vi.hoisted(() => ({
  pathname: "/app/dashboards/dashboard_demo",
  push: vi.fn()
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
  useParams: () => ({ dashboardId: "dashboard_demo" })
}));

interface MockLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
}

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: MockLinkProps) => <a href={href} {...props}>{children}</a>
}));

function renderWithToast(node: ReactNode) {
  return render(<ToastProvider>{node}</ToastProvider>);
}

beforeEach(() => {
  useDashPilotStore.getState().clearSensitiveWorkspace();
  navigation.pathname = "/app/dashboards/dashboard_demo";
  navigation.push.mockClear();
});

describe("product workflow UI", () => {
  it("renders app shell breadcrumbs, command search and dynamic dashboard links", () => {
    useDashPilotStore.getState().loadDemo();

    renderWithToast(
      <AppShell>
        <div>Contenido</div>
      </AppShell>
    );

    expect(screen.getByLabelText("Breadcrumb")).toHaveTextContent("Inicio/Dashboards/Editor");
    expect(screen.getByPlaceholderText("Buscar en DashPilot...")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Dashboards/ })).toHaveAttribute("href", expect.stringContaining("/app/dashboards/dashboard_"));
    expect(screen.queryByRole("link", { name: /Dashboards/ })).not.toHaveAttribute("href", "/app/dashboards/demo");
  });

  it("organizes dashboard editing into required professional tabs", () => {
    useDashPilotStore.getState().loadDemo();
    useDashPilotStore.getState().startDashboardEditing();

    renderWithToast(<DashboardEditor />);

    for (const tab of ["Datos", "Visual", "Formato", "Interaccion"]) {
      expect(screen.getByRole("tab", { name: tab })).toBeInTheDocument();
    }
    expect(screen.getByText(/Valida metrica/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Formato" }));
    expect(screen.getByLabelText("Titulo del dashboard")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Interaccion" }));
    expect(screen.getAllByText(/Las interacciones usan filtros/).length).toBeGreaterThan(0);
  });

  it("shows presentation snapshot linkage to a dashboard revision", () => {
    useDashPilotStore.getState().loadDemo();

    renderWithToast(<PresentationBuilder />);

    expect(screen.getByText("Revision vinculada")).toBeInTheDocument();
    expect(screen.getByText("snapshot")).toBeInTheDocument();
    expect(screen.getByText(/dashboard_revision_/)).toBeInTheDocument();
  });
});
