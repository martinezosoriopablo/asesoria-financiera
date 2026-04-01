// Rate limiter for API routes.
//
// Uses Upstash Redis when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
// are configured, providing globally-consistent rate limiting across serverless
// instances. Falls back to in-memory store when Redis is not available.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// In-memory fallback (for local dev or when Redis is not configured)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const MAX_ENTRIES = 10_000;
const memoryStore = new Map<string, RateLimitEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (now > entry.resetAt) memoryStore.delete(key);
  }
  if (memoryStore.size > MAX_ENTRIES) {
    const excess = memoryStore.size - MAX_ENTRIES;
    const iter = memoryStore.keys();
    for (let i = 0; i < excess; i++) {
      const { value } = iter.next();
      if (value !== undefined) memoryStore.delete(value);
    }
  }
}, 60_000);

function memoryRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || now > entry.resetAt) {
    if (memoryStore.size >= MAX_ENTRIES) {
      const firstKey = memoryStore.keys().next().value;
      if (firstKey !== undefined) memoryStore.delete(firstKey);
    }
    memoryStore.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowSeconds * 1000 };
  }

  entry.count++;
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt,
  };
}

// ---------------------------------------------------------------------------
// Upstash Redis rate limiter (lazy-initialized)
// ---------------------------------------------------------------------------

let redis: Redis | null = null;
let useUpstash = false;

// Cache of Ratelimit instances per unique limit+window combo
const upstashLimiters = new Map<string, Ratelimit>();

function getUpstashLimiter(limit: number, windowSeconds: number): Ratelimit {
  const cacheKey = `${limit}:${windowSeconds}`;
  let limiter = upstashLimiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      prefix: "rl",
    });
    upstashLimiters.set(cacheKey, limiter);
  }
  return limiter;
}

// Initialize on first use
function initUpstash(): boolean {
  if (redis) return true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      redis = new Redis({ url, token });
      useUpstash = true;
      return true;
    } catch {
      console.warn("Failed to initialize Upstash Redis, falling back to in-memory rate limiting");
      return false;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API (same interface as before, now async)
// ---------------------------------------------------------------------------

interface RateLimitOptions {
  /** Max requests per window */
  limit?: number;
  /** Window duration in seconds */
  windowSeconds?: number;
}

/**
 * Extract a rate-limit key from a Request.
 * Uses x-forwarded-for header or falls back to a generic key.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

/**
 * Apply rate limiting to an API route. Returns a 429 response if limit exceeded, null otherwise.
 *
 * @example
 * const blocked = await applyRateLimit(request, "fondos-search", { limit: 30 });
 * if (blocked) return blocked;
 */
export async function applyRateLimit(
  request: Request,
  routeKey: string,
  options: RateLimitOptions = {}
): Promise<Response | null> {
  const { limit = 30, windowSeconds = 60 } = options;
  const ip = getClientIp(request);
  const key = `${routeKey}:${ip}`;

  let allowed: boolean;
  let remaining: number;
  let resetAt: number;

  // Try Upstash first
  initUpstash();
  if (useUpstash) {
    try {
      const limiter = getUpstashLimiter(limit, windowSeconds);
      const result = await limiter.limit(key);
      allowed = result.success;
      remaining = result.remaining;
      resetAt = result.reset;
    } catch {
      // Redis error — fall back to memory
      const result = memoryRateLimit(key, limit, windowSeconds);
      allowed = result.allowed;
      remaining = result.remaining;
      resetAt = result.resetAt;
    }
  } else {
    const result = memoryRateLimit(key, limit, windowSeconds);
    allowed = result.allowed;
    remaining = result.remaining;
    resetAt = result.resetAt;
  }

  if (!allowed) {
    return new Response(
      JSON.stringify({ success: false, error: "Demasiadas solicitudes. Intente de nuevo más tarde." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
          "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  return null;
}

// Keep the low-level function exported for tests
export function rateLimit(key: string, options: RateLimitOptions = {}) {
  const { limit = 30, windowSeconds = 60 } = options;
  return memoryRateLimit(key, limit, windowSeconds);
}
