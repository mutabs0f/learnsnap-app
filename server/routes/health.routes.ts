/**
 * Health check endpoints
 * [SRE v3.5.0] Enhanced with Prometheus metrics, AI health, SLI/SLO
 * 
 * Endpoints:
 * - GET /health
 * - GET /health/ready
 * - GET /health/live
 * - GET /metrics (Prometheus)
 * - GET /health/slo (SLO status)
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import logger from "../logger";
import { getPrometheusMetrics } from "../metrics";
import { circuitBreaker } from "../circuit-breaker";
import { featureFlags } from "../feature-flags";
import { sliCollector, SLO_TARGETS, ERROR_BUDGET } from "../sli-slo";
import { memoryWatchdog } from "../memory-watchdog";
import { getPoolHealthCheck } from "../db-metrics";
import { isRedisAvailable } from "../queue-service";
import { runHealthCheck } from "../agents/monitor";
import { getDailyStats, sendDailyReport } from "../agents/stats";
import { runCleanup } from "../agents/cleanup";

export function registerHealthRoutes(app: Express): void {
  app.get("/health", async (_req: Request, res: Response) => {
    const checks: Record<string, any> = {};
    let healthy = true;
    
    try {
      const dbStart = Date.now();
      await storage.healthCheck();
      checks.database = { status: true, latency: Date.now() - dbStart };
    } catch {
      checks.database = { status: false };
      healthy = false;
    }
    
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
    checks.redis = { status: !!redisUrl, configured: !!redisUrl };
    
    const mem = process.memoryUsage();
    checks.memory = {
      used: Math.round(mem.heapUsed / 1024 / 1024),
      total: Math.round(mem.heapTotal / 1024 / 1024),
      percentage: Math.round((mem.heapUsed / mem.heapTotal) * 100)
    };
    
    res.status(healthy ? 200 : 503).json({
      status: healthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: "3.5.4",
      checks
    });
  });

  app.get("/health/ready", async (_req: Request, res: Response) => {
    try {
      const startTime = Date.now();
      await storage.healthCheck();
      const dbLatency = Date.now() - startTime;
      
      const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
      const isProd = process.env.NODE_ENV === 'production';
      
      // [P0 FIX v3.5.4] In production, Redis must be configured AND reachable for ready status
      let redisReachable = false;
      let redisStatus = "not configured";
      
      if (redisUrl) {
        redisReachable = await isRedisAvailable();
        redisStatus = redisReachable ? "ok" : "unreachable";
      }
      
      // In production, Redis is required - fail ready check if not configured
      if (isProd && !redisUrl) {
        logger.warn("Health ready check failed - Redis not configured in production");
        return res.status(503).json({
          status: "not ready",
          error: "Redis not configured",
          code: "REDIS_NOT_CONFIGURED",
          timestamp: new Date().toISOString(),
          version: "3.5.4",
          services: {
            database: { status: "ok", latencyMs: dbLatency },
            redis: { status: "not configured", required: true },
          },
        });
      }
      
      // In production, Redis is required - fail ready check if unreachable
      if (isProd && redisUrl && !redisReachable) {
        logger.warn("Health ready check failed - Redis unreachable in production");
        return res.status(503).json({
          status: "not ready",
          error: "Redis unavailable",
          code: "REDIS_UNAVAILABLE",
          timestamp: new Date().toISOString(),
          version: "3.5.4",
          services: {
            database: { status: "ok", latencyMs: dbLatency },
            redis: { status: "unreachable", required: true },
          },
        });
      }

      res.json({
        status: "ready",
        timestamp: new Date().toISOString(),
        version: "3.5.4",
        services: {
          database: { status: "ok", latencyMs: dbLatency },
          redis: { status: redisStatus, required: isProd && !!redisUrl },
          ai: {
            gemini: !!process.env.GEMINI_API_KEY ? "configured" : "missing",
            openai: !!process.env.OPENAI_API_KEY ? "configured" : "missing",
            anthropic: !!process.env.ANTHROPIC_API_KEY ? "configured" : "missing",
          },
          validation: {
            enabled: !!(process.env.OPENAI_API_KEY && process.env.ANTHROPIC_API_KEY),
            models: ["gpt-4o-mini", "claude-haiku"]
          }
        },
        features: {
          caching: !!redisUrl && redisReachable,
          asyncProcessing: !!redisUrl && redisReachable,
          encryption: !!process.env.ENCRYPTION_KEY,
          evidenceExtraction: true,
          groundingValidation: true,
          fallbackRegeneration: true
        },
        memory: {
          usedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          totalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        },
      });
    } catch (error) {
      logger.error("Health check failed", { error });
      res.status(503).json({
        status: "not ready",
        error: "Service unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.get("/health/live", (_req: Request, res: Response) => {
    res.json({
      status: "alive",
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Prometheus-compatible metrics endpoint
   * [SRE v3.5.0] For external monitoring systems
   */
  app.get("/metrics", (_req: Request, res: Response) => {
    res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(getPrometheusMetrics());
  });

  /**
   * SLI/SLO status endpoint
   * [SRE v3.5.0] Current service level status
   */
  app.get("/health/slo", (_req: Request, res: Response) => {
    const sloStatus = sliCollector.getSLOStatus();
    const slis = sliCollector.getCurrentSLIs();
    
    const hasCritical = sloStatus.some(s => s.status === 'CRITICAL');
    const hasWarning = sloStatus.some(s => s.status === 'WARNING');
    
    res.status(hasCritical ? 503 : 200).json({
      status: hasCritical ? 'critical' : hasWarning ? 'warning' : 'ok',
      timestamp: new Date().toISOString(),
      targets: SLO_TARGETS,
      errorBudget: ERROR_BUDGET,
      currentSLIs: slis,
      sloStatus,
    });
  });

  /**
   * AI providers health check
   * [SRE v3.5.0] Check circuit breaker status for each provider
   */
  app.get("/health/ai", (_req: Request, res: Response) => {
    const circuitStatus = circuitBreaker.getStatus();
    
    const providers = {
      gemini: {
        configured: !!process.env.GEMINI_API_KEY,
        circuit: circuitStatus['gemini'] || { state: 'CLOSED', failures: 0 },
      },
      openai: {
        configured: !!process.env.OPENAI_API_KEY,
        circuit: circuitStatus['openai'] || { state: 'CLOSED', failures: 0 },
      },
      anthropic: {
        configured: !!process.env.ANTHROPIC_API_KEY,
        circuit: circuitStatus['anthropic'] || { state: 'CLOSED', failures: 0 },
      },
    };
    
    const allHealthy = Object.values(providers).every(
      p => p.configured && p.circuit.state === 'CLOSED'
    );
    const anyConfigured = Object.values(providers).some(p => p.configured);
    
    res.status(allHealthy ? 200 : anyConfigured ? 200 : 503).json({
      status: allHealthy ? 'healthy' : anyConfigured ? 'degraded' : 'unhealthy',
      timestamp: new Date().toISOString(),
      providers,
    });
  });

  /**
   * Feature flags status
   * [SRE v3.5.0] Current feature flag states
   */
  app.get("/health/features", (_req: Request, res: Response) => {
    res.json({
      timestamp: new Date().toISOString(),
      flags: featureFlags.getAllFlags(),
    });
  });

  /**
   * Memory watchdog status
   * [SRE v3.5.0] Memory monitoring status
   */
  app.get("/health/memory", (_req: Request, res: Response) => {
    const mem = process.memoryUsage();
    const watchdogStatus = memoryWatchdog.getStatus();
    
    res.json({
      timestamp: new Date().toISOString(),
      current: {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
        externalMB: Math.round(mem.external / 1024 / 1024),
      },
      watchdog: {
        running: watchdogStatus.running,
        thresholds: {
          warningMB: watchdogStatus.config.warningThresholdMB,
          criticalMB: watchdogStatus.config.criticalThresholdMB,
        },
        lastCheck: watchdogStatus.lastCheck,
      },
    });
  });

  /**
   * Monitor Agent health check
   * [v3.8.3] Manual health check endpoint
   */
  app.get("/health/monitor", async (_req: Request, res: Response) => {
    const result = await runHealthCheck();
    res.status(result.healthy ? 200 : 503).json(result);
  });

  /**
   * Stats Agent endpoints
   * [v3.8.4] Daily stats and manual report trigger
   */
  app.get("/health/stats", async (_req: Request, res: Response) => {
    const stats = await getDailyStats();
    res.json(stats);
  });

  app.post("/health/stats/send", async (_req: Request, res: Response) => {
    try {
      await sendDailyReport();
      res.json({ success: true, message: "Report sent to Telegram" });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /**
   * Cleanup Agent endpoint
   * [v3.8.5] Manual cleanup trigger
   */
  app.post("/health/cleanup", async (_req: Request, res: Response) => {
    try {
      const result = await runCleanup();
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /**
   * Database pool health check
   * [L7 v3.5.3] Connection pool monitoring
   */
  app.get("/health/db", async (_req: Request, res: Response) => {
    const poolHealth = getPoolHealthCheck();
    
    // Test actual database connection
    let dbConnected = false;
    let dbLatency = 0;
    try {
      const start = Date.now();
      await storage.healthCheck();
      dbLatency = Date.now() - start;
      dbConnected = true;
    } catch (error) {
      logger.error("Database health check failed", { error });
    }
    
    const overallStatus = dbConnected && (poolHealth.status !== 'degraded') ? 'healthy' : 'degraded';
    
    res.status(overallStatus === 'healthy' ? 200 : 503).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      database: {
        connected: dbConnected,
        latencyMs: dbLatency,
      },
      pool: poolHealth.details ? {
        status: poolHealth.status,
        totalConnections: poolHealth.details.totalConnections,
        activeConnections: poolHealth.details.activeConnections,
        idleConnections: poolHealth.details.idleConnections,
        waitingClients: poolHealth.details.waitingClients,
        maxConnections: poolHealth.details.maxConnections,
        utilizationPercent: poolHealth.details.utilizationPercent,
      } : {
        status: 'unavailable',
        reason: 'Serverless mode - no connection pool',
      },
    });
  });
}
