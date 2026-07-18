import type { DataRow, DatasetProfile } from "@/types/dataset";
import type { DashboardSpec, DashboardViewState, DashboardWidget, QueryResultRow } from "@/types/dashboard";
import type { PresentationSlide, PresentationSpec } from "@/types/presentation";
import type { PublicSharedDashboard } from "@/lib/data-access/types";
import type { ExportFormat, ExportRequest, ExportResult, ExportTargetType } from "@/lib/export/contracts";
import { createExportRequest, dashboardExportRevisionId, exportResultSchema, presentationExportRevisionId } from "@/lib/export/contracts";
import { concatBytes, createZip, crc32, deflateStored, pngChunk, uint32be, utf8Bytes } from "@/lib/export/binary";
import { executeDashboardQuery } from "@/lib/query-engine/execute-dashboard-query";

export interface ExportArtifact {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  result: ExportResult;
}

export interface DashboardExportInput {
  dashboard: DashboardSpec;
  viewState: DashboardViewState;
  rows: DataRow[];
  profile?: DatasetProfile;
  format: Extract<ExportFormat, "pdf" | "png">;
  request?: ExportRequest;
  target?: { type: Extract<ExportTargetType, "dashboard" | "widget">; id?: string };
  actor?: ExportRequest["actor"];
  scope?: ExportRequest["scope"];
  allowDownload?: boolean;
  requestedAt?: string;
}

export interface PresentationExportInput {
  dashboard: DashboardSpec;
  presentation: PresentationSpec;
  viewState: DashboardViewState;
  rows: DataRow[];
  profile?: DatasetProfile;
  format: Extract<ExportFormat, "pdf" | "png" | "pptx">;
  request?: ExportRequest;
  target?: { type: Extract<ExportTargetType, "presentation" | "slide">; id?: string };
  actor?: ExportRequest["actor"];
  scope?: ExportRequest["scope"];
  allowDownload?: boolean;
  requestedAt?: string;
}

interface WidgetExportModel {
  widget: DashboardWidget;
  rows: QueryResultRow[];
}

interface DashboardExportModel {
  title: string;
  subtitle?: string;
  dashboardId: string;
  dashboardRevisionId: string;
  datasetLabel: string;
  generatedAt: string;
  filters: string[];
  widgets: WidgetExportModel[];
}

const PDF_MIME = "application/pdf";
const PNG_MIME = "image/png";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function safeFilePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .toLowerCase() || "dashpilot";
}

function formatValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(value);
  if (value === null || value === undefined || value === "") return "No disponible";
  return String(value);
}

function escapeXml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&apos;");
}

function escapePdf(value: unknown) {
  return String(value ?? "").replace(/[\\()]/g, "\\$&").replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?");
}

function activeFilterLabels(viewState: DashboardViewState) {
  const filters = viewState.filters ?? [];
  if (!filters.length) return ["Sin filtros aplicados"];
  return filters.map((filter) => `${filter.field} ${filter.operator} ${Array.isArray(filter.value) ? filter.value.join(", ") : String(filter.value)}`);
}

function queryWidgetRows(widget: DashboardWidget, rows: DataRow[], viewState: DashboardViewState): QueryResultRow[] {
  if (widget.config.hidden === true) return [];
  if (!widget.query) {
    const fallback = typeof widget.config.fallbackValue === "number" ? widget.config.fallbackValue : null;
    return fallback === null ? [] : [{ label: widget.title, value: fallback }];
  }
  return executeDashboardQuery(rows, widget.query, viewState).slice(0, widget.type === "table" ? 40 : 12);
}

function buildDashboardModel(input: { dashboard: DashboardSpec; viewState: DashboardViewState; rows: DataRow[]; profile?: DatasetProfile; widgetId?: string; generatedAt?: string }): DashboardExportModel {
  const widgets = input.dashboard.widgets.filter((widget) => widget.config.hidden !== true && (!input.widgetId || widget.id === input.widgetId));
  if (input.widgetId && widgets.length === 0) throw new Error("El widget solicitado no existe en esta revision.");
  return {
    title: input.dashboard.title,
    subtitle: input.dashboard.subtitle,
    dashboardId: input.dashboard.id,
    dashboardRevisionId: dashboardExportRevisionId(input.dashboard),
    datasetLabel: input.profile?.fileName || input.dashboard.datasetVersionId || input.dashboard.datasetId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    filters: activeFilterLabels(input.viewState),
    widgets: widgets.map((widget) => ({ widget, rows: queryWidgetRows(widget, input.rows, input.viewState) }))
  };
}

function buildPublicDashboardModel(payload: PublicSharedDashboard, generatedAt = new Date().toISOString()): DashboardExportModel {
  if (!payload.link.allowDownload || !payload.link.scopes?.includes("export_snapshot")) {
    throw new Error("Este enlace compartido no permite exportar ni descargar snapshots.");
  }
  const resultByWidget = new Map(payload.widgetResults.map((result) => [result.widgetId, result.rows]));
  return {
    title: payload.dashboard.title,
    subtitle: payload.dashboard.subtitle,
    dashboardId: payload.dashboard.id,
    dashboardRevisionId: dashboardExportRevisionId(payload.dashboard),
    datasetLabel: payload.dashboard.datasetVersionId || payload.dashboard.datasetId,
    generatedAt,
    filters: activeFilterLabels(payload.viewState),
    widgets: payload.dashboard.widgets
      .filter((widget) => widget.config.hidden !== true)
      .map((widget) => ({ widget, rows: resultByWidget.get(widget.id) ?? [] }))
  };
}

function modelLines(model: DashboardExportModel) {
  const lines = [
    model.title,
    model.subtitle ?? "Dashboard exportado desde DashPilot",
    `Dashboard: ${model.dashboardId}`,
    `Revision: ${model.dashboardRevisionId}`,
    `Fuente: ${model.datasetLabel}`,
    `Fecha exportacion: ${model.generatedAt}`,
    `Filtros: ${model.filters.join(" | ")}`
  ];
  for (const { widget, rows } of model.widgets) {
    lines.push("", `Widget: ${widget.title}`, `Tipo: ${widget.type}`);
    if (!rows.length) {
      lines.push("Sin resultados renderizables.");
      continue;
    }
    for (const row of rows.slice(0, 10)) {
      lines.push(`- ${formatValue(row.label)}: ${formatValue(row.value)}`);
    }
  }
  return lines;
}

function wrapLine(line: string, width = 96) {
  if (line.length <= width) return [line];
  const words = line.split(/\s+/);
  const output: string[] = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > width) {
      output.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) output.push(current);
  return output;
}

function makePdf(lines: string[]) {
  const pageLines: string[][] = [];
  let current: string[] = [];
  for (const line of lines.flatMap((item) => wrapLine(item))) {
    if (current.length >= 38) {
      pageLines.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) pageLines.push(current);

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageObjectIds: number[] = [];

  for (const page of pageLines) {
    const operations = ["BT", "/F1 12 Tf", "48 792 Td", "16 TL", ...page.map((line) => `(${escapePdf(line)}) Tj T*`), "ET"].join("\n");
    const contentObjectId = objects.length + 1;
    objects.push(`<< /Length ${operations.length} >>\nstream\n${operations}\nendstream`);
    const pageObjectId = objects.length + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    pageObjectIds.push(pageObjectId);
  }

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return utf8Bytes(body);
}

function createCanvas(width: number, height: number) {
  const pixels = new Uint8Array(width * height * 4);
  function rect(x: number, y: number, w: number, h: number, rgba: [number, number, number, number]) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(width, Math.ceil(x + w));
    const y1 = Math.min(height, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy += 1) {
      for (let xx = x0; xx < x1; xx += 1) {
        const offset = (yy * width + xx) * 4;
        pixels[offset] = rgba[0];
        pixels[offset + 1] = rgba[1];
        pixels[offset + 2] = rgba[2];
        pixels[offset + 3] = rgba[3];
      }
    }
  }
  rect(0, 0, width, height, [248, 250, 255, 255]);
  return { pixels, rect };
}

function makePng(model: DashboardExportModel, options: { width: number; height: number; title: string }) {
  const { pixels, rect } = createCanvas(options.width, options.height);
  rect(40, 38, options.width - 80, 6, [61, 53, 255, 255]);
  rect(40, 70, options.width - 80, 92, [255, 255, 255, 255]);
  rect(58, 90, Math.min(options.width - 116, model.title.length * 13), 24, [61, 53, 255, 255]);
  rect(58, 124, Math.min(options.width - 116, model.dashboardRevisionId.length * 7), 12, [154, 167, 199, 255]);

  const visible = model.widgets.slice(0, 8);
  const cols = 2;
  const cardW = Math.floor((options.width - 110) / cols);
  const cardH = Math.floor((options.height - 220) / Math.max(1, Math.ceil(visible.length / cols))) - 16;
  visible.forEach(({ widget, rows }, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = 40 + col * (cardW + 30);
    const y = 190 + row * (cardH + 16);
    rect(x, y, cardW, cardH, [255, 255, 255, 255]);
    rect(x, y, cardW, 4, [61, 53, 255, 255]);
    const values = rows.map((item) => typeof item.value === "number" && Number.isFinite(item.value) ? item.value : 0);
    const max = Math.max(...values, 1);
    values.slice(0, 8).forEach((value, valueIndex) => {
      const barW = Math.max(8, Math.floor(((cardW - 70) * value) / max));
      rect(x + 34, y + 44 + valueIndex * 18, barW, 10, index % 2 ? [22, 163, 74, 255] : [61, 53, 255, 255]);
    });
    if (widget.type === "kpi_card" && values[0]) {
      rect(x + 34, y + 56, Math.min(cardW - 68, Math.floor(values[0] % (cardW - 68))), 36, [14, 165, 233, 255]);
    }
  });

  const rawRows: Uint8Array[] = [];
  for (let y = 0; y < options.height; y += 1) {
    rawRows.push(new Uint8Array([0]), pixels.slice(y * options.width * 4, (y + 1) * options.width * 4));
  }
  const ihdr = concatBytes([uint32be(options.width), uint32be(options.height), new Uint8Array([8, 6, 0, 0, 0])]);
  const text = utf8Bytes(`DashPilot\0Title=${options.title};DashboardRevision=${model.dashboardRevisionId};Source=${model.datasetLabel}`);
  return concatBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("tEXt", text),
    pngChunk("IDAT", deflateStored(concatBytes(rawRows))),
    pngChunk("IEND", new Uint8Array())
  ]);
}

function pptTextShape(id: number, name: string, x: number, y: number, cx: number, cy: number, text: string, size = 2200) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r><a:rPr lang="es-CL" sz="${size}"/><a:t>${escapeXml(text)}</a:t></a:r></a:p></p:txBody></p:sp>`;
}

function slideXml(slide: PresentationSlide, model: DashboardExportModel) {
  const widgetTitles = slide.widgetIds
    .map((id) => model.widgets.find((item) => item.widget.id === id)?.widget.title)
    .filter(Boolean)
    .join(" | ");
  const notes = slide.speakerNotes ? `Notas: ${slide.speakerNotes}` : "Notas: sin notas del presentador.";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${pptTextShape(2, "Title", 520000, 430000, 8200000, 720000, slide.title, 3200)}${pptTextShape(3, "Subtitle", 520000, 1180000, 8200000, 500000, slide.subtitle ?? model.title, 1800)}${pptTextShape(4, "Narrative", 720000, 1950000, 7600000, 1450000, slide.narrative ?? (widgetTitles || "Dashboard snapshot"), 1700)}${pptTextShape(5, "Evidence", 720000, 3650000, 7600000, 700000, `Revision ${model.dashboardRevisionId}. Filtros: ${model.filters.join(" | ")}`, 1300)}${pptTextShape(6, "Speaker notes", 720000, 4500000, 7600000, 600000, notes, 1300)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function presentationXml(slideCount: number) {
  const ids = Array.from({ length: slideCount }, (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId${slideCount + 1}"/></p:sldMasterIdLst><p:sldIdLst>${ids}</p:sldIdLst><p:sldSz cx="9144000" cy="5143500" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
}

function makePptx(input: { presentation: PresentationSpec; model: DashboardExportModel }) {
  const slides = input.presentation.slides.length ? input.presentation.slides : [{
    id: "slide_empty",
    title: input.presentation.title,
    subtitle: input.presentation.subtitle,
    layout: "cover" as const,
    widgetIds: []
  }];
  const slideOverrides = slides.map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  const slideRels = slides.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join("");
  return createZip([
    { path: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slideOverrides}</Types>` },
    { path: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { path: "docProps/core.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(input.presentation.title)}</dc:title><dc:subject>DashPilot export ${escapeXml(input.model.dashboardRevisionId)}</dc:subject><dc:creator>DashPilot</dc:creator><cp:lastModifiedBy>DashPilot</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${input.model.generatedAt}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${input.model.generatedAt}</dcterms:modified></cp:coreProperties>` },
    { path: "docProps/app.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>DashPilot</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>${slides.length}</Slides><Notes>${slides.filter((slide) => slide.speakerNotes).length}</Notes></Properties>` },
    { path: "ppt/presentation.xml", content: presentationXml(slides.length) },
    { path: "ppt/_rels/presentation.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slideRels}<Relationship Id="rId${slides.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/></Relationships>` },
    { path: "ppt/slideMasters/slideMaster1.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>` },
    { path: "ppt/slideMasters/_rels/slideMaster1.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>` },
    { path: "ppt/slideLayouts/slideLayout1.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld></p:sldLayout>` },
    { path: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>` },
    { path: "ppt/theme/theme1.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="DashPilot"><a:themeElements><a:clrScheme name="DashPilot"><a:dk1><a:srgbClr val="071334"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:accent1><a:srgbClr val="3D35FF"/></a:accent1><a:accent2><a:srgbClr val="16A34A"/></a:accent2><a:accent3><a:srgbClr val="0EA5E9"/></a:accent3><a:accent4><a:srgbClr val="F97316"/></a:accent4><a:accent5><a:srgbClr val="64748B"/></a:accent5><a:accent6><a:srgbClr val="111827"/></a:accent6><a:hlink><a:srgbClr val="3D35FF"/></a:hlink><a:folHlink><a:srgbClr val="3D35FF"/></a:folHlink></a:clrScheme><a:fontScheme name="Aptos"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="DashPilot"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>` },
    ...slides.map((slide, index) => ({ path: `ppt/slides/slide${index + 1}.xml`, content: slideXml(slide, input.model) })),
    ...slides.map((_, index) => ({ path: `ppt/slides/_rels/slide${index + 1}.xml.rels`, content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>` }))
  ]);
}

function resultFor(request: ExportRequest, bytes: Uint8Array, fileName: string, mimeType: string, rasterized: string[]): ExportResult {
  return exportResultSchema.parse({
    id: `export_result_${request.id}`,
    requestId: request.id,
    status: "ready",
    format: request.format,
    fileName,
    mimeType,
    byteLength: bytes.length,
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    metadata: {
      dashboardId: request.dashboardId,
      dashboardRevisionId: request.dashboardRevisionId,
      presentationId: request.presentationId,
      presentationRevisionId: request.presentationRevisionId,
      filters: request.filters,
      source: request.scope,
      rasterized
    }
  });
}

export function generateDashboardExport(input: DashboardExportInput): ExportArtifact {
  const model = buildDashboardModel({ ...input, widgetId: input.target?.type === "widget" ? input.target.id : undefined });
  const request = input.request ?? createExportRequest({
    target: input.target ?? { type: "dashboard" },
    format: input.format,
    scope: input.scope ?? "private_workspace",
    dashboardId: input.dashboard.id,
    dashboardRevisionId: model.dashboardRevisionId,
    filters: input.viewState.filters ?? [],
    actor: input.actor ?? { id: "local-user", role: "editor" },
    allowDownload: input.allowDownload ?? true,
    requestedAt: input.requestedAt
  });
  const baseName = `${safeFilePart(input.dashboard.title)}-${safeFilePart(model.dashboardRevisionId)}`;
  const bytes = input.format === "pdf"
    ? makePdf(modelLines(model))
    : makePng(model, { width: 1200, height: 800, title: input.dashboard.title });
  const fileName = `${baseName}.${input.format}`;
  const mimeType = input.format === "pdf" ? PDF_MIME : PNG_MIME;
  return { bytes, fileName, mimeType, result: resultFor(request, bytes, fileName, mimeType, input.format === "png" ? ["dashboard raster snapshot"] : []) };
}

export function generatePresentationExport(input: PresentationExportInput): ExportArtifact {
  const slide = input.target?.type === "slide" && input.target.id
    ? input.presentation.slides.find((item) => item.id === input.target?.id)
    : undefined;
  if (input.target?.type === "slide" && !slide) throw new Error("El slide solicitado no existe en esta presentacion.");
  const slideViewState = slide?.viewState ?? input.viewState;
  const model = buildDashboardModel({ dashboard: input.dashboard, viewState: slideViewState, rows: input.rows, profile: input.profile });
  const presentationRevisionId = presentationExportRevisionId(input.presentation);
  const request = input.request ?? createExportRequest({
    target: input.target ?? { type: "presentation" },
    format: input.format,
    scope: input.scope ?? "private_workspace",
    dashboardId: input.dashboard.id,
    dashboardRevisionId: model.dashboardRevisionId,
    presentationId: input.presentation.id,
    presentationRevisionId,
    filters: slideViewState.filters ?? [],
    actor: input.actor ?? { id: "local-user", role: "editor" },
    allowDownload: input.allowDownload ?? true,
    requestedAt: input.requestedAt
  });
  const baseName = `${safeFilePart(input.presentation.title)}-${safeFilePart(presentationRevisionId)}`;
  if (input.format === "pptx") {
    const bytes = makePptx({ presentation: input.presentation, model });
    const fileName = `${baseName}.pptx`;
    return { bytes, fileName, mimeType: PPTX_MIME, result: resultFor(request, bytes, fileName, PPTX_MIME, ["charts represented as editable summary text and raster-ready placeholders"]) };
  }
  if (input.format === "pdf") {
    const bytes = makePdf([
      input.presentation.title,
      `Presentacion: ${input.presentation.id}`,
      `Revision presentacion: ${presentationRevisionId}`,
      ...modelLines(model),
      ...input.presentation.slides.flatMap((item, index) => ["", `Slide ${index + 1}: ${item.title}`, item.subtitle ?? "", item.narrative ?? "", item.speakerNotes ? `Notas: ${item.speakerNotes}` : ""])
    ]);
    const fileName = `${baseName}.pdf`;
    return { bytes, fileName, mimeType: PDF_MIME, result: resultFor(request, bytes, fileName, PDF_MIME, []) };
  }
  const slideModel = {
    ...model,
    title: slide?.title ?? input.presentation.title,
    subtitle: slide?.subtitle ?? input.presentation.subtitle,
    widgets: slide?.widgetIds.length ? model.widgets.filter((item) => slide.widgetIds.includes(item.widget.id)) : model.widgets.slice(0, 4)
  };
  const bytes = makePng(slideModel, { width: 1280, height: 720, title: slideModel.title });
  const fileName = `${baseName}-${safeFilePart(slide?.id ?? "slide")}.png`;
  return { bytes, fileName, mimeType: PNG_MIME, result: resultFor(request, bytes, fileName, PNG_MIME, ["slide raster snapshot"]) };
}

export function generatePublicDashboardExport(payload: PublicSharedDashboard, format: Extract<ExportFormat, "pdf" | "png">): ExportArtifact {
  const model = buildPublicDashboardModel(payload);
  const request = createExportRequest({
    target: { type: "dashboard" },
    format,
    scope: "public_share",
    dashboardId: payload.dashboard.id,
    dashboardRevisionId: model.dashboardRevisionId,
    filters: payload.viewState.filters ?? [],
    actor: { id: "public-viewer", role: "public" },
    allowDownload: payload.link.allowDownload
  });
  const baseName = `${safeFilePart(payload.dashboard.title)}-${safeFilePart(model.dashboardRevisionId)}`;
  const bytes = format === "pdf" ? makePdf(modelLines(model)) : makePng(model, { width: 1200, height: 800, title: payload.dashboard.title });
  const fileName = `${baseName}.${format}`;
  const mimeType = format === "pdf" ? PDF_MIME : PNG_MIME;
  return { bytes, fileName, mimeType, result: resultFor(request, bytes, fileName, mimeType, format === "png" ? ["public dashboard raster snapshot"] : []) };
}

export function isPng(bytes: Uint8Array) {
  return bytes.length > 24 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
}

export function pngDimensions(bytes: Uint8Array) {
  if (!isPng(bytes)) return null;
  return {
    width: (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19],
    height: (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]
  };
}

export function zipContains(bytes: Uint8Array, text: string) {
  return new TextDecoder().decode(bytes).includes(text);
}

export function pngTextChunks(bytes: Uint8Array) {
  const chunks: string[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    const type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
    if (type === "tEXt") chunks.push(new TextDecoder().decode(bytes.slice(offset + 8, offset + 8 + length)));
    offset += length + 12;
  }
  return chunks;
}

export { crc32 };
