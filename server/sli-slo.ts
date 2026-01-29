/**
 * SLI/SLO Definitions
 * [SRE v3.5.0] Service Level Indicators and Objectives
 * 
 * These definitions codify our reliability targets and enable
 * automated alerting based on error budget consumption.
 */

import { metrics } from "./metrics";
import logger from "./logger";

/**
 * SLO Targets
 * These represent our commitments to users
 */
export const SLO_TARGETS = {
  AVAILABILITY: 0.999,
  QUIZ_LATENCY_P95_SECONDS: 60,
  QUIZ_LATENCY_P99_SECONDS: 120,
  ERROR_RATE: 0.001,
  AI_SUCCESS_RATE: 0.95,
  PAYMENT_SUCCESS_RATE: 0.99,
} as const;

/**
 * Error Budget Calculation
 * Monthly error budget based on SLO
 * For 99.9% availability: ~43 minutes per month
 */
export const ERROR_BUDGET = {
  MONTHLY_MINUTES: Math.ceil((1 - SLO_TARGETS.AVAILABILITY) * 30 * 24 * 60),
  DAILY_SECONDS: Math.ceil((1 - SLO_TARGETS.AVAILABILITY) * 24 * 60 * 60),
};

interface SLIMetrics {
  availability: number;
  errorRate: number;
  aiSuccessRate: number;
  quizSuccessRate: number;
  averageLatencyMs: number;
}

interface SLOStatus {
  metric: string;
  target: number;
  current: number;
  status: 'OK' | 'WARNING' | 'CRITICAL';
  errorBudgetRemaining?: number;
}

class SLICollector {
  private requestLatencies: number[] = [];
  private maxLatencySamples = 1000;

  recordLatency(latencyMs: number): void {
    this.requestLatencies.push(latencyMs);
    if (this.requestLatencies.length > this.maxLatencySamples) {
      this.requestLatencies.shift();
    }
  }

  getPercentile(percentile: number): number {
    if (this.requestLatencies.length === 0) return 0;
    
    const sorted = [...this.requestLatencies].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  getCurrentSLIs(): SLIMetrics {
    const m = metrics.getMetrics();
    
    const totalRequests = m.requests.total;
    const successfulRequests = m.requests.success;
    const availability = totalRequests > 0 ? successfulRequests / totalRequests : 1;
    
    const errorRate = totalRequests > 0 ? m.requests.errors / totalRequests : 0;
    
    const totalAICalls = m.ai.geminiCalls + m.ai.gptCalls + m.ai.claudeCalls;
    const aiSuccessRate = totalAICalls > 0 
      ? 1 - (m.abuse.providerFailures / totalAICalls) 
      : 1;
    
    const totalQuizzes = m.quizzes.created;
    const quizSuccessRate = totalQuizzes > 0 
      ? m.quizzes.completed / totalQuizzes 
      : 1;
    
    const averageLatencyMs = m.ai.callCount > 0 
      ? m.ai.totalLatencyMs / m.ai.callCount 
      : 0;
    
    return {
      availability,
      errorRate,
      aiSuccessRate,
      quizSuccessRate,
      averageLatencyMs,
    };
  }

  getSLOStatus(): SLOStatus[] {
    const slis = this.getCurrentSLIs();
    const statuses: SLOStatus[] = [];

    statuses.push({
      metric: 'availability',
      target: SLO_TARGETS.AVAILABILITY,
      current: slis.availability,
      status: this.getStatus(slis.availability, SLO_TARGETS.AVAILABILITY, true),
      errorBudgetRemaining: this.calculateErrorBudget(slis.availability, SLO_TARGETS.AVAILABILITY),
    });

    statuses.push({
      metric: 'error_rate',
      target: SLO_TARGETS.ERROR_RATE,
      current: slis.errorRate,
      status: this.getStatus(slis.errorRate, SLO_TARGETS.ERROR_RATE, false),
    });

    statuses.push({
      metric: 'ai_success_rate',
      target: SLO_TARGETS.AI_SUCCESS_RATE,
      current: slis.aiSuccessRate,
      status: this.getStatus(slis.aiSuccessRate, SLO_TARGETS.AI_SUCCESS_RATE, true),
    });

    statuses.push({
      metric: 'quiz_latency_p95',
      target: SLO_TARGETS.QUIZ_LATENCY_P95_SECONDS,
      current: this.getPercentile(95) / 1000,
      status: this.getStatus(
        this.getPercentile(95) / 1000, 
        SLO_TARGETS.QUIZ_LATENCY_P95_SECONDS, 
        false
      ),
    });

    return statuses;
  }

  private getStatus(current: number, target: number, higherIsBetter: boolean): 'OK' | 'WARNING' | 'CRITICAL' {
    const margin = higherIsBetter ? 0.01 : -0.005;
    const warningThreshold = higherIsBetter ? target - margin : target + Math.abs(margin);
    
    if (higherIsBetter) {
      if (current >= target) return 'OK';
      if (current >= warningThreshold) return 'WARNING';
      return 'CRITICAL';
    } else {
      if (current <= target) return 'OK';
      if (current <= warningThreshold) return 'WARNING';
      return 'CRITICAL';
    }
  }

  private calculateErrorBudget(current: number, target: number): number {
    const consumed = target - current;
    const totalBudget = 1 - target;
    if (totalBudget === 0) return 100;
    const remaining = Math.max(0, 1 - (consumed / totalBudget));
    return Math.round(remaining * 100);
  }

  logSLOReport(): void {
    const statuses = this.getSLOStatus();
    const slis = this.getCurrentSLIs();
    
    logger.info('SLO Status Report', {
      slis,
      statuses: statuses.map(s => ({
        metric: s.metric,
        status: s.status,
        current: s.current.toFixed(4),
        target: s.target,
      })),
    });

    const criticalViolations = statuses.filter(s => s.status === 'CRITICAL');
    if (criticalViolations.length > 0) {
      logger.error('SLO VIOLATION: Critical thresholds breached', {
        violations: criticalViolations.map(v => v.metric),
      });
    }
  }
}

export const sliCollector = new SLICollector();

export function startSLOMonitoring(intervalMs: number = 60000): ReturnType<typeof setInterval> {
  return setInterval(() => {
    sliCollector.logSLOReport();
  }, intervalMs);
}
