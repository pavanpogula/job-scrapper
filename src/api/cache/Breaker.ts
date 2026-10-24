/**
 * @file Circuit breaker and budget exhaustion manager for cache read-through
 * @summary Per-instance circuit breaker protecting API against Redis outages and Upstash rate limits
 * @tags cache, redis, circuit-breaker, budget
 */

export type BreakerState = 'ok' | 'circuit_open' | 'budget_exhausted';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
}

const BUDGET_LIMIT_REGEX = /max (daily |monthly )?requests? limit/i;
const CONCURRENT_CONN_REGEX = /max concurrent connections exceeded/i;

/**
 * Circuit breaker protecting Redis cache reads from cascading failures and budget limits.
 */
export class CircuitBreaker {
  private failureThreshold: number;
  private cooldownMs: number;
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private probeInFlight = false;
  private budgetExhaustedUntil: number | null = null;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 30000;
  }

  /**
   * Checks whether the Upstash daily/monthly budget is exhausted.
   */
  public isBudgetExhausted(): boolean {
    if (this.budgetExhaustedUntil === null) return false;
    if (Date.now() >= this.budgetExhaustedUntil) {
      this.budgetExhaustedUntil = null;
      return false;
    }
    return true;
  }

  /**
   * Checks whether the breaker is currently open (blocking Redis queries).
   */
  public isOpen(): boolean {
    if (this.isBudgetExhausted()) return true;

    if (this.consecutiveFailures >= this.failureThreshold) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed < this.cooldownMs) {
        return true;
      }
      // Cooldown expired, allows a single probe through allowProbe()
      return !this.probeInFlight;
    }

    return false;
  }

  /**
   * In HALF_OPEN state, allows a single probe request through to test Redis.
   */
  public allowProbe(): boolean {
    if (this.isBudgetExhausted()) return false;

    if (this.consecutiveFailures >= this.failureThreshold) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.cooldownMs && !this.probeInFlight) {
        this.probeInFlight = true;
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * Records a successful Redis interaction.
   */
  public recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.probeInFlight = false;
  }

  /**
   * Records a failed Redis interaction.
   * Checks for budget exhaustion errors and trips breaker accordingly.
   * @param err Error thrown by Redis operation
   */
  public recordFailure(err: unknown): void {
    const errMsg = (err instanceof Error ? err.message : String(err)) || '';

    // Check for Upstash rate limit exhaustion or connection limit
    if (BUDGET_LIMIT_REGEX.test(errMsg) || CONCURRENT_CONN_REGEX.test(errMsg)) {
      const now = new Date();
      // Set to next UTC midnight
      const nextUtcMidnight = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
      ).getTime();
      this.budgetExhaustedUntil = nextUtcMidnight;
      this.lastFailureTime = Date.now();
      this.probeInFlight = false;
      return;
    }

    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    this.probeInFlight = false;
  }

  /**
   * Returns current health state of the cache client.
   */
  public getState(): BreakerState {
    if (this.isBudgetExhausted()) return 'budget_exhausted';
    if (this.consecutiveFailures >= this.failureThreshold) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed < this.cooldownMs) {
        return 'circuit_open';
      }
    }
    return 'ok';
  }

  /**
   * Resets breaker to pristine closed state.
   */
  public reset(): void {
    this.consecutiveFailures = 0;
    this.lastFailureTime = 0;
    this.probeInFlight = false;
    this.budgetExhaustedUntil = null;
  }
}

export const breaker = new CircuitBreaker();
