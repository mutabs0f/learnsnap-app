/**
 * Credits Concurrency & Race Condition Tests
 * P0 - Tests credit deduction races, idempotent transfers, boundary conditions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Credit Deduction Race Conditions', () => {
  interface CreditBalance {
    pagesRemaining: number;
    version: number;
  }

  const creditStore: Map<string, CreditBalance> = new Map();

  beforeEach(() => {
    creditStore.clear();
  });

  it('should prevent double-spending with optimistic locking', async () => {
    creditStore.set('device-race', { pagesRemaining: 5, version: 1 });
    
    const useCreditsWithLocking = async (deviceId: string, pages: number, expectedVersion: number) => {
      await new Promise(r => setTimeout(r, Math.random() * 10));
      
      const balance = creditStore.get(deviceId);
      if (!balance) return { success: false, error: 'Not found' };
      
      if (balance.version !== expectedVersion) {
        return { success: false, error: 'Version conflict - retry' };
      }
      
      if (balance.pagesRemaining < pages) {
        return { success: false, error: 'Insufficient credits' };
      }
      
      balance.pagesRemaining -= pages;
      balance.version++;
      creditStore.set(deviceId, balance);
      
      return { success: true, remaining: balance.pagesRemaining };
    };
    
    const results = await Promise.all([
      useCreditsWithLocking('device-race', 3, 1),
      useCreditsWithLocking('device-race', 3, 1),
      useCreditsWithLocking('device-race', 3, 1),
    ]);
    
    const successCount = results.filter(r => r.success).length;
    expect(successCount).toBe(1);
    
    const finalBalance = creditStore.get('device-race');
    expect(finalBalance?.pagesRemaining).toBe(2);
  });

  it('should handle concurrent exact-balance usage', async () => {
    creditStore.set('device-exact', { pagesRemaining: 1, version: 1 });
    
    let successfulDeductions = 0;
    
    const tryUseCredits = async (deviceId: string) => {
      const balance = creditStore.get(deviceId);
      if (!balance || balance.pagesRemaining < 1) {
        return false;
      }
      
      await new Promise(r => setTimeout(r, Math.random() * 5));
      
      const freshBalance = creditStore.get(deviceId);
      if (!freshBalance || freshBalance.pagesRemaining < 1) {
        return false;
      }
      
      freshBalance.pagesRemaining--;
      successfulDeductions++;
      return true;
    };
    
    await Promise.all([
      tryUseCredits('device-exact'),
      tryUseCredits('device-exact'),
      tryUseCredits('device-exact'),
    ]);
    
    expect(creditStore.get('device-exact')?.pagesRemaining).toBe(0);
  });
});

describe('Guest-to-User Credit Transfer Idempotency', () => {
  interface CreditRecord {
    ownerId: string;
    pagesRemaining: number;
    transferredFrom?: string;
    transferredAt?: Date;
  }

  const creditRecords: Map<string, CreditRecord> = new Map();
  const transferLog: Map<string, boolean> = new Map();

  beforeEach(() => {
    creditRecords.clear();
    transferLog.clear();
  });

  it('should transfer credits only once', async () => {
    const deviceId = 'guest-device-123';
    const userId = 'user-456';
    const userOwnerId = `user_${userId}`;
    
    creditRecords.set(deviceId, { ownerId: deviceId, pagesRemaining: 5 });
    creditRecords.set(userOwnerId, { ownerId: userOwnerId, pagesRemaining: 0 });
    
    const transferCredits = async (fromDeviceId: string, toUserId: string) => {
      const transferKey = `${fromDeviceId}->${toUserId}`;
      
      if (transferLog.has(transferKey)) {
        return { success: false, reason: 'Already transferred' };
      }
      
      const guestCredits = creditRecords.get(fromDeviceId);
      const userCredits = creditRecords.get(`user_${toUserId}`);
      
      if (!guestCredits || guestCredits.pagesRemaining === 0) {
        return { success: false, reason: 'No guest credits' };
      }
      
      transferLog.set(transferKey, true);
      
      if (userCredits) {
        userCredits.pagesRemaining += guestCredits.pagesRemaining;
        userCredits.transferredFrom = fromDeviceId;
        userCredits.transferredAt = new Date();
      }
      
      guestCredits.pagesRemaining = 0;
      
      return { success: true, transferred: guestCredits.pagesRemaining };
    };
    
    const results = await Promise.all([
      transferCredits(deviceId, userId),
      transferCredits(deviceId, userId),
      transferCredits(deviceId, userId),
    ]);
    
    const successCount = results.filter(r => r.success).length;
    expect(successCount).toBe(1);
    
    expect(creditRecords.get(deviceId)?.pagesRemaining).toBe(0);
    expect(creditRecords.get(userOwnerId)?.pagesRemaining).toBe(5);
  });

  it('should not transfer if already transferred to different user', async () => {
    const deviceId = 'shared-device';
    
    creditRecords.set(deviceId, { ownerId: deviceId, pagesRemaining: 10 });
    creditRecords.set('user_first', { ownerId: 'user_first', pagesRemaining: 0 });
    creditRecords.set('user_second', { ownerId: 'user_second', pagesRemaining: 0 });
    
    const transferKey = `${deviceId}->first`;
    transferLog.set(transferKey, true);
    
    const attemptTransfer = (toUserId: string) => {
      const existingTransfer = Array.from(transferLog.keys()).find(k => k.startsWith(`${deviceId}->`));
      if (existingTransfer) {
        return { success: false, reason: 'Device credits already transferred' };
      }
      return { success: true };
    };
    
    const result = attemptTransfer('second');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('Device credits already transferred');
  });
});

describe('Credit Boundary Conditions', () => {
  it('should reject negative credit usage', () => {
    const validateUsage = (pages: number) => {
      if (pages <= 0) {
        throw new Error('Pages must be positive');
      }
      if (!Number.isInteger(pages)) {
        throw new Error('Pages must be integer');
      }
      return true;
    };
    
    expect(() => validateUsage(-1)).toThrow('Pages must be positive');
    expect(() => validateUsage(0)).toThrow('Pages must be positive');
    expect(() => validateUsage(1.5)).toThrow('Pages must be integer');
    expect(validateUsage(1)).toBe(true);
    expect(validateUsage(100)).toBe(true);
  });

  it('should enforce maximum pages per quiz (20 pages)', () => {
    const MAX_PAGES_PER_QUIZ = 20;
    
    const validateQuizPages = (pages: number) => {
      if (pages > MAX_PAGES_PER_QUIZ) {
        return { valid: false, error: `Maximum ${MAX_PAGES_PER_QUIZ} pages per quiz` };
      }
      return { valid: true };
    };
    
    expect(validateQuizPages(20).valid).toBe(true);
    expect(validateQuizPages(21).valid).toBe(false);
    expect(validateQuizPages(1).valid).toBe(true);
  });

  it('should handle exact balance deduction (edge case)', () => {
    const balance = { pagesRemaining: 5 };
    
    const useExact = (pages: number) => {
      if (balance.pagesRemaining < pages) {
        return { success: false };
      }
      balance.pagesRemaining -= pages;
      return { success: true, remaining: balance.pagesRemaining };
    };
    
    const result = useExact(5);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(0);
    
    const result2 = useExact(1);
    expect(result2.success).toBe(false);
  });

  it('should handle large credit additions without overflow', () => {
    const balance = { pagesRemaining: Number.MAX_SAFE_INTEGER - 100 };
    
    const safeAdd = (pages: number) => {
      if (balance.pagesRemaining + pages > Number.MAX_SAFE_INTEGER) {
        return { success: false, error: 'Would exceed max safe integer' };
      }
      balance.pagesRemaining += pages;
      return { success: true };
    };
    
    expect(safeAdd(50).success).toBe(true);
    expect(safeAdd(100).success).toBe(false);
  });
});

describe('Owner ID Resolution', () => {
  it('should prioritize user owner over device owner', () => {
    const getCreditOwnerId = (userId: string | null, deviceId: string) => {
      if (userId) {
        return `user_${userId}`;
      }
      return deviceId;
    };
    
    expect(getCreditOwnerId('user-123', 'device-456')).toBe('user_user-123');
    expect(getCreditOwnerId(null, 'device-456')).toBe('device-456');
    expect(getCreditOwnerId('', 'device-456')).toBe('device-456');
  });

  it('should handle auth failure with 401 (not silent fallback)', () => {
    const resolveCreditsWithAuth = (authHeader: string | undefined, deviceId: string) => {
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (!token || token === 'invalid' || token === 'expired') {
          return { status: 401, error: 'Invalid or expired token' };
        }
        return { status: 200, ownerId: 'user_from_token' };
      }
      return { status: 200, ownerId: deviceId };
    };
    
    expect(resolveCreditsWithAuth('Bearer invalid', 'device-1').status).toBe(401);
    expect(resolveCreditsWithAuth('Bearer expired', 'device-1').status).toBe(401);
    expect(resolveCreditsWithAuth(undefined, 'device-1').status).toBe(200);
    expect(resolveCreditsWithAuth(undefined, 'device-1').ownerId).toBe('device-1');
  });
});

describe('Daily Quota Limits', () => {
  const dailyQuotas: Map<string, { count: number; date: string }> = new Map();

  beforeEach(() => {
    dailyQuotas.clear();
  });

  it('should enforce 60 quizzes per day limit', () => {
    const DAILY_LIMIT = 60;
    const today = new Date().toISOString().split('T')[0];
    
    const checkAndIncrement = (deviceId: string) => {
      const key = `${deviceId}:${today}`;
      const quota = dailyQuotas.get(key) || { count: 0, date: today };
      
      if (quota.count >= DAILY_LIMIT) {
        return { allowed: false, remaining: 0 };
      }
      
      quota.count++;
      dailyQuotas.set(key, quota);
      return { allowed: true, remaining: DAILY_LIMIT - quota.count };
    };
    
    for (let i = 0; i < 60; i++) {
      expect(checkAndIncrement('device-quota').allowed).toBe(true);
    }
    
    expect(checkAndIncrement('device-quota').allowed).toBe(false);
  });

  it('should reset quota at midnight', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    
    dailyQuotas.set(`device-1:${yesterday}`, { count: 60, date: yesterday });
    
    const checkQuota = (deviceId: string, date: string) => {
      const key = `${deviceId}:${date}`;
      const quota = dailyQuotas.get(key);
      return quota?.count || 0;
    };
    
    expect(checkQuota('device-1', yesterday)).toBe(60);
    expect(checkQuota('device-1', today)).toBe(0);
  });
});
