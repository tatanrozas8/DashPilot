import { expect, test } from "@playwright/test";

test("main capability CTAs reflect real, beta and disabled behavior", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Probar con datos de ejemplo" }).click();
  await expect(page).toHaveURL(/\/app\/datasets\/preview$/);
  await expect(page.getByText(/Vista previa de datos/)).toBeVisible();

  await page.getByRole("link", { name: /Generar dashboard automaticamente/ }).click();
  await expect(page).toHaveURL(/\/app\/dashboards\//, { timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Compartir" })).toBeVisible();

  await page.getByRole("link", { name: "Compartir" }).click();
  await expect(page).toHaveURL(/\/compartir$/);
  await expect(page.getByText("Compartir enlace interactivo")).toBeVisible();
  await expect(page.getByText("Requerir contrasena")).toHaveCount(0);
  await expect(page.getByText(/La proteccion con contrasena esta desactivada/)).toBeVisible();

  await expect(page.getByRole("button", { name: "No disponible" })).toHaveCount(4);
  for (const title of ["Manifest interactivo", "Exportar PDF", "Exportar PNG", "Exportar PowerPoint"]) {
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name: title }) });
    await expect(card.getByRole("button", { name: "No disponible" })).toBeDisabled();
  }

  const specDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar JSON" }).click();
  await expect((await specDownload).suggestedFilename()).toContain("spec.json");

  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar CSV" }).click();
  await expect((await csvDownload).suggestedFilename()).toContain("rows.csv");

  await page.getByRole("link", { name: "Crear presentacion" }).click();
  await expect(page).toHaveURL(/\/app\/presentaciones\/crear$/);
  await expect(page.getByRole("heading", { name: "2. Esquema generado por reglas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ajustes deterministicos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Presentar ahora" })).toHaveAttribute("href", /\/app\/present\//);
  await page.getByRole("link", { name: "Presentar ahora" }).click();
  await expect(page).toHaveURL(/\/app\/present\//);
});
