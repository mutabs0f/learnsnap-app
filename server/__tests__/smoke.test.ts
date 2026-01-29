/**
 * Backend Smoke Tests
 * Minimal regression net - tests existing behavior without changing it
 * 
 * Run: npx vitest run server/__tests__/smoke.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';

// A) Deterministic environment setup - set before any dynamic imports
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long-for-security';
  process.env.DEVICE_TOKEN_SECRET = 'test-device-token-secret-32chars';
});

import { getDeviceTokenSecret, isProduction } from '../env-helpers';

describe('Environment Helpers', () => {
  it('getDeviceTokenSecret returns string or undefined', () => {
    const secret = getDeviceTokenSecret();
    expect(secret === undefined || typeof secret === 'string').toBe(true);
  });

  it('isProduction returns boolean', () => {
    const prod = isProduction();
    expect(typeof prod).toBe('boolean');
  });

  it('isProduction returns false in test environment', () => {
    expect(isProduction()).toBe(false);
  });
});

describe('Server Configuration', () => {
  it('can import logger without crash', async () => {
    const { default: logger } = await import('../logger');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('can import config module without crash', async () => {
    const config = await import('../config');
    expect(config).toBeDefined();
  });
});

describe('Zod Schemas', () => {
  it('can import schemas without crash', async () => {
    const schemas = await import('../schemas');
    expect(schemas).toBeDefined();
  });
});

describe('API Versioning', () => {
  it('can import api-versioning without crash', async () => {
    const versioning = await import('../api-versioning');
    expect(versioning.apiVersionMiddleware).toBeDefined();
  });
});
