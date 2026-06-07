import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CircuitBreaker } from "./circuit-breaker";

describe("CircuitBreaker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows calls when under limit", () => {
    const cb = new CircuitBreaker({ maxCalls: 3, windowMs: 60000 });
    expect(cb.canCall()).toBe(true);
    cb.recordCall();
    cb.recordCall();
    expect(cb.canCall()).toBe(true);
  });

  it("blocks calls when limit reached", () => {
    const cb = new CircuitBreaker({ maxCalls: 2, windowMs: 60000 });
    cb.recordCall();
    cb.recordCall();
    expect(cb.canCall()).toBe(false);
  });

  it("resets after window expires", () => {
    const cb = new CircuitBreaker({ maxCalls: 2, windowMs: 60000 });
    cb.recordCall();
    cb.recordCall();
    expect(cb.canCall()).toBe(false);
    vi.advanceTimersByTime(61000);
    expect(cb.canCall()).toBe(true);
  });

  it("remaining returns correct count", () => {
    const cb = new CircuitBreaker({ maxCalls: 5, windowMs: 60000 });
    cb.recordCall();
    cb.recordCall();
    expect(cb.remaining()).toBe(3);
  });
});
