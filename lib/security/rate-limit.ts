export interface RateLimitRule {
  windowMs: number;
  max: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: string;
  retryAfterMs: number;
}

interface Bucket {
  count: number;
  resetAtMs: number;
}

const buckets = new Map<string, Bucket>();

export const apiRateLimitRules = {
  copilot: { windowMs: 60_000, max: 30 },
  query: { windowMs: 60_000, max: 60 },
  export: { windowMs: 60_000, max: 20 },
  publicShare: { windowMs: 60_000, max: 120 }
} satisfies Record<string, RateLimitRule>;

export function clearRateLimitBuckets() {
  buckets.clear();
}

export function checkRateLimit(key: string, rule: RateLimitRule, nowMs = Date.now()): RateLimitDecision {
  const current = buckets.get(key);
  const bucket = current && current.resetAtMs > nowMs
    ? current
    : { count: 0, resetAtMs: nowMs + rule.windowMs };
  bucket.count += 1;
  buckets.set(key, bucket);
  const remaining = Math.max(0, rule.max - bucket.count);
  const allowed = bucket.count <= rule.max;
  return {
    allowed,
    limit: rule.max,
    remaining,
    resetAt: new Date(bucket.resetAtMs).toISOString(),
    retryAfterMs: allowed ? 0 : Math.max(0, bucket.resetAtMs - nowMs)
  };
}
