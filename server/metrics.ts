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
    abuse: { rateLimited: 0, payloadTooLarge: 0, providerDegraded: 0, providerFailures: 0 }
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
      abuse: { rateLimited: 0, payloadTooLarge: 0, providerDegraded: 0, providerFailures: 0 }
    };
    this.processingTimes = [];
    this.confidenceScores = [];
  }
}

export const metrics = new MetricsCollector();
