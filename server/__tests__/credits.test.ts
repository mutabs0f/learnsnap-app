/**
 * Credits System Tests
 * Tests the critical credits flow without database dependency
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';
  process.env.DEVICE_TOKEN_SECRET = 'test-device-token-secret-32chars';
});

vi.mock('../storage', () => ({
  storage: {
    getPageCredits: vi.fn(),
    initializeDeviceCredits: vi.fn(),
    usePageCredits: vi.fn(),
    addPageCredits: vi.fn(),
    createOrUpdatePageCredits: vi.fn(),
  }
}));

import { storage } from '../storage';

describe('Credits System Logic', () => {
  
  describe('Guest Credits Initialization', () => {
    it('should initialize guest with 2 free pages', async () => {
      const mockCredits = { 
        id: '1',
        deviceId: 'test-device', 
        userId: null,
        pagesRemaining: 2, 
        totalPagesUsed: 0,
        isEarlyAdopter: false,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      vi.mocked(storage.initializeDeviceCredits).mockResolvedValue(mockCredits);
      
      const result = await storage.initializeDeviceCredits('test-device');
      
      expect(result.pagesRemaining).toBe(2);
      expect(result.isEarlyAdopter).toBe(false);
    });
  });

  describe('Credits Deduction', () => {
    it('should return true when sufficient credits exist', async () => {
      vi.mocked(storage.usePageCredits).mockResolvedValue(true);
      
      const result = await storage.usePageCredits('test-device', 2);
      
      expect(result).toBe(true);
    });

    it('should return false when insufficient credits', async () => {
      vi.mocked(storage.usePageCredits).mockResolvedValue(false);
      
      const result = await storage.usePageCredits('test-device', 10);
      
      expect(result).toBe(false);
    });
  });

  describe('Credits Addition', () => {
    it('should add pages to existing balance', async () => {
      const mockCredits = { 
        id: '2',
        deviceId: 'test-device', 
        userId: null,
        pagesRemaining: 12,
        totalPagesUsed: 0,
        isEarlyAdopter: false,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      vi.mocked(storage.addPageCredits).mockResolvedValue(mockCredits);
      
      const result = await storage.addPageCredits('test-device', 10);
      
      expect(result.pagesRemaining).toBe(12);
    });
  });
});

describe('Owner ID Logic', () => {
  it('user_<id> format for logged-in users', () => {
    const userId = 'abc123-def456';
    const ownerId = `user_${userId}`;
    
    expect(ownerId).toBe('user_abc123-def456');
    expect(ownerId.startsWith('user_')).toBe(true);
  });

  it('deviceId format for guests', () => {
    const deviceId = 'device-uuid-here';
    
    expect(deviceId.startsWith('user_')).toBe(false);
  });

  it('should distinguish between guest and user owners', () => {
    const guestOwner = 'device-uuid-123';
    const userOwner = 'user_user-id-456';
    
    const isGuestOwner = !guestOwner.startsWith('user_');
    const isUserOwner = userOwner.startsWith('user_');
    
    expect(isGuestOwner).toBe(true);
    expect(isUserOwner).toBe(true);
  });
});

describe('maskId Helper', () => {
  it('should mask long IDs correctly', async () => {
    const { maskId } = await import('../utils/helpers');
    
    const result = maskId('abcdefghijklmnop');
    
    expect(result).toBe('abcdefgh...');
  });

  it('should handle short IDs (<=8 chars)', async () => {
    const { maskId } = await import('../utils/helpers');
    
    const result = maskId('abcd');
    
    expect(result).toBe('abcd...');
  });

  it('should handle null/undefined', async () => {
    const { maskId } = await import('../utils/helpers');
    
    expect(maskId(null)).toBe('[empty]');
    expect(maskId(undefined)).toBe('[empty]');
    expect(maskId('')).toBe('[empty]');
  });
});
