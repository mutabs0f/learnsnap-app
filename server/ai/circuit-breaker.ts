/**
 * Circuit Breaker for AI Providers
 * [L7 v3.5.2] Per-provider circuit breaker to prevent cascading failures
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failures exceeded threshold, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 */

import logger from "../logger";
import { metrics } from "../metrics";

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitConfig {
  failureThreshold: number;      // Number of failures before opening
  successThreshold: number;      // Successes needed to close from half-open
  timeout: number;               // Time in ms before trying half-open
  volumeThreshold: number;       // Min requests before circuit can trip
}

interface CircuitStats {
  failures: number;
  successes: number;
  lastFailure: number;
  lastSuccess: number;
  totalRequests: number;
  consecutiveSuccesses: number;
}

const DEFAULT_CONFIG: CircuitConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 60000,        // 1 minute
  volumeThreshold: 10,
};

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private stats: CircuitStats = {
    failures: 0,
    successes: 0,
    lastFailure: 0,
    lastSuccess: 0,
    totalRequests: 0,
    consecutiveSuccesses: 0,
  };
  private openedAt = 0;

  constructor(
    private readonly name: string,
    private readonly config: CircuitConfig = DEFAULT_CONFIG
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      metrics.recordAICircuitOpen(this.name);
      throw new CircuitOpenError(this.name, this.getTimeUntilHalfOpen());
    }

    this.stats.totalRequests++;

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private canExecute(): boolean {
    const now = Date.now();

    switch (this.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        if (now - this.openedAt >= this.config.timeout) {
          this.transitionTo('HALF_OPEN');
          return true;
        }
        return false;

      case 'HALF_OPEN':
        return true;

      default:
        return true;
    }
  }

  private recordSuccess(): void {
    this.stats.successes++;
    this.stats.lastSuccess = Date.now();
    this.stats.consecutiveSuccesses++;

    if (this.state === 'HALF_OPEN') {
      if (this.stats.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo('CLOSED');
      }
    }
  }

  private recordFailure(): void {
    this.stats.failures++;
    this.stats.lastFailure = Date.now();
    this.stats.consecutiveSuccesses = 0;

    if (this.state === 'HALF_OPEN') {
      this.transitionTo('OPEN');
      return;
    }

    if (this.state === 'CLOSED') {
      if (
        this.stats.totalRequests >= this.config.volumeThreshold &&
        this.getFailureRate() >= 0.5
      ) {
        this.transitionTo('OPEN');
      }
    }
  }

  private getFailureRate(): number {
    const recentWindow = 60000; // 1 minute
    const now = Date.now();
    
    // Simple failure rate based on recent failures vs threshold
    if (this.stats.failures >= this.config.failureThreshold) {
      return 1;
    }
    return this.stats.failures / this.config.failureThreshold;
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    logger.warn(`Circuit breaker ${this.name}: ${oldState} -> ${newState}`, {
      provider: this.name,
      oldState,
      newState,
      stats: this.getStats(),
    });

    if (newState === 'OPEN') {
      this.openedAt = Date.now();
      metrics.recordAICircuitOpen(this.name);
    }

    if (newState === 'CLOSED') {
      this.reset();
    }
  }

  private reset(): void {
    this.stats = {
      failures: 0,
      successes: 0,
      lastFailure: 0,
      lastSuccess: Date.now(),
      totalRequests: 0,
      consecutiveSuccesses: 0,
    };
    this.openedAt = 0;
  }

  private getTimeUntilHalfOpen(): number {
    if (this.state !== 'OPEN') return 0;
    const elapsed = Date.now() - this.openedAt;
    return Math.max(0, this.config.timeout - elapsed);
  }

  getState(): CircuitState {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN' && Date.now() - this.openedAt >= this.config.timeout) {
      this.transitionTo('HALF_OPEN');
    }
    return this.state;
  }

  getStats(): { state: CircuitState; failures: number; successes: number; totalRequests: number } {
    return {
      state: this.getState(),
      failures: this.stats.failures,
      successes: this.stats.successes,
      totalRequests: this.stats.totalRequests,
    };
  }

  forceOpen(): void {
    this.transitionTo('OPEN');
  }

  forceClose(): void {
    this.transitionTo('CLOSED');
  }
}

export class CircuitOpenError extends Error {
  constructor(
    public readonly provider: string,
    public readonly retryAfterMs: number
  ) {
    super(`Circuit breaker open for ${provider}. Retry after ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = 'CircuitOpenError';
  }
}

// Per-provider circuit breakers with custom configs
const providerConfigs: Record<string, CircuitConfig> = {
  gemini: {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,       // 30 seconds - Gemini is primary, recover fast
    volumeThreshold: 5,
  },
  openai: {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 60000,       // 1 minute
    volumeThreshold: 10,
  },
  anthropic: {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 60000,       // 1 minute  
    volumeThreshold: 10,
  },
};

const circuitBreakers: Map<string, CircuitBreaker> = new Map();

export function getCircuitBreaker(provider: string): CircuitBreaker {
  if (!circuitBreakers.has(provider)) {
    const config = providerConfigs[provider] || DEFAULT_CONFIG;
    circuitBreakers.set(provider, new CircuitBreaker(provider, config));
  }
  return circuitBreakers.get(provider)!;
}

export function getAllCircuitStats(): Record<string, { state: CircuitState; failures: number; successes: number }> {
  const stats: Record<string, { state: CircuitState; failures: number; successes: number }> = {};
  
  for (const [name, breaker] of circuitBreakers) {
    stats[name] = breaker.getStats();
  }
  
  // Include providers that haven't been used yet
  for (const provider of ['gemini', 'openai', 'anthropic']) {
    if (!stats[provider]) {
      stats[provider] = { state: 'CLOSED', failures: 0, successes: 0 };
    }
  }
  
  return stats;
}

export function resetAllCircuits(): void {
  for (const breaker of circuitBreakers.values()) {
    breaker.forceClose();
  }
  logger.info('All circuit breakers reset');
}
