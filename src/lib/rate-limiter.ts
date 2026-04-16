/**
 * Rate limiter for API routes.
 *
 * Primary store: in-memory Map (fast, per-process).
 * Durable fallback: CveCache table (shared across processes; survives restarts).
 *
 * The memory store is authoritative while the process is warm. The DB store
 * is used to bootstrap state on cold start and to share counts across PM2
 * workers. We reuse CveCache (key/value/expiresAt schema) to avoid a migration.
 */

import { prisma } from "@/lib/prisma";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Synchronous rate limit check using the in-memory store only. */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, retryAfterSeconds: 0 };
  }

  entry.count++;

  if (entry.count > maxRequests) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  return { allowed: true, remaining: maxRequests - entry.count, retryAfterSeconds: 0 };
}

/**
 * Durable rate limit check. Reconciles with the DB-backed CveCache entry so
 * counters survive process restarts and are shared across PM2 workers. Use
 * this for security-sensitive endpoints (signup, password reset, etc.) where
 * in-memory state alone is insufficient.
 */
export async function checkRateLimitDurable(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const cacheKey = `ratelimit:${key}`;

  // Load persisted state, if any.
  let persisted: RateLimitEntry | null = null;
  try {
    const row = await prisma.cveCache.findUnique({ where: { query: cacheKey } });
    if (row && row.expiresAt.getTime() > now) {
      try {
        const parsed = JSON.parse(row.result) as RateLimitEntry;
        if (typeof parsed.count === "number" && typeof parsed.resetAt === "number") {
          persisted = parsed;
        }
      } catch { /* ignore malformed row */ }
    }
  } catch { /* DB error — fall through to in-memory only */ }

  // Merge persisted state into memory so both views stay coherent.
  const memEntry = store.get(key);
  let current: RateLimitEntry;
  if (persisted && (!memEntry || persisted.resetAt > memEntry.resetAt || persisted.count > memEntry.count)) {
    current = { count: persisted.count, resetAt: persisted.resetAt };
  } else if (memEntry && memEntry.resetAt > now) {
    current = memEntry;
  } else {
    current = { count: 0, resetAt: now + windowMs };
  }

  current.count++;
  store.set(key, current);

  // Persist the updated counter; expire the row at resetAt.
  prisma.cveCache
    .upsert({
      where: { query: cacheKey },
      update: { result: JSON.stringify(current), expiresAt: new Date(current.resetAt) },
      create: {
        query: cacheKey,
        result: JSON.stringify(current),
        expiresAt: new Date(current.resetAt),
      },
    })
    .catch(() => { /* persistence failure is non-fatal — memory store remains authoritative */ });

  if (current.count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
    };
  }
  return {
    allowed: true,
    remaining: maxRequests - current.count,
    retryAfterSeconds: 0,
  };
}
