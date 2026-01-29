/**
 * Circuit Breaker for AI Provider Resilience
 * 
 * Prevents cascade failures when AI providers are down.
 * Implements a simple in-memory circuit breaker pattern.
 */

import logger from './logger.js';
import { metrics } from './metrics.js';

interface CircuitState {
  failures: number;
  lastFailure: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  degradedUntil: number;
}

const FAILURE_THRESHOLD = 3;
const DEGRADED_DURATION_MS = 3 * 60 * 1000;
const RESET_TIMEOUT_MS = 5 * 60 * 1000;

class CircuitBreaker {
  private circuits: Map<string, CircuitState> = new Map();

  private getOrCreate(provider: string): CircuitState {
    if (!this.circuits.has(provider)) {
      this.circuits.set(provider, {
        failures: 0,
        lastFailure: 0,
        state: 'CLOSED',
        degradedUntil: 0,
      });
    }
    return this.circuits.get(provider)!;
  }

  isAvailable(provider: string): boolean {
    const circuit = this.getOrCreate(provider);
    const now = Date.now();

    if (circuit.state === 'OPEN') {
      if (now > circuit.degradedUntil) {
        circuit.state = 'HALF_OPEN';
        logger.info(`Circuit breaker ${provider}: OPEN -> HALF_OPEN`);
        return true;
      }
      return false;
    }

    if (now > circuit.lastFailure + RESET_TIMEOUT_MS) {
      circuit.failures = 0;
      circuit.state = 'CLOSED';
    }

    return true;
  }

  isDegraded(provider: string): boolean {
    const circuit = this.getOrCreate(provider);
    return circuit.state === 'OPEN' || circuit.state === 'HALF_OPEN';
  }

  recordSuccess(provider: string): void {
    const circuit = this.getOrCreate(provider);
    
    if (circuit.state === 'HALF_OPEN') {
      circuit.state = 'CLOSED';
      circuit.failures = 0;
      logger.info(`Circuit breaker ${provider}: HALF_OPEN -> CLOSED (recovered)`);
    }
  }

  recordFailure(provider: string): void {
    const circuit = this.getOrCreate(provider);
    const now = Date.now();

    circuit.failures++;
    circuit.lastFailure = now;
    metrics.recordProviderFailure();

    if (circuit.failures >= FAILURE_THRESHOLD && circuit.state !== 'OPEN') {
      circuit.state = 'OPEN';
      circuit.degradedUntil = now + DEGRADED_DURATION_MS;
      metrics.recordProviderDegraded();
      logger.warn(`Circuit breaker ${provider}: CLOSED -> OPEN (${circuit.failures} failures)`);
    }

    logger.debug(`Circuit breaker ${provider}: failure recorded`, {
      failures: circuit.failures,
      state: circuit.state,
    });
  }

  getStatus(): Record<string, { state: string; failures: number }> {
    const status: Record<string, { state: string; failures: number }> = {};
    this.circuits.forEach((circuit, provider) => {
      status[provider] = {
        state: circuit.state,
        failures: circuit.failures,
      };
    });
    return status;
  }

  reset(provider?: string): void {
    if (provider) {
      this.circuits.delete(provider);
    } else {
      this.circuits.clear();
    }
    logger.info('Circuit breaker reset', { provider: provider || 'all' });
  }
}

export const circuitBreaker = new CircuitBreaker();

export async function withCircuitBreaker<T>(
  provider: string,
  operation: () => Promise<T>,
  fallback?: () => Promise<T>
): Promise<T> {
  if (!circuitBreaker.isAvailable(provider)) {
    if (fallback) {
      logger.warn(`Circuit breaker ${provider}: using fallback`);
      return fallback();
    }
    throw new Error(`Provider ${provider} is temporarily unavailable`);
  }

  try {
    const result = await operation();
    circuitBreaker.recordSuccess(provider);
    return result;
  } catch (error) {
    circuitBreaker.recordFailure(provider);
    
    if (fallback && circuitBreaker.isDegraded(provider)) {
      logger.warn(`Circuit breaker ${provider}: operation failed, trying fallback`);
      return fallback();
    }
    
    throw error;
  }
}
