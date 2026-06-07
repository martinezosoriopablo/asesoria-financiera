// lib/prices/circuit-breaker.ts

interface CircuitBreakerConfig {
  maxCalls: number;
  windowMs: number;
}

export class CircuitBreaker {
  private calls: number[] = [];
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  private pruneOld(): void {
    const cutoff = Date.now() - this.config.windowMs;
    this.calls = this.calls.filter((t) => t > cutoff);
  }

  canCall(): boolean {
    this.pruneOld();
    return this.calls.length < this.config.maxCalls;
  }

  recordCall(): void {
    this.calls.push(Date.now());
  }

  remaining(): number {
    this.pruneOld();
    return Math.max(0, this.config.maxCalls - this.calls.length);
  }
}
