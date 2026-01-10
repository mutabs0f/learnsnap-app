/**
 * Memory Watchdog Service
 * [SRE v3.5.0] Prevents OOM by monitoring heap usage
 * 
 * Triggers graceful shutdown when memory exceeds threshold
 */

import logger from "./logger";

interface MemoryWatchdogConfig {
  warningThresholdMB: number;
  criticalThresholdMB: number;
  checkIntervalMs: number;
  onCritical: () => void;
}

const DEFAULT_CONFIG: MemoryWatchdogConfig = {
  warningThresholdMB: 700,
  criticalThresholdMB: 900,
  checkIntervalMs: 30000,
  onCritical: () => process.exit(1),
};

class MemoryWatchdog {
  private config: MemoryWatchdogConfig;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private warningLogged = false;
  private lastCheck: { heapUsedMB: number; timestamp: Date } | null = null;

  constructor(config: Partial<MemoryWatchdogConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    if (this.intervalId) {
      return;
    }

    logger.info('Memory watchdog started', {
      warningThresholdMB: this.config.warningThresholdMB,
      criticalThresholdMB: this.config.criticalThresholdMB,
      checkIntervalMs: this.config.checkIntervalMs,
    });

    this.intervalId = setInterval(() => this.check(), this.config.checkIntervalMs);
    this.check();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Memory watchdog stopped');
    }
  }

  private check(): void {
    const mem = process.memoryUsage();
    const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
    const rssMB = Math.round(mem.rss / 1024 / 1024);

    this.lastCheck = { heapUsedMB, timestamp: new Date() };

    if (heapUsedMB >= this.config.criticalThresholdMB) {
      logger.error('CRITICAL: Memory threshold exceeded - initiating shutdown', {
        heapUsedMB,
        heapTotalMB,
        rssMB,
        threshold: this.config.criticalThresholdMB,
      });
      this.stop();
      this.config.onCritical();
      return;
    }

    if (heapUsedMB >= this.config.warningThresholdMB) {
      if (!this.warningLogged) {
        logger.warn('WARNING: High memory usage detected', {
          heapUsedMB,
          heapTotalMB,
          rssMB,
          threshold: this.config.warningThresholdMB,
        });
        this.warningLogged = true;
      }
    } else {
      this.warningLogged = false;
    }
  }

  getStatus(): {
    running: boolean;
    lastCheck: { heapUsedMB: number; timestamp: Date } | null;
    config: MemoryWatchdogConfig;
  } {
    return {
      running: this.intervalId !== null,
      lastCheck: this.lastCheck,
      config: this.config,
    };
  }

  forceGC(): boolean {
    if (global.gc) {
      logger.info('Forcing garbage collection');
      global.gc();
      return true;
    }
    logger.warn('Garbage collection not available (run with --expose-gc)');
    return false;
  }
}

export const memoryWatchdog = new MemoryWatchdog();
