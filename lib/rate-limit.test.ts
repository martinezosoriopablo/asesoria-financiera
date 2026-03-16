import { describe, it, expect, beforeEach, vi } from "vitest";
import { rateLimit, getClientIp, applyRateLimit } from "./rate-limit";

// Reset the module between tests to clear the in-memory store
beforeEach(async () => {
  vi.resetModules();
});

describe("rateLimit", () => {
  it("allows first request", () => {
    const result = rateLimit("test-first", { limit: 5, windowSeconds: 60 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("decrements remaining on each call", () => {
    const key = "test-decrement-" + Date.now();
    const r1 = rateLimit(key, { limit: 3, windowSeconds: 60 });
    const r2 = rateLimit(key, { limit: 3, windowSeconds: 60 });
    const r3 = rateLimit(key, { limit: 3, windowSeconds: 60 });

    expect(r1.remaining).toBe(2);
    expect(r2.remaining).toBe(1);
    expect(r3.remaining).toBe(0);
    expect(r3.allowed).toBe(true);
  });

  it("blocks after limit is exceeded", () => {
    const key = "test-block-" + Date.now();
    for (let i = 0; i < 3; i++) {
      rateLimit(key, { limit: 3, windowSeconds: 60 });
    }
    const result = rateLimit(key, { limit: 3, windowSeconds: 60 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("uses default limit of 30", () => {
    const key = "test-default-" + Date.now();
    const result = rateLimit(key);
    expect(result.remaining).toBe(29);
  });
});

describe("getClientIp", () => {
  it("extracts IP from x-forwarded-for header", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(request)).toBe("1.2.3.4");
  });

  it("returns unknown when no forwarded header", () => {
    const request = new Request("http://localhost");
    expect(getClientIp(request)).toBe("unknown");
  });
});

describe("applyRateLimit", () => {
  it("returns null when under limit", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "10.0.0.1" },
    });
    const result = applyRateLimit(request, "test-apply-" + Date.now(), { limit: 5 });
    expect(result).toBeNull();
  });

  it("returns 429 response when limit exceeded", async () => {
    const ip = "10.0.0.2";
    const key = "test-429-" + Date.now();
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": ip },
    });

    // Exhaust the limit
    for (let i = 0; i < 2; i++) {
      applyRateLimit(request, key, { limit: 2, windowSeconds: 60 });
    }

    const result = applyRateLimit(request, key, { limit: 2, windowSeconds: 60 });
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);

    const body = await result!.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Demasiadas solicitudes");
  });

  it("includes Retry-After header on 429", async () => {
    const key = "test-headers-" + Date.now();
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "10.0.0.3" },
    });

    applyRateLimit(request, key, { limit: 1, windowSeconds: 60 });
    const result = applyRateLimit(request, key, { limit: 1, windowSeconds: 60 });

    expect(result).not.toBeNull();
    expect(result!.headers.get("Retry-After")).toBeTruthy();
    expect(result!.headers.get("X-RateLimit-Remaining")).toBe("0");
  });
});
