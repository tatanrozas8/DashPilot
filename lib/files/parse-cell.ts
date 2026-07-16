import type { CellParseStatus, DataRow, NormalizedColumn, ParsedCellAudit, ParsedCellType } from "@/types/dataset";
import { slugify } from "@/lib/utils";

export interface CellParseResult {
  value: DataRow[string];
  status: CellParseStatus;
  detectedType: ParsedCellType;
  message?: string;
  audited: boolean;
}

const currencyPattern = /\b(CLP|USD|EUR|GBP|ARS|PEN|MXN|COP|BRL)\b|\$/i;
const dateHints = ["fecha", "date", "periodo", "dia", "day"];
const datetimeHints = ["hora", "time", "timestamp", "datetime"];
const numericHints = ["venta", "sales", "revenue", "costo", "precio", "monto", "total", "ingreso", "cantidad", "qty", "amount", "valor"];
const percentHints = ["porcentaje", "percent", "margen", "descuento", "tasa", "ratio", "%"];

function columnCorpus(column: NormalizedColumn) {
  return slugify(`${column.originalName} ${column.displayName} ${column.normalizedName}`);
}

function hasAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

export function expectedColumnKind(column: NormalizedColumn): "date" | "datetime" | "percentage" | "currency" | "number" | "unknown" {
  const corpus = columnCorpus(column);
  if (hasAny(corpus, datetimeHints)) return "datetime";
  if (hasAny(corpus, dateHints)) return "date";
  if (hasAny(corpus, percentHints)) return "percentage";
  if (currencyPattern.test(`${column.originalName} ${column.displayName}`)) return "currency";
  if (hasAny(corpus, numericHints)) return "number";
  return "unknown";
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateParts(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function validDateParts(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function formatDateObject(value: Date) {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth() + 1;
  const day = value.getUTCDate();
  const hours = value.getUTCHours();
  const minutes = value.getUTCMinutes();
  const seconds = value.getUTCSeconds();
  if (hours || minutes || seconds) return `${formatDateParts(year, month, day)}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return formatDateParts(year, month, day);
}

function excelSerialToDate(value: number): { normalized: string; type: "date" | "datetime" } | null {
  if (!Number.isFinite(value) || value < 25_000 || value > 80_000) return null;
  const wholeDays = Math.floor(value);
  const fraction = value - wholeDays;
  const millis = Math.round((wholeDays - 25_569) * 86_400_000 + fraction * 86_400_000);
  const date = new Date(millis);
  const normalized = `${formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())}${fraction ? `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}` : ""}`;
  return { normalized, type: fraction ? "datetime" : "date" };
}

function parseIsoDate(text: string): { status: "parsed"; value: string; type: "date" | "datetime" } | null {
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!validDateParts(year, month, day)) return null;
  if (match[4]) {
    return { status: "parsed", value: `${formatDateParts(year, month, day)}T${pad(Number(match[4]))}:${pad(Number(match[5]))}:${pad(Number(match[6] ?? 0))}`, type: "datetime" };
  }
  return { status: "parsed", value: formatDateParts(year, month, day), type: "date" };
}

function parseSlashDate(text: string): { status: "parsed" | "ambiguous"; value: string; type: "date" | "datetime"; message?: string } | null {
  const match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const hasTime = Boolean(match[4]);
  if (first <= 12 && second <= 12) {
    return {
      status: "ambiguous",
      value: text,
      type: hasTime ? "datetime" : "date",
      message: `Fecha ambigua "${text}": podria ser DD/MM/YYYY o MM/DD/YYYY. Corrige el tipo o formato antes de generar el dashboard.`
    };
  }
  const day = first > 12 ? first : second;
  const month = first > 12 ? second : first;
  if (!validDateParts(year, month, day)) return null;
  const date = formatDateParts(year, month, day);
  if (!hasTime) return { status: "parsed", value: date, type: "date" };
  return { status: "parsed", value: `${date}T${pad(Number(match[4]))}:${pad(Number(match[5]))}:${pad(Number(match[6] ?? 0))}`, type: "datetime" };
}

function parseDateText(text: string) {
  return parseIsoDate(text) ?? parseSlashDate(text);
}

function parseBoolean(text: string): boolean | null {
  const normalized = slugify(text);
  if (["true", "si", "yes", "y"].includes(normalized)) return true;
  if (["false", "no", "n"].includes(normalized)) return false;
  return null;
}

function parseLocaleNumberForImport(value: string): { value: number; type: "number" | "currency" | "percentage" } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isPercent = trimmed.includes("%");
  const isCurrency = currencyPattern.test(trimmed);
  const withoutCurrency = trimmed.replace(currencyPattern, "");
  const hasUnexpectedLetters = /[A-Za-zÀ-ÿ]/.test(withoutCurrency.replace(/[eE][+-]?\d+$/, ""));
  if (hasUnexpectedLetters) return null;
  const signed = withoutCurrency.replace(/[^\d,.\-+]/g, "").replace(/(?!^)[-+]/g, "");
  if (!signed || signed === "-" || signed === "+") return null;
  const commaIndex = signed.lastIndexOf(",");
  const dotIndex = signed.lastIndexOf(".");
  let normalized = signed;
  if (commaIndex >= 0 && dotIndex >= 0) {
    const decimalSeparator = commaIndex > dotIndex ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = signed.replaceAll(thousandsSeparator, "").replace(decimalSeparator, ".");
  } else if (commaIndex >= 0) {
    const decimals = signed.length - commaIndex - 1;
    normalized = decimals > 0 && decimals <= 2 ? signed.replaceAll(".", "").replace(",", ".") : signed.replaceAll(",", "");
  } else if (dotIndex >= 0) {
    const decimals = signed.length - dotIndex - 1;
    const integerPart = signed.slice(0, dotIndex).replace(/[-+]/g, "");
    normalized = decimals === 3 && integerPart.length <= 3 ? signed.replaceAll(".", "") : signed;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  if (isPercent) return { value: parsed / 100, type: "percentage" };
  return { value: parsed, type: isCurrency ? "currency" : "number" };
}

export function parseCellValue(raw: unknown, column: NormalizedColumn): CellParseResult {
  const expected = expectedColumnKind(column);
  if (raw === undefined || raw === null || raw === "") return { value: null, status: "empty", detectedType: "empty", audited: false };
  if (raw instanceof Date) {
    const normalized = formatDateObject(raw);
    const type = normalized.includes("T") ? "datetime" : "date";
    return { value: normalized, status: "parsed", detectedType: type, message: "Fecha de Excel normalizada sin aplicar zona horaria local.", audited: true };
  }
  if (typeof raw === "boolean") return { value: raw, status: "raw", detectedType: "boolean", audited: false };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { value: null, status: "invalid", detectedType: "unknown", message: "Numero no finito descartado.", audited: true };
    if (expected === "date" || expected === "datetime") {
      const serial = excelSerialToDate(raw);
      if (serial) return { value: serial.normalized, status: "parsed", detectedType: serial.type, message: "Fecha serial de Excel normalizada.", audited: true };
    }
    return { value: raw, status: "raw", detectedType: "number", audited: false };
  }

  const text = String(raw).trim();
  if (!text) return { value: null, status: "empty", detectedType: "empty", audited: false };
  const booleanValue = parseBoolean(text);
  if (booleanValue !== null) return { value: booleanValue, status: "parsed", detectedType: "boolean", audited: true };

  const date = parseDateText(text);
  if (date?.status === "parsed") {
    return { value: date.value, status: "parsed", detectedType: date.type, message: "Fecha normalizada a formato canonico.", audited: true };
  }
  if (date?.status === "ambiguous") {
    return { value: text, status: "ambiguous", detectedType: date.type, message: date.message, audited: true };
  }

  const number = parseLocaleNumberForImport(text);
  if (number) {
    return { value: number.value, status: "parsed", detectedType: number.type, message: `${number.type === "percentage" ? "Porcentaje" : number.type === "currency" ? "Moneda" : "Numero"} normalizado con separadores de locale.`, audited: true };
  }

  if (expected !== "unknown") {
    return { value: text, status: "invalid", detectedType: "string", message: `Valor no compatible con el tipo esperado ${expected}.`, audited: true };
  }
  return { value: text, status: "raw", detectedType: "string", audited: false };
}

export function toCellAudit(input: { rowIndex: number; column: NormalizedColumn; raw: unknown; parsed: CellParseResult }): ParsedCellAudit {
  return {
    rowIndex: input.rowIndex,
    columnId: input.column.normalizedName,
    originalName: input.column.originalName,
    rawValue: input.raw instanceof Date ? input.raw.toISOString() : String(input.raw ?? ""),
    normalizedValue: input.parsed.value,
    status: input.parsed.status,
    detectedType: input.parsed.detectedType,
    message: input.parsed.message ?? "Valor normalizado."
  };
}
