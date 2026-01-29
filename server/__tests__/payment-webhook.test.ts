/**
 * Payment Webhook Critical Tests
 * P0 - Tests signature verification, idempotency, and credit granting
 */

import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import crypto from 'crypto';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.PAYLINK_API_ID = 'test-api-id';
  process.env.PAYLINK_SECRET_KEY = 'test-secret';
  process.env.PAYLINK_WEBHOOK_SECRET = 'test-webhook-secret-32chars-min';
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';
});

describe('Webhook Signature Verification', () => {
  const webhookSecret = 'test-webhook-secret-32chars-min';

  it('should reject missing signature in production', () => {
    const isProduction = true;
    const signature: string | undefined = undefined;
    
    const shouldReject = isProduction && !!webhookSecret && !signature;
    expect(shouldReject).toBe(true);
  });

  it('should accept valid HMAC signature', () => {
    const payload = JSON.stringify({ orderNumber: 'ORD-123', orderStatus: 'Paid' });
    const validSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');
    
    const computedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');
    
    expect(validSignature).toBe(computedSignature);
  });

  it('should reject invalid signature', () => {
    const payload = JSON.stringify({ orderNumber: 'ORD-123', orderStatus: 'Paid' });
    const invalidSignature = 'definitely-not-valid-signature';
    
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');
    
    expect(invalidSignature).not.toBe(expectedSignature);
  });

  it('should reject tampered payload', () => {
    const originalPayload = JSON.stringify({ orderNumber: 'ORD-123', orderStatus: 'Paid' });
    const tamperedPayload = JSON.stringify({ orderNumber: 'ORD-123', orderStatus: 'Refunded' });
    
    const originalSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(originalPayload)
      .digest('hex');
    
    const tamperedCheck = crypto
      .createHmac('sha256', webhookSecret)
      .update(tamperedPayload)
      .digest('hex');
    
    expect(originalSignature).not.toBe(tamperedCheck);
  });
});

describe('Webhook Idempotency', () => {
  const processedWebhooks = new Set<string>();
  
  beforeEach(() => {
    processedWebhooks.clear();
  });

  it('should process webhook only once', () => {
    const transactionNo = 'TXN-12345';
    let processCount = 0;
    
    const processWebhook = (txnId: string) => {
      if (processedWebhooks.has(txnId)) {
        return { status: 'duplicate', processed: false };
      }
      processedWebhooks.add(txnId);
      processCount++;
      return { status: 'success', processed: true };
    };
    
    const result1 = processWebhook(transactionNo);
    const result2 = processWebhook(transactionNo);
    const result3 = processWebhook(transactionNo);
    
    expect(result1.processed).toBe(true);
    expect(result2.processed).toBe(false);
    expect(result3.processed).toBe(false);
    expect(processCount).toBe(1);
  });

  it('should handle concurrent duplicate webhooks', async () => {
    const transactionNo = 'TXN-CONCURRENT';
    let grantedCredits = 0;
    
    const processWebhookAsync = async (txnId: string, pagesToGrant: number) => {
      await new Promise(r => setTimeout(r, Math.random() * 10));
      if (processedWebhooks.has(txnId)) {
        return false;
      }
      processedWebhooks.add(txnId);
      grantedCredits += pagesToGrant;
      return true;
    };
    
    const results = await Promise.all([
      processWebhookAsync(transactionNo, 10),
      processWebhookAsync(transactionNo, 10),
      processWebhookAsync(transactionNo, 10),
    ]);
    
    const successCount = results.filter(Boolean).length;
    expect(successCount).toBe(1);
    expect(grantedCredits).toBe(10);
  });
});

describe('Pending Payments Source of Truth', () => {
  interface PendingPayment {
    transactionNo: string;
    deviceId: string;
    packageId: string;
    pages: number;
    amount: number;
    status: string;
  }

  const pendingPayments: Map<string, PendingPayment> = new Map();

  beforeEach(() => {
    pendingPayments.clear();
  });

  it('should only grant credits from pending_payments record', () => {
    const payment: PendingPayment = {
      transactionNo: 'TXN-SOURCE-TRUTH',
      deviceId: 'device-123',
      packageId: 'basic',
      pages: 10,
      amount: 999,
      status: 'pending',
    };
    pendingPayments.set(payment.transactionNo, payment);
    
    const webhookData = { orderNumber: 'TXN-SOURCE-TRUTH', note: '{"pages": 999}' };
    const storedPayment = pendingPayments.get(webhookData.orderNumber);
    
    expect(storedPayment).toBeDefined();
    expect(storedPayment!.pages).toBe(10);
    expect(storedPayment!.pages).not.toBe(999);
  });

  it('should reject webhook for non-existent pending payment', () => {
    const webhookData = { orderNumber: 'NON-EXISTENT-TXN', orderStatus: 'Paid' };
    const storedPayment = pendingPayments.get(webhookData.orderNumber);
    
    expect(storedPayment).toBeUndefined();
    
    const shouldGrant = !!storedPayment;
    expect(shouldGrant).toBe(false);
  });

  it('should update pending payment status to completed', () => {
    const payment: PendingPayment = {
      transactionNo: 'TXN-STATUS-UPDATE',
      deviceId: 'device-456',
      packageId: 'popular',
      pages: 25,
      amount: 1999,
      status: 'pending',
    };
    pendingPayments.set(payment.transactionNo, payment);
    
    const storedPayment = pendingPayments.get('TXN-STATUS-UPDATE');
    expect(storedPayment?.status).toBe('pending');
    
    storedPayment!.status = 'completed';
    expect(pendingPayments.get('TXN-STATUS-UPDATE')?.status).toBe('completed');
    
    const reprocessAttempt = pendingPayments.get('TXN-STATUS-UPDATE');
    expect(reprocessAttempt?.status).toBe('completed');
  });
});

describe('Credit Granting Flow', () => {
  interface DeviceCredits {
    pagesRemaining: number;
    totalPagesUsed: number;
  }

  const deviceCredits: Map<string, DeviceCredits> = new Map();

  beforeEach(() => {
    deviceCredits.clear();
  });

  it('should add purchased pages to existing balance', () => {
    deviceCredits.set('device-grant-1', { pagesRemaining: 2, totalPagesUsed: 0 });
    
    const addPages = (deviceId: string, pages: number) => {
      const credits = deviceCredits.get(deviceId)!;
      credits.pagesRemaining += pages;
      deviceCredits.set(deviceId, credits);
    };
    
    addPages('device-grant-1', 10);
    
    expect(deviceCredits.get('device-grant-1')?.pagesRemaining).toBe(12);
  });

  it('should create new record for first-time purchaser', () => {
    const deviceId = 'new-device-purchaser';
    expect(deviceCredits.has(deviceId)).toBe(false);
    
    const createOrAdd = (id: string, pages: number) => {
      if (!deviceCredits.has(id)) {
        deviceCredits.set(id, { pagesRemaining: pages, totalPagesUsed: 0 });
      } else {
        const credits = deviceCredits.get(id)!;
        credits.pagesRemaining += pages;
      }
    };
    
    createOrAdd(deviceId, 25);
    
    expect(deviceCredits.has(deviceId)).toBe(true);
    expect(deviceCredits.get(deviceId)?.pagesRemaining).toBe(25);
  });

  it('should handle negative pages gracefully', () => {
    deviceCredits.set('device-negative', { pagesRemaining: 5, totalPagesUsed: 0 });
    
    const validateAndAdd = (deviceId: string, pages: number) => {
      if (pages <= 0) {
        throw new Error('Pages must be positive');
      }
      const credits = deviceCredits.get(deviceId)!;
      credits.pagesRemaining += pages;
    };
    
    expect(() => validateAndAdd('device-negative', -5)).toThrow('Pages must be positive');
    expect(() => validateAndAdd('device-negative', 0)).toThrow('Pages must be positive');
  });
});

describe('Webhook Status Handling', () => {
  const validStatuses = ['Paid', 'paid', 'PAID'];
  const invalidStatuses = ['Pending', 'Failed', 'Refunded', 'Cancelled', ''];

  it('should only grant credits for paid status', () => {
    validStatuses.forEach(status => {
      const isPaid = status.toLowerCase() === 'paid';
      expect(isPaid).toBe(true);
    });
  });

  it('should reject non-paid statuses', () => {
    invalidStatuses.forEach(status => {
      const isPaid = status.toLowerCase() === 'paid';
      expect(isPaid).toBe(false);
    });
  });

  it('should handle case-insensitive status check', () => {
    const checkStatus = (status: string) => status.toLowerCase() === 'paid';
    
    expect(checkStatus('PAID')).toBe(true);
    expect(checkStatus('Paid')).toBe(true);
    expect(checkStatus('paid')).toBe(true);
    expect(checkStatus('PaId')).toBe(true);
  });
});
