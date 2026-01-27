interface AnalyticsEvent {
  event: string;
  properties?: Record<string, unknown>;
  timestamp: string;
}

class Analytics {
  private queue: AnalyticsEvent[] = [];
  private flushInterval = 30000;
  private deviceId: string;

  constructor() {
    this.deviceId = localStorage.getItem('deviceId') || this.generateDeviceId();
    this.startFlushInterval();
  }

  private generateDeviceId(): string {
    const id = crypto.randomUUID();
    localStorage.setItem('deviceId', id);
    return id;
  }

  track(event: string, properties?: Record<string, unknown>) {
    this.queue.push({
      event,
      properties: {
        ...properties,
        deviceId: this.deviceId,
        url: window.location.href,
        userAgent: navigator.userAgent
      },
      timestamp: new Date().toISOString()
    });

    if (this.queue.length >= 10) {
      this.flush();
    }
  }

  private async flush() {
    if (this.queue.length === 0) return;

    const events = [...this.queue];
    this.queue = [];

    try {
      await fetch('/api/analytics/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events })
      });
    } catch {
      this.queue.unshift(...events);
    }
  }

  private startFlushInterval() {
    setInterval(() => this.flush(), this.flushInterval);
    window.addEventListener('beforeunload', () => this.flush());
  }

  pageView(pageName: string) {
    this.track('page_view', { page: pageName });
  }

  quizStarted(sessionId: string) {
    this.track('quiz_started', { sessionId });
  }

  quizCompleted(sessionId: string, score: number, duration: number) {
    this.track('quiz_completed', { sessionId, score, duration });
  }

  imageUploaded(count: number, totalSize: number) {
    this.track('image_uploaded', { count, totalSize });
  }

  creditsPurchased(amount: number, price: number) {
    this.track('credits_purchased', { amount, price });
  }
}

export const analytics = new Analytics();
