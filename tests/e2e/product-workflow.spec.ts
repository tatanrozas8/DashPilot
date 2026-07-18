import { expect, test } from "@playwright/test";
import path from "node:path";

test("professional product workflow from import to share/export", async ({ page }) => {
  await page.context().addCookies([{ name: "dashpilot_local_mode", value: "true", url: "http://127.0.0.1:3100" }]);
  await page.goto("/app");

  await expect(page.getByText("Workflow principal")).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles(path.join(process.cwd(), "tests/fixtures/ventas_real_test.csv"));

  await expect(page).toHaveURL(/\/app\/datasets\/dataset_.*\/preview$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Previsualizacion del Dataset" })).toBeVisible();
  await expect(page.getByText("Vista previa de datos")).toBeVisible();
  await expect(page.getByText("Perfilado del Dataset")).toBeVisible();

  await page.getByRole("link", { name: /Generar dashboard automaticamente/ }).click();
  await expect(page).toHaveURL(/\/app\/dashboards\/dashboard_/, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Editar dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Copiloto" })).toBeVisible();

  await page.getByRole("button", { name: "Editar dashboard" }).click();
  for (const tab of ["Datos", "Visual", "Formato", "Interaccion"]) {
    await expect(page.getByRole("tab", { name: tab })).toBeVisible();
  }
  await page.getByRole("tab", { name: "Formato" }).click();
  await page.getByLabel("Titulo del dashboard").fill("Dashboard comercial validado");
  await page.getByRole("tab", { name: "Interaccion" }).click();
  await expect(page.getByText(/Las interacciones usan filtros/).first()).toBeVisible();
  await page.getByRole("button", { name: "Guardar" }).first().click();
  await expect(page.getByRole("button", { name: "Editar dashboard" })).toBeVisible();
  await expect(page.getByText("Dashboard comercial validado")).toBeVisible();

  await page.getByRole("button", { name: /Seleccionar Ventas por Region/ }).click();
  await page.getByPlaceholder("Escribe tu mensaje...").fill("Cambialo a barras verticales.");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByText(/Plan listo/)).toBeVisible();
  await expect(page.getByText("Plan y diff")).toBeVisible();

  await page.getByRole("link", { name: "Presentar" }).click();
  await expect(page).toHaveURL(/\/app\/presentaciones\/crear$/);
  await expect(page.getByText("Revision vinculada")).toBeVisible();
  await expect(page.getByText("snapshot", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Generar presentacion" }).click();
  await expect(page).toHaveURL(/\/app\/present\//, { timeout: 30_000 });
  await expect(page.getByText(/Presentacion:/)).toBeVisible();
  await page.getByRole("link", { name: "Salir" }).click();

  await expect(page).toHaveURL(/\/app\/dashboards\/dashboard_/);
  await page.getByRole("link", { name: "Compartir" }).click();
  await expect(page.getByText("Compartir enlace interactivo")).toBeVisible();
  await expect(page.getByRole("button", { name: "No disponible" })).toHaveCount(1);

  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar PDF" }).click();
  expect((await pdfDownload).suggestedFilename()).toMatch(/\.pdf$/);

  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar PNG" }).click();
  expect((await pngDownload).suggestedFilename()).toMatch(/\.png$/);

  const pptxDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar PPTX" }).click();
  expect((await pptxDownload).suggestedFilename()).toMatch(/\.pptx$/);

  const specDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar JSON" }).click();
  await expect((await specDownload).suggestedFilename()).toContain("spec.json");

  await page.reload();
  await expect(page.getByText("Compartir enlace interactivo")).toBeVisible();
  await expect(page.getByRole("link", { name: "Volver al dashboard" })).toHaveAttribute("href", /\/app\/dashboards\/dashboard_/);
  await expect(page.getByText(/No se pudo|Unhandled Runtime Error|error critico/i)).toHaveCount(0);
});
