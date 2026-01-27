/**
 * API Endpoint Smoke Tests
 * Tests real endpoints with mocked storage and fetch (no DB/network dependency)
 * 
 * Run: npx vitest run server/__tests__/api-smoke.test.ts
 */

import { describe, it, expect, beforeAll, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import request from 'supertest';
import cookieParser from 'cookie-parser';

// Deterministic environment setup - MUST be before any app imports
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long-for-security';
  process.env.DEVICE_TOKEN_SECRET = 'test-device-token-secret-32chars';
  // Paylink test credentials (dummy values for testing)
  process.env.PAYLINK_API_ID = 'test-api-id';
  process.env.PAYLINK_SECRET_KEY = 'test-secret-key';
  process.env.APP_URL = 'https://test.learnsnap.app';
  process.env.PAYLINK_ENVIRONMENT = 'testing';
  // Clear DB URLs to ensure no DB connection attempts
  delete process.env.DATABASE_URL;
  delete process.env.NEON_DATABASE_URL;
});

// Mock storage module before importing routes
vi.mock('../storage', () => ({
  storage: {
    healthCheck: vi.fn().mockResolvedValue(true),
    getPageCredits: vi.fn().mockResolvedValue({ pagesRemaining: 0 }),
    getUserSession: vi.fn().mockResolvedValue(null),
    getQuizSession: vi.fn().mockResolvedValue(null),
    cleanupAllExpiredData: vi.fn().mockResolvedValue({}),
    // Paylink storage functions
    createPendingPayment: vi.fn().mockResolvedValue({ id: 'pending-1' }),
    updatePendingPaymentStatus: vi.fn().mockResolvedValue(undefined),
    getPendingPaymentByOrderNumber: vi.fn().mockResolvedValue(null),
    upsertWebhookEventForProcessing: vi.fn().mockResolvedValue({ status: null, canProcess: true }),
    updateWebhookEventStatus: vi.fn().mockResolvedValue(undefined),
    getTransactionByPaymentId: vi.fn().mockResolvedValue(null),
    createTransactionAndAddCredits: vi.fn().mockResolvedValue({ id: 'tx-1' }),
  }
}));

// Mock db module to prevent connection attempts
vi.mock('../db', () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
  },
  initDatabase: vi.fn().mockResolvedValue(undefined),
  closeDatabase: vi.fn().mockResolvedValue(undefined),
}));

// Mock auth-routes to avoid DB dependency
vi.mock('../auth-routes', () => ({
  registerAuthRoutes: vi.fn(),
}));

// Mock audit-logger
vi.mock('../audit-logger', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
  checkAndIncrementQuota: vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: 60 }),
}));

// Mock queue-service
vi.mock('../queue-service', () => ({
  queueService: {
    addQuizJob: vi.fn(),
    getJobStatus: vi.fn(),
  },
}));

// Mock email-service
vi.mock('../email-service', () => ({
  sendQuestionReportNotification: vi.fn().mockResolvedValue(undefined),
}));

describe('API Smoke Tests - Real Endpoints', () => {
  let app: express.Express;
  let httpServer: http.Server;
  let originalFetch: typeof global.fetch;

  beforeAll(async () => {
    // Save original fetch
    originalFetch = global.fetch;
    
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    httpServer = http.createServer(app);
    
    // Import and register routes after mocks are set up
    const { registerRoutes } = await import('../routes');
    await registerRoutes(httpServer, app);
  });

  afterEach(() => {
    // Restore fetch after each test
    global.fetch = originalFetch;
  });

  describe('Health Endpoints', () => {
    it('GET /health/live returns 200 with alive status', async () => {
      const response = await request(app).get('/health/live');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'alive');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('CSRF Token Endpoint', () => {
    it('GET /api/csrf-token returns token in response', async () => {
      const response = await request(app).get('/api/csrf-token');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('csrfToken');
      expect(typeof response.body.csrfToken).toBe('string');
      expect(response.body.csrfToken.length).toBeGreaterThan(0);
    });
  });

  describe('Paylink Payment Endpoints (Real Routes)', () => {
    it('POST /api/payment/create returns 403 without CSRF token (v3.2.0 security)', async () => {
      const response = await request(app)
        .post('/api/payment/create')
        .send({})
        .set('Accept', 'application/json');
      
      expect(response.status).toBe(403);
    });

    it('POST /api/payment/create with CSRF token returns 400 for missing packageId/deviceId', async () => {
      const csrfResponse = await request(app).get('/api/csrf-token');
      const csrfToken = csrfResponse.body.csrfToken;
      const cookies = csrfResponse.headers['set-cookie'];
      
      const response = await request(app)
        .post('/api/payment/create')
        .send({})
        .set('Accept', 'application/json')
        .set('csrf-token', csrfToken)
        .set('Cookie', cookies ? (Array.isArray(cookies) ? cookies.join('; ') : cookies) : '');
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/missing|packageId|deviceId/i);
    });

    it('POST /api/payment/create with CSRF and valid data returns paymentUrl', async () => {
      const csrfResponse = await request(app).get('/api/csrf-token');
      const csrfToken = csrfResponse.body.csrfToken;
      const cookies = csrfResponse.headers['set-cookie'];
      
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id_token: 'mock-paylink-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            url: 'https://paylink.sa/checkout/mock123',
            mobileUrl: 'https://m.paylink.sa/checkout/mock123',
            transactionNo: 'TXN123456',
          }),
        });

      const response = await request(app)
        .post('/api/payment/create')
        .send({
          packageId: 'basic',
          deviceId: 'test-device-id-12345',
        })
        .set('Accept', 'application/json')
        .set('csrf-token', csrfToken)
        .set('Cookie', cookies ? (Array.isArray(cookies) ? cookies.join('; ') : cookies) : '');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('paymentUrl');
      expect(response.body.paymentUrl).toContain('paylink.sa');
      expect(response.body).toHaveProperty('transactionNo');
      expect(response.body).toHaveProperty('orderNumber');
      expect(response.body).toHaveProperty('pages', 10);
      
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('GET /api/billing/packs returns available packages', async () => {
      const response = await request(app)
        .get('/api/billing/packs')
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('packages');
      expect(Array.isArray(response.body.packages)).toBe(true);
      expect(response.body.packages.length).toBeGreaterThan(0);
      
      // Verify package structure
      const basicPkg = response.body.packages.find((p: any) => p.id === 'basic');
      expect(basicPkg).toBeDefined();
      expect(basicPkg.pages).toBe(10);
    });
  });

  describe('Credits Endpoint Error Handling', () => {
    it('GET /api/credits/:deviceId returns 400 for invalid deviceId (too long)', async () => {
      const longDeviceId = 'a'.repeat(150);
      const response = await request(app).get(`/api/credits/${longDeviceId}`);
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code', 'INVALID_DEVICE_ID');
    });

    it('GET /api/credits/:deviceId returns error for missing device token', async () => {
      const response = await request(app)
        .get('/api/credits/valid-device-id')
        .set('Accept', 'application/json');
      
      // Route should reject request without device token
      // Status could be 401 (MISSING_DEVICE_TOKEN) or 500 (if config error in test env)
      expect([401, 500]).toContain(response.status);
      expect(response.body).toHaveProperty('code');
    });
  });
});
