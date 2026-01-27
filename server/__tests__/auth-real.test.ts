/**
 * Authentication Module Tests - Real Implementation
 * Tests the actual auth.ts module functions
 */

import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'test-session-secret-at-least-32-characters-long';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = TEST_SECRET;
  process.env.ALLOW_DEV_JWT_FALLBACK = 'true';
});

afterEach(() => {
  vi.resetModules();
});

describe('Parent Token Functions - Real Implementation', () => {
  it('generateParentToken creates valid JWT', async () => {
    const { generateParentToken } = await import('../auth');
    
    const token = generateParentToken('user-123', 'test@example.com');
    
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);
    
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    expect(decoded.userId).toBe('user-123');
    expect(decoded.email).toBe('test@example.com');
  });

  it('verifyParentToken validates correct token', async () => {
    const { generateParentToken, verifyParentToken } = await import('../auth');
    
    const token = generateParentToken('user-456', 'user@test.com');
    const decoded = verifyParentToken(token);
    
    expect(decoded.userId).toBe('user-456');
    expect(decoded.email).toBe('user@test.com');
  });

  it('verifyParentToken rejects invalid token', async () => {
    const { verifyParentToken } = await import('../auth');
    
    expect(() => verifyParentToken('invalid-token')).toThrow();
  });

  it('verifyParentToken rejects wrong secret', async () => {
    const wrongToken = jwt.sign(
      { userId: 'test', email: 'test@test.com' },
      'wrong-secret-key-32-characters-long'
    );
    
    const { verifyParentToken } = await import('../auth');
    
    expect(() => verifyParentToken(wrongToken)).toThrow();
  });
});

describe('Child Token Functions - Real Implementation', () => {
  it('generateChildToken creates valid JWT', async () => {
    const { generateChildToken } = await import('../auth');
    
    const token = generateChildToken('child-123', 'parent-456');
    
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    expect(decoded.childId).toBe('child-123');
    expect(decoded.parentId).toBe('parent-456');
  });

  it('verifyChildToken validates correct token', async () => {
    const { generateChildToken, verifyChildToken } = await import('../auth');
    
    const token = generateChildToken('child-789', 'parent-012');
    const decoded = verifyChildToken(token);
    
    expect(decoded.childId).toBe('child-789');
    expect(decoded.parentId).toBe('parent-012');
  });

  it('verifyChildToken rejects expired token', async () => {
    const expiredToken = jwt.sign(
      { childId: 'child', parentId: 'parent' },
      TEST_SECRET,
      { expiresIn: '-1s' }
    );
    
    const { verifyChildToken } = await import('../auth');
    
    expect(() => verifyChildToken(expiredToken)).toThrow('jwt expired');
  });
});

describe('Token Expiration - Real Implementation', () => {
  it('parent token expires in 7 days', async () => {
    const { generateParentToken } = await import('../auth');
    
    const token = generateParentToken('user-exp', 'exp@test.com');
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    
    const now = Math.floor(Date.now() / 1000);
    const expectedExp = now + (7 * 24 * 60 * 60);
    
    expect(decoded.exp).toBeGreaterThanOrEqual(expectedExp - 5);
    expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 5);
  });

  it('child token expires in 24 hours', async () => {
    const { generateChildToken } = await import('../auth');
    
    const token = generateChildToken('child-exp', 'parent-exp');
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    
    const now = Math.floor(Date.now() / 1000);
    const expectedExp = now + (24 * 60 * 60);
    
    expect(decoded.exp).toBeGreaterThanOrEqual(expectedExp - 5);
    expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 5);
  });
});

describe('Cookie Functions - Mock Verification', () => {
  it('setParentCookie sets correct options', async () => {
    const { setParentCookie } = await import('../auth');
    
    const mockRes = {
      cookie: vi.fn()
    } as any;
    
    setParentCookie(mockRes, 'user-cookie', 'cookie@test.com');
    
    expect(mockRes.cookie).toHaveBeenCalledTimes(1);
    expect(mockRes.cookie).toHaveBeenCalledWith(
      'parentToken',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
      })
    );
  });

  it('setChildCookie sets correct options', async () => {
    const { setChildCookie } = await import('../auth');
    
    const mockRes = {
      cookie: vi.fn()
    } as any;
    
    setChildCookie(mockRes, 'child-cookie', 'parent-cookie');
    
    expect(mockRes.cookie).toHaveBeenCalledTimes(1);
    expect(mockRes.cookie).toHaveBeenCalledWith(
      'childToken',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
      })
    );
  });

  it('clearParentCookie clears the cookie', async () => {
    const { clearParentCookie } = await import('../auth');
    
    const mockRes = {
      clearCookie: vi.fn()
    } as any;
    
    clearParentCookie(mockRes);
    
    expect(mockRes.clearCookie).toHaveBeenCalledWith('parentToken');
  });

  it('clearChildCookie clears the cookie', async () => {
    const { clearChildCookie } = await import('../auth');
    
    const mockRes = {
      clearCookie: vi.fn()
    } as any;
    
    clearChildCookie(mockRes);
    
    expect(mockRes.clearCookie).toHaveBeenCalledWith('childToken');
  });
});

describe('Middleware Functions - Mock Verification', () => {
  it('requireParentSession returns 401 without token', async () => {
    const { requireParentSession } = await import('../auth');
    
    const mockReq = { cookies: {} } as any;
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;
    const mockNext = vi.fn();
    
    requireParentSession(mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('requireChildAuth returns 401 without token', async () => {
    const { requireChildAuth } = await import('../auth');
    
    const mockReq = { cookies: {} } as any;
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;
    const mockNext = vi.fn();
    
    requireChildAuth(mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('requireParentSession calls next with valid token', async () => {
    const { generateParentToken, requireParentSession } = await import('../auth');
    
    const token = generateParentToken('valid-user', 'valid@test.com');
    
    const mockReq = { cookies: { parentToken: token } } as any;
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;
    const mockNext = vi.fn();
    
    requireParentSession(mockReq, mockRes, mockNext);
    
    expect(mockNext).toHaveBeenCalled();
    expect(mockReq.parent.userId).toBe('valid-user');
  });
});
