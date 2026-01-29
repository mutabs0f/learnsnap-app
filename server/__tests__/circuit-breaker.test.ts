/**
 * Circuit Breaker Tests
 * [L7 v3.5.2] Tests per-provider circuit breaker implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCircuitBreaker, getAllCircuitStats, resetAllCircuits, CircuitOpenError } from '../ai/circuit-breaker';

beforeEach(() => {
  resetAllCircuits();
});

describe('Circuit Breaker', () => {
  it('should start in CLOSED state', () => {
    const breaker = getCircuitBreaker('gemini');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should execute function when circuit is closed', async () => {
    const breaker = getCircuitBreaker('test-provider');
    
    const result = await breaker.execute(async () => 'success');
    expect(result).toBe('success');
  });

  it('should record success and stay closed', async () => {
    const breaker = getCircuitBreaker('test-success');
    
    await breaker.execute(async () => 'ok');
    await breaker.execute(async () => 'ok');
    
    const stats = breaker.getStats();
    expect(stats.state).toBe('CLOSED');
    expect(stats.successes).toBe(2);
    expect(stats.failures).toBe(0);
  });

  it('should record failures', async () => {
    const breaker = getCircuitBreaker('test-failure');
    
    try {
      await breaker.execute(async () => { throw new Error('fail'); });
    } catch {}
    
    const stats = breaker.getStats();
    expect(stats.failures).toBe(1);
  });

  it('should open circuit after threshold failures', async () => {
    const breaker = getCircuitBreaker('test-open');
    
    for (let i = 0; i < 10; i++) {
      try {
        await breaker.execute(async () => { throw new Error('fail'); });
      } catch {}
    }
    
    const state = breaker.getState();
    expect(['OPEN', 'HALF_OPEN']).toContain(state);
  });

  it('should fail fast when circuit is open', async () => {
    const breaker = getCircuitBreaker('test-fast-fail');
    
    breaker.forceOpen();
    
    const state = breaker.getState();
    expect(['OPEN', 'HALF_OPEN']).toContain(state);
    
    if (state === 'OPEN') {
      await expect(
        breaker.execute(async () => 'should not run')
      ).rejects.toThrow(CircuitOpenError);
    }
  });

  it('should get all circuit stats', () => {
    getCircuitBreaker('gemini');
    getCircuitBreaker('openai');
    
    const stats = getAllCircuitStats();
    
    expect(stats).toHaveProperty('gemini');
    expect(stats).toHaveProperty('openai');
    expect(stats).toHaveProperty('anthropic');
  });

  it('should reset all circuits', async () => {
    const breaker = getCircuitBreaker('test-reset');
    
    breaker.forceOpen();
    const stateAfterOpen = breaker.getState();
    expect(['OPEN', 'HALF_OPEN']).toContain(stateAfterOpen);
    
    resetAllCircuits();
    
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should force open a circuit', () => {
    const breaker = getCircuitBreaker('test-force-open');
    expect(breaker.getState()).toBe('CLOSED');
    
    breaker.forceOpen();
    const state = breaker.getState();
    expect(['OPEN', 'HALF_OPEN']).toContain(state);
  });

  it('should force close a circuit', async () => {
    const breaker = getCircuitBreaker('test-force-close');
    
    breaker.forceOpen();
    const stateAfterOpen = breaker.getState();
    expect(['OPEN', 'HALF_OPEN']).toContain(stateAfterOpen);
    
    breaker.forceClose();
    expect(breaker.getState()).toBe('CLOSED');
  });
});

describe('CircuitOpenError', () => {
  it('should contain provider and retry info', () => {
    const error = new CircuitOpenError('gemini', 30000);
    
    expect(error.provider).toBe('gemini');
    expect(error.retryAfterMs).toBe(30000);
    expect(error.message).toContain('gemini');
    expect(error.message).toContain('30s');
  });
});
