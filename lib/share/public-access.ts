import type { ShareLink } from "@/types/export";

export const PUBLIC_SHARE_TOKEN_BYTES = 24;
export const PUBLIC_SHARE_RATE_LIMIT = 10;

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createPublicShareToken() {
  const bytes = new Uint8Array(PUBLIC_SHARE_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return `share_${hex(bytes)}`;
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return hex(new Uint8Array(digest));
}

export async function hashPublicShareToken(token: string) {
  return sha256Hex(token);
}

export async function hashPublicSharePassword(password: string, salt: string) {
  return sha256Hex(`${password}${salt}`);
}

export function createPasswordSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

export async function verifyPublicSharePassword(input: { password: string; salt: string; expectedHash: string }) {
  return hashPublicSharePassword(input.password, input.salt).then((hash) => hash === input.expectedHash);
}

export function isPublicShareUsable(link: Pick<ShareLink, "expiresAt"> & { isActive?: boolean }, now = Date.now()) {
  if (link.isActive === false) return false;
  return !link.expiresAt || new Date(link.expiresAt).getTime() > now;
}

export function isPublicShareRateLimited(failedAttempts: number, limit = PUBLIC_SHARE_RATE_LIMIT) {
  return failedAttempts >= limit;
}
