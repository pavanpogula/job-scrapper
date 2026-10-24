/**
 * @file Unit tests for Circuit Breaker and Budget Exhaustion tracker
 * @summary Validates breaker state transitions, probe behavior, and budget limit detection (P2-T02)
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CircuitBreaker } from '../../src/api/cache/Breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 30000 });
  });

  it('starts in CLOSED state and reports ok', () => {
    expect(breaker.isOpen()).toBe(false);
    expect(breaker.isBudgetExhausted()).toBe(false);
    expect(breaker.getState()).toBe('ok');
  });

  it('remains closed when errors are below threshold', () => {
    breaker.recordFailure(new Error('Connection timeout'));
    expect(breaker.isOpen()).toBe(false);
    expect(breaker.getState()).toBe('ok');

    breaker.recordFailure(new Error('ECONNRESET'));
    expect(breaker.isOpen()).toBe(false);
    expect(breaker.getState()).toBe('ok');

    breaker.recordSuccess();
    expect(breaker.isOpen()).toBe(false);
  });

  it('opens circuit after 3 consecutive failures', () => {
    breaker.recordFailure(new Error('err 1'));
    breaker.recordFailure(new Error('err 2'));
    breaker.recordFailure(new Error('err 3'));

    expect(breaker.isOpen()).toBe(true);
    expect(breaker.getState()).toBe('circuit_open');
  });

  it('transitions to HALF_OPEN probe after cooldownMs expires', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    breaker.recordFailure(new Error('err 1'));
    breaker.recordFailure(new Error('err 2'));
    breaker.recordFailure(new Error('err 3'));
    expect(breaker.isOpen()).toBe(true);

    // Advance time past 30s cooldown
    jest.spyOn(Date, 'now').mockReturnValue(now + 30001);

    // In HALF_OPEN, allows one probe
    expect(breaker.allowProbe()).toBe(true);
    // Subsequent probe attempts during half-open before resolution return false
    expect(breaker.allowProbe()).toBe(false);

    // Successful probe closes the breaker
    breaker.recordSuccess();
    expect(breaker.isOpen()).toBe(false);
    expect(breaker.getState()).toBe('ok');
  });

  it('re-opens circuit if probe in HALF_OPEN fails', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    breaker.recordFailure(new Error('err 1'));
    breaker.recordFailure(new Error('err 2'));
    breaker.recordFailure(new Error('err 3'));

    // Advance past cooldown
    jest.spyOn(Date, 'now').mockReturnValue(now + 30001);
    expect(breaker.allowProbe()).toBe(true);

    // Failed probe re-opens circuit
    breaker.recordFailure(new Error('probe failed'));
    expect(breaker.isOpen()).toBe(true);
    expect(breaker.getState()).toBe('circuit_open');
  });

  it('detects Upstash max daily/monthly request limits and marks budget exhausted until UTC midnight', () => {
    breaker.recordFailure(new Error('OOM command not allowed: max daily request limit exceeded'));

    expect(breaker.isBudgetExhausted()).toBe(true);
    expect(breaker.isOpen()).toBe(true);
    expect(breaker.getState()).toBe('budget_exhausted');
  });

  it('detects max concurrent connections exceeded and trips budget exhaustion', () => {
    breaker.recordFailure(new Error('ERR max concurrent connections exceeded'));

    expect(breaker.isBudgetExhausted()).toBe(true);
    expect(breaker.isOpen()).toBe(true);
    expect(breaker.getState()).toBe('budget_exhausted');
  });

  it('supports manual reset', () => {
    breaker.recordFailure(new Error('max daily request limit exceeded'));
    expect(breaker.isOpen()).toBe(true);

    breaker.reset();
    expect(breaker.isOpen()).toBe(false);
    expect(breaker.isBudgetExhausted()).toBe(false);
    expect(breaker.getState()).toBe('ok');
  });
});
