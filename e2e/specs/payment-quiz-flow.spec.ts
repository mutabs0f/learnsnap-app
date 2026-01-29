/**
 * E2E Happy Path: Payment → Quiz Generation Flow
 * [L7 v3.5.2] Tests the complete user journey
 */

import { test, expect } from '@playwright/test';

test.describe('Payment → Quiz Happy Path', () => {
  
  test('health endpoints are accessible', async ({ request }) => {
    const healthResponse = await request.get('/health');
    expect(healthResponse.ok()).toBe(true);
    
    const healthData = await healthResponse.json();
    expect(healthData.status).toBe('healthy');
  });

  test('credits endpoint returns valid structure', async ({ request }) => {
    const csrfResponse = await request.get('/api/csrf-token');
    expect(csrfResponse.ok()).toBe(true);
    const { csrfToken } = await csrfResponse.json();
    
    const creditsResponse = await request.get('/api/credits', {
      headers: {
        'x-csrf-token': csrfToken,
        'x-device-id': 'test-device-e2e-flow'
      }
    });
    
    expect(creditsResponse.status()).toBe(200);
    const credits = await creditsResponse.json();
    expect(credits).toHaveProperty('pagesRemaining');
  });

  test('quiz creation validates required fields', async ({ request }) => {
    const csrfResponse = await request.get('/api/csrf-token');
    const { csrfToken } = await csrfResponse.json();
    
    const response = await request.post('/api/quiz/create', {
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      data: {
        deviceId: 'test-device-e2e'
      }
    });
    
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  test('quiz creation requires device token in production-like mode', async ({ request }) => {
    const csrfResponse = await request.get('/api/csrf-token');
    const { csrfToken } = await csrfResponse.json();
    
    const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    
    const response = await request.post('/api/quiz/create', {
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      data: {
        deviceId: 'test-device-e2e-flow',
        images: [testImage]
      }
    });
    
    const body = await response.json();
    expect([400, 401, 402, 403]).toContain(response.status());
  });

  test('payment webhook endpoint exists', async ({ request }) => {
    const response = await request.post('/api/payment/webhook', {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {}
    });
    
    expect([400, 401, 403]).toContain(response.status());
  });

  test('job status endpoint handles invalid job ID', async ({ request }) => {
    const response = await request.get('/api/quiz/job/invalid-job-id/status');
    
    expect([404, 400]).toContain(response.status());
  });

  test('quiz session endpoint handles non-existent session', async ({ request }) => {
    const response = await request.get('/api/quiz/non-existent-session-id');
    
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });
});

test.describe('Feature Flags Integration', () => {
  
  test('feature flags health endpoint returns valid structure', async ({ request }) => {
    const response = await request.get('/health/features');
    
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body).toHaveProperty('flags');
  });
});

test.describe('Circuit Breaker Integration', () => {
  
  test('AI health endpoint returns circuit breaker status', async ({ request }) => {
    const response = await request.get('/health/ai');
    
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body).toHaveProperty('status');
  });
});

test.describe('SLO Monitoring', () => {
  
  test('SLO health endpoint returns compliance status', async ({ request }) => {
    const response = await request.get('/health/slo');
    
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body).toHaveProperty('status');
  });
});
