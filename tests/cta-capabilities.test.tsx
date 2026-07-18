import type { AnchorHTMLAttributes, ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PresentationBuilder } from "@/components/presentation/presentation-builder";
import { ShareExportPage } from "@/components/share-export-page";
import { ToastProvider } from "@/components/shared/toast";
import { useDashPilotStore } from "@/lib/store/app-store";

const navigation = vi.hoisted(() => ({
  pathname: "/app/dashboards/demo/compartir",
  push: vi.fn()
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
  useParams: () => ({ dashboardId: "demo" })
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

function scopedArticle(title: string) {
  const heading = screen.getByRole("heading", { name: title });
  const article = heading.closest("article");
  if (!article) throw new Error(`Missing article for ${title}`);
  return within(article);
}

beforeEach(() => {
  useDashPilotStore.getState().clearSensitiveWorkspace();
  navigation.push.mockClear();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:dashpilot") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

describe("visible capability CTAs", () => {
  it("keeps unavailable manifest disabled and executes real export downloads", async () => {
    useDashPilotStore.getState().loadDemo();
    renderWithToast(<ShareExportPage />);

    expect(screen.getByText("Requerir contrasena")).toBeInTheDocument();
    expect(screen.getByText(/resultados agregados por widget/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir vista previa" })).toBeDisabled();

    expect(scopedArticle("Manifest interactivo").getByRole("button", { name: "No disponible" })).toBeDisabled();
    for (const title of ["Exportar PDF", "Exportar PNG", "Exportar PowerPoint"]) {
      expect(scopedArticle(title).getByRole("button")).toBeEnabled();
    }

    for (const title of ["Exportar PDF", "Exportar PNG", "Exportar PowerPoint"]) {
      fireEvent.click(scopedArticle(title).getByRole("button"));
    }
    expect(URL.createObjectURL).toHaveBeenCalledTimes(3);

    fireEvent.click(scopedArticle("Exportar DashboardSpec JSON").getByRole("button", { name: "Descargar JSON" }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(4);
    expect(await screen.findByText("DashboardSpec JSON descargado.")).toBeInTheDocument();

    fireEvent.click(scopedArticle("Exportar dataset CSV").getByRole("button", { name: "Descargar CSV" }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(5);
    expect(await screen.findByText("Dataset CSV descargado.")).toBeInTheDocument();
  });

  it("does not claim a share link was copied when clipboard access is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    useDashPilotStore.getState().loadDemo();

    renderWithToast(<ShareExportPage />);
    fireEvent.click(screen.getByRole("button", { name: "Crear y copiar" }));

    expect(await screen.findByText("Enlace creado. No se pudo copiar automaticamente; copialo desde el campo.")).toBeInTheDocument();
    expect(screen.queryByText(/copiado\./)).not.toBeInTheDocument();
  });

  it("labels deterministic presentation controls honestly and disables present until saved", () => {
    renderWithToast(<PresentationBuilder />);

    expect(screen.getByRole("heading", { name: "2. Esquema generado por reglas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ajustes deterministicos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Presentar ahora" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Guardar borrador \(beta\)/ })).toBeInTheDocument();
    expect(screen.queryByText(/Copiloto IA/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Esquema propuesto por IA/)).not.toBeInTheDocument();
  });
});
