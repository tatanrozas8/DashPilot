import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "@/components/settings-page";
import { ToastProvider } from "@/components/shared/toast";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/configuracion",
  useRouter: () => ({ push: vi.fn() })
}));

afterEach(() => {
  window.localStorage.clear();
});

describe("SettingsPage", () => {
  it("loads and saves local workspace preferences without effect-driven state sync", async () => {
    window.localStorage.setItem("dashpilot.workspaceName", "Finance Ops");
    window.localStorage.setItem("dashpilot.language", "es-LatAm");

    render(
      <ToastProvider>
        <SettingsPage />
      </ToastProvider>
    );

    const workspaceInput = screen.getByLabelText("Nombre del workspace");
    expect(workspaceInput).toHaveValue("Finance Ops");

    fireEvent.change(workspaceInput, { target: { value: "Revenue Desk" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuracion" }));

    expect(window.localStorage.getItem("dashpilot.workspaceName")).toBe("Revenue Desk");
    expect(window.localStorage.getItem("dashpilot.language")).toBe("es-LatAm");
    expect(await screen.findByText("Configuracion guardada localmente.")).toBeInTheDocument();
  });
});
