/**
 * Utility Helpers Tests - Real Implementation
 * Tests the actual helpers from server/utils/helpers.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';
  process.env.ALLOW_DEV_JWT_FALLBACK = 'true';
});

describe('maskId Helper - Real Implementation', () => {
  it('should mask long IDs correctly', async () => {
    const { maskId } = await import('../utils/helpers');
    
    expect(maskId('abcdefghijklmnop')).toBe('abcdefgh...');
    expect(maskId('1234567890abcdef')).toBe('12345678...');
  });

  it('should handle short IDs (<=8 chars)', async () => {
    const { maskId } = await import('../utils/helpers');
    
    expect(maskId('abcd')).toBe('abcd...');
    expect(maskId('12345678')).toBe('1234...');
  });

  it('should handle null/undefined/empty', async () => {
    const { maskId } = await import('../utils/helpers');
    
    expect(maskId(null)).toBe('[empty]');
    expect(maskId(undefined)).toBe('[empty]');
    expect(maskId('')).toBe('[empty]');
  });
});

describe('maskEmail Helper - Real Implementation', () => {
  it('should mask email addresses correctly', async () => {
    const { maskEmail } = await import('../utils/helpers');
    
    expect(maskEmail('user@example.com')).toBe('use***@example.com');
    expect(maskEmail('test@domain.org')).toBe('tes***@domain.org');
  });

  it('should handle short local parts', async () => {
    const { maskEmail } = await import('../utils/helpers');
    
    expect(maskEmail('ab@test.com')).toBe('***@test.com');
  });

  it('should handle null/undefined/empty', async () => {
    const { maskEmail } = await import('../utils/helpers');
    
    expect(maskEmail(null)).toBe('[empty]');
    expect(maskEmail(undefined)).toBe('[empty]');
  });

  it('should handle invalid email format', async () => {
    const { maskEmail } = await import('../utils/helpers');
    
    expect(maskEmail('noemail')).toBe('***');
  });
});

describe('sanitizeMetadata Helper - Real Implementation', () => {
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

describe('getCreditOwnerId Helper - Real Implementation', () => {
  it('should return user_<id> for logged-in users', async () => {
    const { getCreditOwnerId } = await import('../utils/helpers');
    
    expect(getCreditOwnerId('device-123', 'user-456')).toBe('user_user-456');
  });

  it('should return deviceId for guests', async () => {
    const { getCreditOwnerId } = await import('../utils/helpers');
    
    expect(getCreditOwnerId('device-123', null)).toBe('device-123');
    expect(getCreditOwnerId('device-123', undefined)).toBe('device-123');
  });

  it('should handle empty userId as guest', async () => {
    const { getCreditOwnerId } = await import('../utils/helpers');
    
    expect(getCreditOwnerId('device-abc', '')).toBe('device-abc');
  });
});

describe('extractBearerToken Helper - Real Implementation', () => {
  it('should extract Bearer token correctly', async () => {
    const { extractBearerToken } = await import('../utils/helpers');
    
    expect(extractBearerToken('Bearer eyJhbG.xyz.123')).toBe('eyJhbG.xyz.123');
    expect(extractBearerToken('Bearer some-token')).toBe('some-token');
  });

  it('should return null for invalid headers', async () => {
    const { extractBearerToken } = await import('../utils/helpers');
    
    expect(extractBearerToken('bearer token')).toBeNull();
    expect(extractBearerToken('Basic token')).toBeNull();
    expect(extractBearerToken('')).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('NotBearer token')).toBeNull();
  });
});

describe('truncate Helper - Real Implementation', () => {
  it('should truncate long strings', async () => {
    const { truncate } = await import('../utils/helpers');
    
    const longString = 'a'.repeat(100);
    expect(truncate(longString, 50).length).toBe(53);
    expect(truncate(longString, 50)).toContain('...');
  });

  it('should not truncate short strings', async () => {
    const { truncate } = await import('../utils/helpers');
    
    expect(truncate('short', 50)).toBe('short');
  });

  it('should handle null/undefined', async () => {
    const { truncate } = await import('../utils/helpers');
    
    expect(truncate(null)).toBe('[empty]');
    expect(truncate(undefined)).toBe('[empty]');
  });
});

describe('API Response Helpers - Real Implementation', () => {
  it('apiSuccess returns correct structure', async () => {
    const { apiSuccess } = await import('../utils/helpers');
    
    const result = apiSuccess({ name: 'test' });
    
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'test' });
  });

  it('apiError returns correct structure', async () => {
    const { apiError } = await import('../utils/helpers');
    
    const result = apiError('Something went wrong', 'TEST_ERROR');
    
    expect(result.success).toBe(false);
    expect(result.error.message).toBe('Something went wrong');
    expect(result.error.code).toBe('TEST_ERROR');
  });

  it('apiSuccess with meta includes timestamp', async () => {
    const { apiSuccess } = await import('../utils/helpers');
    
    const result = apiSuccess({ id: 1 }, { requestId: 'req-123' });
    
    expect(result.meta).toBeDefined();
    expect(result.meta!.requestId).toBe('req-123');
    expect(result.meta!.timestamp).toBeDefined();
  });
});

describe('CREDIT_CONSTANTS - Real Implementation', () => {
  it('should have correct credit constants', async () => {
    const { CREDIT_CONSTANTS } = await import('../utils/helpers');
    
    expect(CREDIT_CONSTANTS.FREE_PAGES_GUEST).toBe(2);
    expect(CREDIT_CONSTANTS.DEFAULT_FREE_PAGES).toBe(2);
    expect(CREDIT_CONSTANTS.EARLY_ADOPTER_FREE_PAGES).toBe(50);
    expect(CREDIT_CONSTANTS.EARLY_ADOPTER_LIMIT).toBe(30);
  });
});
