interface Metrics {
  requests: {
    total: number;
    success: number;
    errors: number;
    byEndpoint: Record<string, number>;
  };
  quizzes: {
    created: number;
    queued: number;
    completed: number;
    failed: number;
    averageProcessingTime: number;
  };
  ai: {
    geminiCalls: number;
    gptCalls: number;
    claudeCalls: number;
    recaptureRate: number;
    averageConfidence: number;
    totalLatencyMs: number;
    callCount: number;
  };
  cache: {
    idempotencyHits: number;
    idempotencyMisses: number;
    extractionHits: number;
    extractionMisses: number;
    sessionHits: number;
    sessionMisses: number;
  };
  credits: {
    used: number;
    purchased: number;
    remaining: number;
    notChargedValidationUnavailable: number;
    notChargedServiceError: number;
    notChargedRaceCondition: number;
  };
  validation: {
    accept: number;
    refuse: number;
    retry: number;
    partial: number;
    unavailable: number;
    schemaFailed: number;
    schemaRetried: number;
  };
  abuse: {
    rateLimited: number;
    payloadTooLarge: number;
    providerDegraded: number;
    providerFailures: number;
  };
  circuitBreaker: {
    geminiOpen: number;
    openaiOpen: number;
    anthropicOpen: number;
  };
}

type CacheType = 'idempotency' | 'extraction' | 'session';

type ValidationOutcome = 'accept' | 'refuse' | 'retry' | 'partial' | 'unavailable';

class MetricsCollector {
  private metrics: Metrics = {
    requests: { total: 0, success: 0, errors: 0, byEndpoint: {} },
    quizzes: { created: 0, queued: 0, completed: 0, failed: 0, averageProcessingTime: 0 },
    ai: { geminiCalls: 0, gptCalls: 0, claudeCalls: 0, recaptureRate: 0, averageConfidence: 0, totalLatencyMs: 0, callCount: 0 },
    cache: { idempotencyHits: 0, idempotencyMisses: 0, extractionHits: 0, extractionMisses: 0, sessionHits: 0, sessionMisses: 0 },
    credits: { used: 0, purchased: 0, remaining: 0, notChargedValidationUnavailable: 0, notChargedServiceError: 0, notChargedRaceCondition: 0 },
    validation: { accept: 0, refuse: 0, retry: 0, partial: 0, unavailable: 0, schemaFailed: 0, schemaRetried: 0 },
    abuse: { rateLimited: 0, payloadTooLarge: 0, providerDegraded: 0, providerFailures: 0 },
    circuitBreaker: { geminiOpen: 0, openaiOpen: 0, anthropicOpen: 0 }
  };
  
  private processingTimes: number[] = [];
  private confidenceScores: number[] = [];

  recordRequest(endpoint: string, statusCode: number) {
    this.metrics.requests.total++;
    if (statusCode >= 200 && statusCode < 400) {
      this.metrics.requests.success++;
    } else {
      this.metrics.requests.errors++;
    }
    this.metrics.requests.byEndpoint[endpoint] = 
      (this.metrics.requests.byEndpoint[endpoint] || 0) + 1;
  }

  recordQuizCreated() {
    this.metrics.quizzes.created++;
  }

  recordQuizQueued() {
    this.metrics.quizzes.queued++;
  }

  recordQuizCompleted(processingTime: number) {
    this.metrics.quizzes.completed++;
    this.processingTimes.push(processingTime);
    this.metrics.quizzes.averageProcessingTime = 
      this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
  }

  recordQuizFailed() {
    this.metrics.quizzes.failed++;
  }

  recordAICall(model: 'gemini' | 'gpt' | 'claude', latencyMs?: number) {
    if (model === 'gemini') this.metrics.ai.geminiCalls++;
    if (model === 'gpt') this.metrics.ai.gptCalls++;
    if (model === 'claude') this.metrics.ai.claudeCalls++;
    
    if (latencyMs !== undefined) {
      this.metrics.ai.totalLatencyMs += latencyMs;
      this.metrics.ai.callCount++;
    }
  }

  recordRecapture() {
    const total = this.metrics.quizzes.created;
    const recaptures = this.metrics.quizzes.failed;
    this.metrics.ai.recaptureRate = total > 0 ? recaptures / total : 0;
  }

  recordConfidence(score: number) {
    this.confidenceScores.push(score);
    this.metrics.ai.averageConfidence = 
      this.confidenceScores.reduce((a, b) => a + b, 0) / this.confidenceScores.length;
  }

  recordCacheHit(cacheType: CacheType) {
    if (cacheType === 'idempotency') this.metrics.cache.idempotencyHits++;
    if (cacheType === 'extraction') this.metrics.cache.extractionHits++;
    if (cacheType === 'session') this.metrics.cache.sessionHits++;
  }

  recordCacheMiss(cacheType: CacheType) {
    if (cacheType === 'idempotency') this.metrics.cache.idempotencyMisses++;
    if (cacheType === 'extraction') this.metrics.cache.extractionMisses++;
    if (cacheType === 'session') this.metrics.cache.sessionMisses++;
  }

  recordCreditsUsed(amount: number) {
    this.metrics.credits.used += amount;
  }

  recordCreditsPurchased(amount: number) {
    this.metrics.credits.purchased += amount;
  }

  // [GO-1] Record credits not charged due to various reasons
  recordCreditsNotCharged(reason: 'validation_unavailable' | 'service_error' | 'race_condition') {
    if (reason === 'validation_unavailable') {
      this.metrics.credits.notChargedValidationUnavailable++;
    } else if (reason === 'service_error') {
      this.metrics.credits.notChargedServiceError++;
    } else if (reason === 'race_condition') {
      this.metrics.credits.notChargedRaceCondition++;
    }
  }

  recordValidationOutcome(outcome: ValidationOutcome) {
    this.metrics.validation[outcome]++;
  }

  recordSchemaFailed() {
    this.metrics.validation.schemaFailed++;
  }

  recordSchemaRetried() {
    this.metrics.validation.schemaRetried++;
  }

  recordRateLimited() {
    this.metrics.abuse.rateLimited++;
  }

  recordPayloadTooLarge() {
    this.metrics.abuse.payloadTooLarge++;
  }

  recordProviderDegraded() {
    this.metrics.abuse.providerDegraded++;
  }

  recordProviderFailure() {
    this.metrics.abuse.providerFailures++;
  }

  recordAICircuitOpen(provider: string) {
    if (provider === 'gemini') this.metrics.circuitBreaker.geminiOpen++;
    if (provider === 'openai') this.metrics.circuitBreaker.openaiOpen++;
    if (provider === 'anthropic') this.metrics.circuitBreaker.anthropicOpen++;
  }

  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  reset() {
    this.metrics = {
      requests: { total: 0, success: 0, errors: 0, byEndpoint: {} },
      quizzes: { created: 0, queued: 0, completed: 0, failed: 0, averageProcessingTime: 0 },
      ai: { geminiCalls: 0, gptCalls: 0, claudeCalls: 0, recaptureRate: 0, averageConfidence: 0, totalLatencyMs: 0, callCount: 0 },
      cache: { idempotencyHits: 0, idempotencyMisses: 0, extractionHits: 0, extractionMisses: 0, sessionHits: 0, sessionMisses: 0 },
      credits: { used: 0, purchased: 0, remaining: 0, notChargedValidationUnavailable: 0, notChargedServiceError: 0, notChargedRaceCondition: 0 },
      validation: { accept: 0, refuse: 0, retry: 0, partial: 0, unavailable: 0, schemaFailed: 0, schemaRetried: 0 },
      abuse: { rateLimited: 0, payloadTooLarge: 0, providerDegraded: 0, providerFailures: 0 },
      circuitBreaker: { geminiOpen: 0, openaiOpen: 0, anthropicOpen: 0 }
    };
    this.processingTimes = [];
    this.confidenceScores = [];
  }
}

export const metrics = new MetricsCollector();

/**
 * Database Pool Metrics Registry
 * [L7 v3.5.3] Exports gauges for pool monitoring
 */
interface DatabasePoolGauges {
  dbPoolTotal: { set: (v: number) => void } | null;
  dbPoolActive: { set: (v: number) => void } | null;
  dbPoolIdle: { set: (v: number) => void } | null;
  dbPoolWaiting: { set: (v: number) => void } | null;
  dbPoolUtilization: { set: (v: number) => void } | null;
}

class SimpleGauge {
  private value = 0;
  set(v: number) { this.value = v; }
  get() { return this.value; }
}

export const metricsRegistry: DatabasePoolGauges & {
  getPoolMetrics: () => { total: number; active: number; idle: number; waiting: number; utilization: number };
} = {
  dbPoolTotal: new SimpleGauge(),
  dbPoolActive: new SimpleGauge(),
  dbPoolIdle: new SimpleGauge(),
  dbPoolWaiting: new SimpleGauge(),
  dbPoolUtilization: new SimpleGauge(),
  getPoolMetrics: () => ({
    total: (metricsRegistry.dbPoolTotal as SimpleGauge)?.get() || 0,
    active: (metricsRegistry.dbPoolActive as SimpleGauge)?.get() || 0,
    idle: (metricsRegistry.dbPoolIdle as SimpleGauge)?.get() || 0,
    waiting: (metricsRegistry.dbPoolWaiting as SimpleGauge)?.get() || 0,
    utilization: (metricsRegistry.dbPoolUtilization as SimpleGauge)?.get() || 0,
  }),
};

/**
 * Prometheus-compatible metrics export
 * [SRE v3.5.0] Enables external monitoring systems
 */
export function getPrometheusMetrics(): string {
  const m = metrics.getMetrics();
  const mem = process.memoryUsage();
  const uptime = process.uptime();
  
  const lines: string[] = [
    '# HELP learnsnap_requests_total Total HTTP requests',
    '# TYPE learnsnap_requests_total counter',
    `learnsnap_requests_total{status="success"} ${m.requests.success}`,
    `learnsnap_requests_total{status="error"} ${m.requests.errors}`,
    '',
    '# HELP learnsnap_quizzes_total Total quizzes by status',
    '# TYPE learnsnap_quizzes_total counter',
    `learnsnap_quizzes_total{status="created"} ${m.quizzes.created}`,
    `learnsnap_quizzes_total{status="completed"} ${m.quizzes.completed}`,
    `learnsnap_quizzes_total{status="failed"} ${m.quizzes.failed}`,
    `learnsnap_quizzes_total{status="queued"} ${m.quizzes.queued}`,
    '',
    '# HELP learnsnap_quiz_processing_seconds Average quiz processing time',
    '# TYPE learnsnap_quiz_processing_seconds gauge',
    `learnsnap_quiz_processing_seconds ${(m.quizzes.averageProcessingTime / 1000).toFixed(3)}`,
    '',
    '# HELP learnsnap_ai_calls_total Total AI provider calls',
    '# TYPE learnsnap_ai_calls_total counter',
    `learnsnap_ai_calls_total{provider="gemini"} ${m.ai.geminiCalls}`,
    `learnsnap_ai_calls_total{provider="openai"} ${m.ai.gptCalls}`,
    `learnsnap_ai_calls_total{provider="anthropic"} ${m.ai.claudeCalls}`,
    '',
    '# HELP learnsnap_ai_latency_seconds Average AI call latency',
    '# TYPE learnsnap_ai_latency_seconds gauge',
    `learnsnap_ai_latency_seconds ${m.ai.callCount > 0 ? (m.ai.totalLatencyMs / m.ai.callCount / 1000).toFixed(3) : 0}`,
    '',
    '# HELP learnsnap_ai_confidence Average AI confidence score',
    '# TYPE learnsnap_ai_confidence gauge',
    `learnsnap_ai_confidence ${m.ai.averageConfidence.toFixed(3)}`,
    '',
    '# HELP learnsnap_cache_hits_total Cache hits by type',
    '# TYPE learnsnap_cache_hits_total counter',
    `learnsnap_cache_hits_total{type="idempotency"} ${m.cache.idempotencyHits}`,
    `learnsnap_cache_hits_total{type="extraction"} ${m.cache.extractionHits}`,
    `learnsnap_cache_hits_total{type="session"} ${m.cache.sessionHits}`,
    '',
    '# HELP learnsnap_cache_misses_total Cache misses by type',
    '# TYPE learnsnap_cache_misses_total counter',
    `learnsnap_cache_misses_total{type="idempotency"} ${m.cache.idempotencyMisses}`,
    `learnsnap_cache_misses_total{type="extraction"} ${m.cache.extractionMisses}`,
    `learnsnap_cache_misses_total{type="session"} ${m.cache.sessionMisses}`,
    '',
    '# HELP learnsnap_credits_total Credits by action',
    '# TYPE learnsnap_credits_total counter',
    `learnsnap_credits_total{action="used"} ${m.credits.used}`,
    `learnsnap_credits_total{action="purchased"} ${m.credits.purchased}`,
    '',
    '# HELP learnsnap_validation_total Validation outcomes',
    '# TYPE learnsnap_validation_total counter',
    `learnsnap_validation_total{outcome="accept"} ${m.validation.accept}`,
    `learnsnap_validation_total{outcome="refuse"} ${m.validation.refuse}`,
    `learnsnap_validation_total{outcome="retry"} ${m.validation.retry}`,
    `learnsnap_validation_total{outcome="partial"} ${m.validation.partial}`,
    `learnsnap_validation_total{outcome="unavailable"} ${m.validation.unavailable}`,
    '',
    '# HELP learnsnap_abuse_total Abuse events',
    '# TYPE learnsnap_abuse_total counter',
    `learnsnap_abuse_total{type="rate_limited"} ${m.abuse.rateLimited}`,
    `learnsnap_abuse_total{type="payload_too_large"} ${m.abuse.payloadTooLarge}`,
    `learnsnap_abuse_total{type="provider_degraded"} ${m.abuse.providerDegraded}`,
    `learnsnap_abuse_total{type="provider_failures"} ${m.abuse.providerFailures}`,
    '',
    '# HELP learnsnap_memory_bytes Memory usage in bytes',
    '# TYPE learnsnap_memory_bytes gauge',
    `learnsnap_memory_bytes{type="heap_used"} ${mem.heapUsed}`,
    `learnsnap_memory_bytes{type="heap_total"} ${mem.heapTotal}`,
    `learnsnap_memory_bytes{type="rss"} ${mem.rss}`,
    `learnsnap_memory_bytes{type="external"} ${mem.external}`,
    '',
    '# HELP learnsnap_uptime_seconds Process uptime in seconds',
    '# TYPE learnsnap_uptime_seconds gauge',
    `learnsnap_uptime_seconds ${uptime.toFixed(0)}`,
    '',
    '# HELP learnsnap_info Service info',
    '# TYPE learnsnap_info gauge',
    `learnsnap_info{version="3.5.3",node_version="${process.version}"} 1`,
    '',
    '# HELP learnsnap_db_pool Database connection pool metrics',
    '# TYPE learnsnap_db_pool gauge',
    `learnsnap_db_pool{type="total"} ${metricsRegistry.getPoolMetrics().total}`,
    `learnsnap_db_pool{type="active"} ${metricsRegistry.getPoolMetrics().active}`,
    `learnsnap_db_pool{type="idle"} ${metricsRegistry.getPoolMetrics().idle}`,
    `learnsnap_db_pool{type="waiting"} ${metricsRegistry.getPoolMetrics().waiting}`,
    `learnsnap_db_pool{type="utilization_percent"} ${metricsRegistry.getPoolMetrics().utilization}`,
    '',
    '# HELP learnsnap_circuit_breaker_open Circuit breaker open counts',
    '# TYPE learnsnap_circuit_breaker_open counter',
    `learnsnap_circuit_breaker_open{provider="gemini"} ${m.circuitBreaker.geminiOpen}`,
    `learnsnap_circuit_breaker_open{provider="openai"} ${m.circuitBreaker.openaiOpen}`,
    `learnsnap_circuit_breaker_open{provider="anthropic"} ${m.circuitBreaker.anthropicOpen}`,
  ];
  
  return lines.join('\n');
}
