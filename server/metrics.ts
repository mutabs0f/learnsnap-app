interface Metrics {
  requests: {
    total: number;
    success: number;
    errors: number;
    byEndpoint: Record<string, number>;
  };
  quizzes: {
    created: number;
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
  };
  credits: {
    used: number;
    purchased: number;
    remaining: number;
  };
}

class MetricsCollector {
  private metrics: Metrics = {
    requests: { total: 0, success: 0, errors: 0, byEndpoint: {} },
    quizzes: { created: 0, completed: 0, failed: 0, averageProcessingTime: 0 },
    ai: { geminiCalls: 0, gptCalls: 0, claudeCalls: 0, recaptureRate: 0, averageConfidence: 0 },
    credits: { used: 0, purchased: 0, remaining: 0 }
  };
  
  private processingTimes: number[] = [];
  private confidenceScores: number[] = [];

  recordRequest(endpoint: string, success: boolean) {
    this.metrics.requests.total++;
    if (success) {
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

  recordQuizCompleted(processingTime: number) {
    this.metrics.quizzes.completed++;
    this.processingTimes.push(processingTime);
    this.metrics.quizzes.averageProcessingTime = 
      this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
  }

  recordQuizFailed() {
    this.metrics.quizzes.failed++;
  }

  recordAICall(model: 'gemini' | 'gpt' | 'claude') {
    if (model === 'gemini') this.metrics.ai.geminiCalls++;
    if (model === 'gpt') this.metrics.ai.gptCalls++;
    if (model === 'claude') this.metrics.ai.claudeCalls++;
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

  recordCreditsUsed(amount: number) {
    this.metrics.credits.used += amount;
  }

  recordCreditsPurchased(amount: number) {
    this.metrics.credits.purchased += amount;
  }

  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  reset() {
    this.metrics = {
      requests: { total: 0, success: 0, errors: 0, byEndpoint: {} },
      quizzes: { created: 0, completed: 0, failed: 0, averageProcessingTime: 0 },
      ai: { geminiCalls: 0, gptCalls: 0, claudeCalls: 0, recaptureRate: 0, averageConfidence: 0 },
      credits: { used: 0, purchased: 0, remaining: 0 }
    };
    this.processingTimes = [];
    this.confidenceScores = [];
  }
}

export const metrics = new MetricsCollector();
