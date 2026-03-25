// Simple in-memory rate limiter for API routes.
//
// LIMITATION: This store is per-process and resets on every deploy/restart.
// In serverless environments (e.g. Vercel), each instance maintains its own
// map, so a client could exceed limits by hitting different instances.
// For single-instance or low-traffic deployments this is acceptable.
//
// TODO: Migrate to Upstash Redis (@upstash/ratelimit) for persistent,
// globally-consistent rate limiting when traffic or security needs grow.

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/** Maximum number of keys kept in the store to prevent unbounded memory growth. */
const MAX_ENTRIES = 10_000;

const store = new Map<string, RateLimitEntry>();

// Clean expired entries periodically and enforce max-entries cap.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }

  // If still over the cap after expiry cleanup, evict the oldest entries
  // (Map iteration order is insertion order).
  if (store.size > MAX_ENTRIES) {
    const excess = store.size - MAX_ENTRIES;
    const iter = store.keys();
    for (let i = 0; i < excess; i++) {
      const { value } = iter.next();
      if (value !== undefined) store.delete(value);
    }
  }
}, 60_000);

interface RateLimitOptions {
  /** Max requests per window */
  limit?: number;
  /** Window duration in seconds */
  windowSeconds?: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  options: RateLimitOptions = {}
): RateLimitResult {
  const { limit = 30, windowSeconds = 60 } = options;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // Evict oldest entry if at capacity (prevents memory leaks between cleanup ticks)
    if (store.size >= MAX_ENTRIES) {
      const firstKey = store.keys().next().value;
      if (firstKey !== undefined) store.delete(firstKey);
    }
    store.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowSeconds * 1000 };
  }

  entry.count++;
  const remaining = Math.max(0, limit - entry.count);

  return {
    allowed: entry.count <= limit,
    remaining,
    resetAt: entry.resetAt,
  };
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
 * const blocked = applyRateLimit(request, "fondos-search", { limit: 30 });
 * if (blocked) return blocked;
 */
export function applyRateLimit(
  request: Request,
  routeKey: string,
  options: RateLimitOptions = {}
): Response | null {
  const ip = getClientIp(request);
  const { allowed, remaining, resetAt } = rateLimit(`${routeKey}:${ip}`, options);

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
