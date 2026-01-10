/**
 * Feature Flags & Maintenance Mode Tests
 * P1 - Tests real feature-flags.ts implementation
 * [L7 v3.5.2] Updated for async Redis persistence methods
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';
  process.env.ALLOW_DEV_JWT_FALLBACK = 'true';
  delete process.env.MAINTENANCE_MODE;
  delete process.env.DISABLE_AI_GENERATION;
  delete process.env.DISABLE_PAYMENTS;
  delete process.env.READ_ONLY_MODE;
  delete process.env.REDIS_URL;
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
});

describe('FeatureFlagService - Real Implementation', () => {
  it('should return default values when no env vars set', async () => {
    const { featureFlags } = await import('../feature-flags');
    
    expect(featureFlags.isEnabled('MAINTENANCE_MODE')).toBe(false);
    expect(featureFlags.isEnabled('DISABLE_AI_GENERATION')).toBe(false);
    expect(featureFlags.isEnabled('DISABLE_PAYMENTS')).toBe(false);
    expect(featureFlags.isEnabled('READ_ONLY_MODE')).toBe(false);
  });

  it('should allow runtime override of flags', async () => {
    const { featureFlags } = await import('../feature-flags');
    
    expect(featureFlags.isEnabled('MAINTENANCE_MODE')).toBe(false);
    
    await featureFlags.setFlag('MAINTENANCE_MODE', true);
    expect(featureFlags.isEnabled('MAINTENANCE_MODE')).toBe(true);
    
    await featureFlags.setFlag('MAINTENANCE_MODE', false);
    expect(featureFlags.isEnabled('MAINTENANCE_MODE')).toBe(false);
  });

  it('should clear overrides and revert to default', async () => {
    const { featureFlags } = await import('../feature-flags');
    
    await featureFlags.setFlag('DISABLE_AI_GENERATION', true);
    expect(featureFlags.isEnabled('DISABLE_AI_GENERATION')).toBe(true);
    
    await featureFlags.clearOverride('DISABLE_AI_GENERATION');
    expect(featureFlags.isEnabled('DISABLE_AI_GENERATION')).toBe(false);
  });

  it('should clear all overrides', async () => {
    const { featureFlags } = await import('../feature-flags');
    
    await featureFlags.setFlag('MAINTENANCE_MODE', true);
    await featureFlags.setFlag('DISABLE_AI_GENERATION', true);
    await featureFlags.setFlag('DISABLE_PAYMENTS', true);
    
    expect(featureFlags.isEnabled('MAINTENANCE_MODE')).toBe(true);
    expect(featureFlags.isEnabled('DISABLE_AI_GENERATION')).toBe(true);
    expect(featureFlags.isEnabled('DISABLE_PAYMENTS')).toBe(true);
    
    await featureFlags.clearAllOverrides();
    
    expect(featureFlags.isEnabled('MAINTENANCE_MODE')).toBe(false);
    expect(featureFlags.isEnabled('DISABLE_AI_GENERATION')).toBe(false);
    expect(featureFlags.isEnabled('DISABLE_PAYMENTS')).toBe(false);
  });

  it('should return all flags with sources', async () => {
    const { featureFlags } = await import('../feature-flags');
    
    await featureFlags.setFlag('MAINTENANCE_MODE', true);
    
    const allFlags = featureFlags.getAllFlags();
    
    expect(allFlags['MAINTENANCE_MODE'].value).toBe(true);
    expect(allFlags['MAINTENANCE_MODE'].source).toBe('runtime');
    expect(allFlags['DISABLE_AI_GENERATION'].source).toBe('default');
  });

  it('should report Redis connection status', async () => {
    const { featureFlags } = await import('../feature-flags');
    
    expect(featureFlags.isRedisConnected()).toBe(false);
  });
});

describe('Feature Flag Helper Functions', () => {
  it('isMaintenanceMode returns correct value', async () => {
    const { featureFlags, isMaintenanceMode } = await import('../feature-flags');
    
    expect(isMaintenanceMode()).toBe(false);
    
    await featureFlags.setFlag('MAINTENANCE_MODE', true);
    expect(isMaintenanceMode()).toBe(true);
  });

  it('isAIDisabled returns correct value', async () => {
    const { featureFlags, isAIDisabled } = await import('../feature-flags');
    
    expect(isAIDisabled()).toBe(false);
    
    await featureFlags.setFlag('DISABLE_AI_GENERATION', true);
    expect(isAIDisabled()).toBe(true);
  });

  it('arePaymentsDisabled returns correct value', async () => {
    const { featureFlags, arePaymentsDisabled } = await import('../feature-flags');
    
    expect(arePaymentsDisabled()).toBe(false);
    
    await featureFlags.setFlag('DISABLE_PAYMENTS', true);
    expect(arePaymentsDisabled()).toBe(true);
  });

  it('isReadOnlyMode returns correct value', async () => {
    const { featureFlags, isReadOnlyMode } = await import('../feature-flags');
    
    expect(isReadOnlyMode()).toBe(false);
    
    await featureFlags.setFlag('READ_ONLY_MODE', true);
    expect(isReadOnlyMode()).toBe(true);
  });

  it('isRegistrationDisabled returns correct value', async () => {
    const { featureFlags, isRegistrationDisabled } = await import('../feature-flags');
    
    expect(isRegistrationDisabled()).toBe(false);
    
    await featureFlags.setFlag('DISABLE_REGISTRATION', true);
    expect(isRegistrationDisabled()).toBe(true);
  });

  it('isReducedConcurrency returns correct value', async () => {
    const { featureFlags, isReducedConcurrency } = await import('../feature-flags');
    
    expect(isReducedConcurrency()).toBe(false);
    
    await featureFlags.setFlag('REDUCED_AI_CONCURRENCY', true);
    expect(isReducedConcurrency()).toBe(true);
  });
});

describe('Environment Variable Loading', () => {
  it('should load MAINTENANCE_MODE from env', async () => {
    process.env.MAINTENANCE_MODE = 'true';
    const { featureFlags } = await import('../feature-flags');
    
    expect(featureFlags.isEnabled('MAINTENANCE_MODE')).toBe(true);
  });

  it('should load DISABLE_AI_GENERATION from env', async () => {
    process.env.DISABLE_AI_GENERATION = '1';
    const { featureFlags } = await import('../feature-flags');
    
    expect(featureFlags.isEnabled('DISABLE_AI_GENERATION')).toBe(true);
  });

  it('should prioritize runtime override over env', async () => {
    process.env.MAINTENANCE_MODE = 'true';
    const { featureFlags } = await import('../feature-flags');
    
    expect(featureFlags.isEnabled('MAINTENANCE_MODE')).toBe(true);
    
    await featureFlags.setFlag('MAINTENANCE_MODE', false);
    expect(featureFlags.isEnabled('MAINTENANCE_MODE')).toBe(false);
  });
});
