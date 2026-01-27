/**
 * Database Connection Pool Metrics
 * [L7 v3.5.3] Production monitoring for connection pool health
 */

import { pool } from "./db.js";
import logger from "./logger.js";
import { metricsRegistry } from "./metrics.js";

export interface PoolMetrics {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  waitingClients: number;
  maxConnections: number;
  utilizationPercent: number;
  healthy: boolean;
}

/**
 * Get current connection pool metrics
 */
export function getPoolMetrics(): PoolMetrics | null {
  if (!pool) {
    return null; // Serverless mode - no pool
  }

  const totalConnections = pool.totalCount;
  const idleConnections = pool.idleCount;
  const waitingClients = pool.waitingCount;
  const maxConnections = 20; // From db.ts configuration
  const activeConnections = totalConnections - idleConnections;
  const utilizationPercent = Math.round((activeConnections / maxConnections) * 100);

  // Pool is unhealthy if:
  // - Utilization > 90%
  // - Waiting clients > 0 (connection starvation)
  const healthy = utilizationPercent < 90 && waitingClients === 0;

  return {
    totalConnections,
    idleConnections,
    activeConnections,
    waitingClients,
    maxConnections,
    utilizationPercent,
    healthy,
  };
}

/**
 * Update Prometheus metrics for database pool
 */
export function updatePoolMetrics(): void {
  const metrics = getPoolMetrics();
  if (!metrics) return;

  try {
    // Update Prometheus gauges
    const { dbPoolTotal, dbPoolActive, dbPoolIdle, dbPoolWaiting, dbPoolUtilization } = metricsRegistry;

    if (dbPoolTotal) dbPoolTotal.set(metrics.totalConnections);
    if (dbPoolActive) dbPoolActive.set(metrics.activeConnections);
    if (dbPoolIdle) dbPoolIdle.set(metrics.idleConnections);
    if (dbPoolWaiting) dbPoolWaiting.set(metrics.waitingClients);
    if (dbPoolUtilization) dbPoolUtilization.set(metrics.utilizationPercent);
  } catch {
    // Metrics might not be initialized yet
  }
}

/**
 * Log pool status for debugging
 */
export function logPoolStatus(): void {
  const metrics = getPoolMetrics();
  if (!metrics) {
    logger.debug("Pool metrics unavailable (serverless mode)");
    return;
  }

  const logLevel = metrics.healthy ? "debug" : "warn";
  logger[logLevel]("Database pool status", {
    ...metrics,
    status: metrics.healthy ? "healthy" : "degraded",
  });

  // Alert if pool is stressed
  if (metrics.waitingClients > 0) {
    logger.warn("Database connection starvation detected", {
      waitingClients: metrics.waitingClients,
      activeConnections: metrics.activeConnections,
      maxConnections: metrics.maxConnections,
    });
  }

  if (metrics.utilizationPercent > 80) {
    logger.warn("Database pool high utilization", {
      utilizationPercent: metrics.utilizationPercent,
      recommendation: "Consider increasing pool size or optimizing queries",
    });
  }
}

/**
 * Health check endpoint data
 */
export function getPoolHealthCheck(): {
  status: "healthy" | "degraded" | "unavailable";
  details: PoolMetrics | null;
} {
  const metrics = getPoolMetrics();

  if (!metrics) {
    return { status: "unavailable", details: null };
  }

  return {
    status: metrics.healthy ? "healthy" : "degraded",
    details: metrics,
  };
}

// Export for periodic metrics collection
let metricsInterval: NodeJS.Timeout | null = null;

export function startPoolMetricsCollection(intervalMs = 30000): void {
  if (metricsInterval) {
    clearInterval(metricsInterval);
  }

  metricsInterval = setInterval(() => {
    updatePoolMetrics();
  }, intervalMs);

  // Initial collection
  updatePoolMetrics();
  logger.info("Database pool metrics collection started", { intervalMs });
}

export function stopPoolMetricsCollection(): void {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
    logger.info("Database pool metrics collection stopped");
  }
}
