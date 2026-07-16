"use client";

import { z } from "zod";

export const DASH_PILOT_PERSIST_KEY = "dashpilot-mvp";
export const DASH_PILOT_PERSIST_VERSION = 3;
export const DASH_PILOT_PERSIST_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const LOCAL_SANDBOX_STORAGE_KEY = "dashpilot:local-sandbox:unsafe-storage";

const unsafeExactKeys = new Set([
  "dashpilot:sync-outbox"
]);

const unsafePrefixes = [
  "dashpilot:dataset:",
  "dashpilot:dashboard:",
  "dashpilot:presentation:",
  "dashpilot:share:"
];

const storageLocationSchema = z.enum(["localStorage", "sessionStorage", "indexedDB"]);
const storageExposureSchema = z.object({
  location: storageLocationSchema,
  key: z.string(),
  matched: z.string()
});

export type StorageExposure = z.infer<typeof storageExposureSchema>;

export const browserStoragePolicy = {
  persistedState: "Only IDs, visual preferences, share form preferences and non-sensitive UI state may be persisted.",
  prohibited: "Raw rows, workbook sheets, dataset previews, profile samples, provider replies, prompts, tokens and full specs must stay out of persistent browser storage.",
  localSandbox: "Local/demo mode is an in-memory sandbox by default. IndexedDB is not used as enterprise-secure storage and would require explicit sandbox opt-in.",
  ttlMs: DASH_PILOT_PERSIST_TTL_MS
} as const;

function storageKeys(storage: Storage) {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => Boolean(key));
}

function isUnsafeKey(key: string) {
  return unsafeExactKeys.has(key) || unsafePrefixes.some((prefix) => key.startsWith(prefix));
}

export function isLocalSandboxStorageOptedIn() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(LOCAL_SANDBOX_STORAGE_KEY) === "enabled";
}

export function purgeSensitiveBrowserStorage() {
  if (typeof window === "undefined") return [];
  const removed: string[] = [];
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of storageKeys(storage)) {
      if (isUnsafeKey(key)) {
        storage.removeItem(key);
        removed.push(key);
      }
    }
  }
  return removed;
}

export function purgeDashPilotBrowserState() {
  if (typeof window === "undefined") return [];
  const removed = purgeSensitiveBrowserStorage();
  if (window.localStorage.getItem(DASH_PILOT_PERSIST_KEY) !== null) {
    window.localStorage.removeItem(DASH_PILOT_PERSIST_KEY);
    removed.push(DASH_PILOT_PERSIST_KEY);
  }
  return removed;
}

export function purgeExpiredPersistedState(now = Date.now()) {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(DASH_PILOT_PERSIST_KEY);
  if (!raw) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(DASH_PILOT_PERSIST_KEY);
    return true;
  }
  const envelope = persistedEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    window.localStorage.removeItem(DASH_PILOT_PERSIST_KEY);
    return true;
  }
  const expiresAt = envelope.data.state.browserStorageExpiresAt;
  if (expiresAt && new Date(expiresAt).getTime() <= now) {
    window.localStorage.removeItem(DASH_PILOT_PERSIST_KEY);
    return true;
  }
  return false;
}

const persistedEnvelopeSchema = z.object({
  state: z.object({
    browserStorageExpiresAt: z.string().optional()
  }),
  version: z.number().optional()
});

function collectStorageExposures(storage: Storage, location: "localStorage" | "sessionStorage", forbiddenNeedles: string[]) {
  const findings: StorageExposure[] = [];
  for (const key of storageKeys(storage)) {
    const value = storage.getItem(key) ?? "";
    for (const needle of forbiddenNeedles) {
      if (key.includes(needle) || value.includes(needle)) {
        findings.push(storageExposureSchema.parse({ location, key, matched: needle }));
      }
    }
  }
  return findings;
}

export async function inspectBrowserStorageForSensitiveText(forbiddenNeedles: string[]) {
  const findings: StorageExposure[] = [];
  if (typeof window === "undefined") return findings;
  findings.push(...collectStorageExposures(window.localStorage, "localStorage", forbiddenNeedles));
  findings.push(...collectStorageExposures(window.sessionStorage, "sessionStorage", forbiddenNeedles));
  if ("indexedDB" in window && window.indexedDB && typeof window.indexedDB.databases === "function") {
    const databases = await window.indexedDB.databases();
    for (const database of databases) {
      const name = database.name ?? "";
      for (const needle of forbiddenNeedles) {
        if (name.includes(needle)) findings.push(storageExposureSchema.parse({ location: "indexedDB", key: name, matched: needle }));
      }
    }
  }
  return findings;
}
