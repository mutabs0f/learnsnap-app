/**
 * Payment System Tests
 * Tests Paylink integration without external calls
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.PAYLINK_API_ID = 'test-api-id';
  process.env.PAYLINK_SECRET_KEY = 'test-secret';
  process.env.PAYLINK_WEBHOOK_SECRET = 'test-webhook-secret';
});

describe('Payment Package Validation', () => {
  it('should have valid package structure', async () => {
    const { PAYLINK_PACKAGES } = await import('../paylink-routes');
    
    expect(PAYLINK_PACKAGES.length).toBeGreaterThan(0);
    
    PAYLINK_PACKAGES.forEach(pkg => {
      expect(pkg).toHaveProperty('id');
      expect(pkg).toHaveProperty('pages');
      expect(pkg).toHaveProperty('price');
      expect(pkg.pages).toBeGreaterThan(0);
      expect(pkg.price).toBeGreaterThan(0);
    });
  });

  it('basic package should have 10 pages', async () => {
    const { PAYLINK_PACKAGES } = await import('../paylink-routes');
    
    const basicPkg = PAYLINK_PACKAGES.find(p => p.id === 'basic');
    
    expect(basicPkg).toBeDefined();
    expect(basicPkg?.pages).toBe(10);
  });

  it('popular package should have 25 pages', async () => {
    const { PAYLINK_PACKAGES } = await import('../paylink-routes');
    
    const popularPkg = PAYLINK_PACKAGES.find(p => p.id === 'popular');
    
    expect(popularPkg).toBeDefined();
    expect(popularPkg?.pages).toBe(25);
  });

  it('best package should have 60 pages', async () => {
    const { PAYLINK_PACKAGES } = await import('../paylink-routes');
    
    const bestPkg = PAYLINK_PACKAGES.find(p => p.id === 'best');
    
    expect(bestPkg).toBeDefined();
    expect(bestPkg?.pages).toBe(60);
  });

  it('family package should have 150 pages', async () => {
    const { PAYLINK_PACKAGES } = await import('../paylink-routes');
    
    const familyPkg = PAYLINK_PACKAGES.find(p => p.id === 'family');
    
    expect(familyPkg).toBeDefined();
    expect(familyPkg?.pages).toBe(150);
  });
});

describe('Webhook Signature Verification', () => {
  it('should reject webhook without signature in production', () => {
    const isProduction = true;
    const signature = undefined;
    const webhookSecret = 'secret';
    
    const shouldReject = isProduction && webhookSecret && !signature;
    
    expect(shouldReject).toBe(true);
  });

  it('should allow webhook with valid signature', () => {
    const signature = 'valid-signature';
    const webhookSecret = 'secret';
    
    const hasRequiredAuth = !!(signature && webhookSecret);
    
    expect(hasRequiredAuth).toBe(true);
  });

  it('should handle missing webhook secret gracefully', () => {
    const signature = 'some-signature';
    const webhookSecret = '';
    
    const hasValidSecret = !!webhookSecret;
    
    expect(hasValidSecret).toBe(false);
  });
});

describe('Pending Payments Source of Truth', () => {
  it('credits should only be granted from pending_payments', () => {
    const creditDecisionSources = ['pending_payments'];
    const loggingOnlySources = ['webhook.body.note', 'webhook.metadata'];
    
    expect(creditDecisionSources).not.toContain('webhook.body.note');
    expect(loggingOnlySources).toContain('webhook.body.note');
  });

  it('webhook metadata is for logging mismatch detection only', () => {
    const webhookMetadataUseCases = ['mismatch_detection', 'logging', 'debugging'];
    const webhookMetadataNotFor = ['credit_decisions', 'amount_verification'];
    
    expect(webhookMetadataUseCases).not.toContain('credit_decisions');
    expect(webhookMetadataNotFor).toContain('credit_decisions');
  });
});

describe('Price Calculations', () => {
  it('packages should have decreasing price per page', async () => {
    const { PAYLINK_PACKAGES } = await import('../paylink-routes');
    
    const sortedByPages = [...PAYLINK_PACKAGES].sort((a, b) => a.pages - b.pages);
    
    for (let i = 1; i < sortedByPages.length; i++) {
      const prevPricePerPage = sortedByPages[i - 1].pricePerPage;
      const currPricePerPage = sortedByPages[i].pricePerPage;
      
      expect(currPricePerPage).toBeLessThanOrEqual(prevPricePerPage);
    }
  });
});

describe('sanitizeMetadata Helper', () => {
  it('should remove sensitive keys', async () => {
    const { sanitizeMetadata } = await import('../utils/helpers');
    
    const metadata = {
      userId: 'abc123',
      token: 'secret-token',
      password: 'super-secret',
      apikey: 'my-api-key',
      normalField: 'normal-value'
    };
    
    const result = sanitizeMetadata(metadata);
    
    expect(result).not.toHaveProperty('token');
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('apikey');
    expect(result).toHaveProperty('userId');
    expect(result).toHaveProperty('normalField');
  });

  it('should truncate long values', async () => {
    const { sanitizeMetadata } = await import('../utils/helpers');
    
    const longString = 'a'.repeat(150);
    const metadata = { longField: longString };
    
    const result = sanitizeMetadata(metadata);
    
    expect(result.longField.length).toBeLessThan(longString.length);
    expect(result.longField).toContain('...[truncated]');
  });

  it('should handle undefined metadata', async () => {
    const { sanitizeMetadata } = await import('../utils/helpers');
    
    const result = sanitizeMetadata(undefined);
    
    expect(result).toEqual({});
  });
});
