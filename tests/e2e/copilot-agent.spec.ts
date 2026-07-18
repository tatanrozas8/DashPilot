import { expect, test, type Page } from "@playwright/test";

async function openDemoDashboard(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Probar con datos de ejemplo" }).click();
  await expect(page).toHaveURL(/\/app\/datasets\/preview$/);
  await page.getByRole("link", { name: /Generar dashboard automaticamente/ }).click();
  await expect(page).toHaveURL(/\/app\/dashboards\//, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /Copiloto/ })).toBeVisible();
}

async function askCopilot(page: Page, prompt: string) {
  await page.getByPlaceholder("Escribe tu mensaje...").fill(prompt);
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
}

test("copilot plans, previews, applies, undoes and clarifies dashboard edits", async ({ page }) => {
  await openDemoDashboard(page);

  await page.getByRole("button", { name: /Seleccionar Ventas por Region/ }).click();
  await expect(page.getByText("Seleccionado")).toBeVisible();
  await expect(page.getByText(/Actuando sobre: Ventas por Region/)).toBeVisible();

  await askCopilot(page, "Cambialo a barras verticales.");
  await expect(page.getByText(/Plan listo/)).toBeVisible();
  await expect(page.getByText("Plan y diff")).toBeVisible();
  await expect(page.locator("p").filter({ hasText: /Intencion: visual_change|Intencion: correction_with_action/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aplicar" })).toBeVisible();

  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText(/Accion aplicada/)).toBeVisible();
  await expect(page.getByText(/Estado: verified/)).toBeVisible();

  await page.getByRole("button", { name: "Deshacer cambio del Copiloto" }).click();
  await expect(page.getByText(/Deshice/)).toBeVisible();

  await askCopilot(page, "Crea un nuevo grafico de ventas por canal.");
  await expect(page.getByText(/Plan listo/).last()).toBeVisible();
  await page.getByRole("button", { name: "Aplicar" }).last().click();
  await expect(page.getByText(/Accion aplicada/).last()).toBeVisible();
  await expect(page.getByText(/Canal/i).first()).toBeVisible();

  await askCopilot(page, "Hazlo mejor.");
  await expect(page.getByText(/Cambiar visualizacion/)).toBeVisible();
  await expect(page.getByText(/No se pudo|error critico|Unhandled Runtime Error/i)).toHaveCount(0);
});
