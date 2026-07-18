import { describe, expect, it } from "vitest";
import { capabilities } from "@/lib/product/capabilities";

describe("product capability catalog", () => {
  it("documents the visible capability contract", () => {
    expect(capabilities.map(({ id, status, visible, enabled, beta }) => ({ id, status, visible, enabled, beta }))).toMatchInlineSnapshot(`
      [
        {
          "beta": false,
          "enabled": true,
          "id": "dataset.upload",
          "status": "real",
          "visible": true,
        },
        {
          "beta": false,
          "enabled": true,
          "id": "dataset.demo",
          "status": "real",
          "visible": true,
        },
        {
          "beta": false,
          "enabled": true,
          "id": "dataset.previewCsv",
          "status": "real",
          "visible": true,
        },
        {
          "beta": false,
          "enabled": true,
          "id": "dashboard.generate",
          "status": "real",
          "visible": true,
        },
        {
          "beta": true,
          "enabled": true,
          "id": "dashboard.save",
          "status": "partial",
          "visible": true,
        },
        {
          "beta": false,
          "enabled": true,
          "id": "dashboard.exportCsv",
          "status": "real",
          "visible": true,
        },
        {
          "beta": false,
          "enabled": true,
          "id": "dashboard.exportSpecJson",
          "status": "real",
          "visible": true,
        },
        {
          "beta": true,
          "enabled": true,
          "id": "share.interactiveLink",
          "status": "partial",
          "visible": true,
        },
        {
          "beta": false,
          "enabled": false,
          "id": "share.password",
          "status": "future",
          "visible": false,
        },
        {
          "beta": true,
          "enabled": false,
          "id": "export.interactiveManifest",
          "status": "future",
          "visible": true,
        },
        {
          "beta": false,
          "enabled": true,
          "id": "export.staticPdf",
          "status": "real",
          "visible": true,
        },
        {
          "beta": false,
          "enabled": true,
          "id": "export.staticPng",
          "status": "real",
          "visible": true,
        },
        {
          "beta": false,
          "enabled": true,
          "id": "export.staticPptx",
          "status": "real",
          "visible": true,
        },
        {
          "beta": false,
          "enabled": true,
          "id": "presentation.generate",
          "status": "real",
          "visible": true,
        },
        {
          "beta": true,
          "enabled": true,
          "id": "presentation.save",
          "status": "partial",
          "visible": true,
        },
        {
          "beta": false,
          "enabled": true,
          "id": "presentation.present",
          "status": "real",
          "visible": true,
        },
        {
          "beta": false,
          "enabled": true,
          "id": "presentation.promptAdjustments",
          "status": "real",
          "visible": true,
        },
        {
          "beta": true,
          "enabled": true,
          "id": "copilot.provider",
          "status": "partial",
          "visible": true,
        },
      ]
    `);
  });
});
