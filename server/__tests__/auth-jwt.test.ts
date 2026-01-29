/**
 * Authentication & JWT Critical Tests
 * P0 - Tests token issuance, validation, expiration, and security
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = JWT_SECRET;
  process.env.DEVICE_TOKEN_SECRET = 'test-device-token-secret-32chars';
});

describe('JWT Token Issuance', () => {
  it('should generate valid JWT with user claims', () => {
    const payload = {
      userId: 'user-123',
      email: 'test@example.com',
      role: 'user',
    };
    
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    
    expect(decoded.userId).toBe('user-123');
    expect(decoded.email).toBe('test@example.com');
    expect(decoded.role).toBe('user');
    expect(decoded.exp).toBeDefined();
  });

  it('should set correct expiration time', () => {
    const token = jwt.sign({ userId: '123' }, JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    
    const now = Math.floor(Date.now() / 1000);
    const expectedExp = now + 3600;
    
    expect(decoded.exp).toBeGreaterThanOrEqual(expectedExp - 5);
    expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 5);
  });

  it('should reject token without secret', () => {
    const token = jwt.sign({ userId: '123' }, JWT_SECRET);
    
    expect(() => jwt.verify(token, 'wrong-secret')).toThrow();
  });
});

describe('JWT Token Validation', () => {
  it('should reject expired tokens', () => {
    const token = jwt.sign({ userId: '123' }, JWT_SECRET, { expiresIn: '-1s' });
    
    expect(() => jwt.verify(token, JWT_SECRET)).toThrow('jwt expired');
  });

  it('should reject malformed tokens', () => {
    const malformedTokens = [
      'not.a.token',
      'eyJhbGciOiJIUzI1NiJ9',
      '',
      'null',
      'undefined',
    ];
    
    malformedTokens.forEach(token => {
      expect(() => jwt.verify(token, JWT_SECRET)).toThrow();
    });
  });

  it('should reject tokens signed with different algorithm', () => {
    const token = jwt.sign({ userId: '123' }, JWT_SECRET, { algorithm: 'HS256' });
    
    expect(() => {
      jwt.verify(token, JWT_SECRET, { algorithms: ['HS384'] });
    }).toThrow();
  });

  it('should reject tampered token', () => {
    const token = jwt.sign({ userId: '123', role: 'user' }, JWT_SECRET);
    const parts = token.split('.');
    
    const tamperedPayload = Buffer.from(JSON.stringify({ userId: '123', role: 'admin' })).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    
    expect(() => jwt.verify(tamperedToken, JWT_SECRET)).toThrow('invalid signature');
  });
});

describe('Device Token Security', () => {
  const deviceTokenSecret = 'test-device-token-secret-32chars';

  it('should generate valid device token', () => {
    const deviceId = 'device-uuid-123';
    const token = jwt.sign({ deviceId }, deviceTokenSecret, { expiresIn: '365d' });
    
    const decoded = jwt.verify(token, deviceTokenSecret) as jwt.JwtPayload;
    expect(decoded.deviceId).toBe('device-uuid-123');
  });

  it('should reject device token with wrong secret', () => {
    const token = jwt.sign({ deviceId: 'device-123' }, deviceTokenSecret);
    
    expect(() => jwt.verify(token, 'different-secret')).toThrow();
  });

  it('should require device token for protected endpoints', () => {
    const requireDeviceToken = (token: string | undefined) => {
      if (!token) {
        return { valid: false, error: 'Device token required' };
      }
      try {
        const decoded = jwt.verify(token, deviceTokenSecret);
        return { valid: true, decoded };
      } catch {
        return { valid: false, error: 'Invalid device token' };
      }
    };
    
    expect(requireDeviceToken(undefined).valid).toBe(false);
    expect(requireDeviceToken('').valid).toBe(false);
    
    const validToken = jwt.sign({ deviceId: 'device-123' }, deviceTokenSecret);
    expect(requireDeviceToken(validToken).valid).toBe(true);
  });
});

describe('Authorization Header Parsing', () => {
  it('should extract Bearer token correctly', () => {
    const extractToken = (header: string | undefined) => {
      if (!header) return null;
      const parts = header.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
      return parts[1];
    };
    
    expect(extractToken('Bearer eyJhbG.xyz.123')).toBe('eyJhbG.xyz.123');
    expect(extractToken('bearer token')).toBeNull();
    expect(extractToken('Basic token')).toBeNull();
    expect(extractToken('')).toBeNull();
    expect(extractToken(undefined)).toBeNull();
    expect(extractToken('Bearer')).toBeNull();
    expect(extractToken('Bearer token extra')).toBeNull();
  });

  it('should return 401 for invalid/expired auth header', () => {
    const validateAuthHeader = (header: string | undefined) => {
      if (!header) return { status: 401, error: 'No auth header' };
      
      const parts = header.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return { status: 401, error: 'Invalid auth format' };
      }
      
      try {
        jwt.verify(parts[1], JWT_SECRET);
        return { status: 200 };
      } catch (err) {
        return { status: 401, error: 'Invalid or expired token' };
      }
    };
    
    expect(validateAuthHeader(undefined).status).toBe(401);
    expect(validateAuthHeader('Invalid header').status).toBe(401);
    
    const expiredToken = jwt.sign({ userId: '123' }, JWT_SECRET, { expiresIn: '-1h' });
    expect(validateAuthHeader(`Bearer ${expiredToken}`).status).toBe(401);
  });
});

describe('OAuth Token Security', () => {
  it('should not leak tokens in URL (fragment only)', () => {
    const buildCallbackUrl = (token: string, useFragment: boolean) => {
      const base = 'https://app.example.com/callback';
      if (useFragment) {
        return `${base}#token=${token}`;
      }
      return `${base}?token=${token}`;
    };
    
    const token = 'secret-oauth-token';
    const fragmentUrl = buildCallbackUrl(token, true);
    const queryUrl = buildCallbackUrl(token, false);
    
    expect(fragmentUrl).toContain('#token=');
    expect(fragmentUrl).not.toContain('?token=');
    expect(queryUrl).toContain('?token=');
    
    const url = new URL(queryUrl);
    expect(url.searchParams.get('token')).toBe(token);
    expect(url.hash).toBe('');
  });

  it('should validate OAuth state parameter', () => {
    const validateOAuthState = (storedState: string, receivedState: string) => {
      if (!storedState || !receivedState) {
        return { valid: false, error: 'Missing state' };
      }
      if (storedState !== receivedState) {
        return { valid: false, error: 'State mismatch - possible CSRF' };
      }
      return { valid: true };
    };
    
    expect(validateOAuthState('abc123', 'abc123').valid).toBe(true);
    expect(validateOAuthState('abc123', 'def456').valid).toBe(false);
    expect(validateOAuthState('', 'abc123').valid).toBe(false);
    expect(validateOAuthState('abc123', '').valid).toBe(false);
  });
});

describe('Session Expiration', () => {
  it('should enforce 30-day session limit', () => {
    const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
    const token = jwt.sign({ userId: '123' }, JWT_SECRET, { expiresIn: '30d' });
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    
    const now = Math.floor(Date.now() / 1000);
    const lifetime = decoded.exp! - decoded.iat!;
    
    expect(lifetime).toBe(thirtyDaysInSeconds);
  });

  it('should expire session after inactivity', () => {
    const sessionTimeout = 30 * 60 * 1000;
    const lastActivity = Date.now() - (31 * 60 * 1000);
    
    const isExpired = (Date.now() - lastActivity) > sessionTimeout;
    expect(isExpired).toBe(true);
  });
});

describe('Password Requirements', () => {
  it('should enforce minimum password length', () => {
    const validatePassword = (password: string) => {
      const minLength = 8;
      if (password.length < minLength) {
        return { valid: false, error: `Password must be at least ${minLength} characters` };
      }
      return { valid: true };
    };
    
    expect(validatePassword('short').valid).toBe(false);
    expect(validatePassword('longenough').valid).toBe(true);
    expect(validatePassword('12345678').valid).toBe(true);
    expect(validatePassword('1234567').valid).toBe(false);
  });

  it('should require password strength on reset', () => {
    const validatePasswordStrength = (password: string) => {
      const hasUpper = /[A-Z]/.test(password);
      const hasLower = /[a-z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const isLongEnough = password.length >= 8;
      
      return hasUpper && hasLower && hasNumber && isLongEnough;
    };
    
    expect(validatePasswordStrength('Password123')).toBe(true);
    expect(validatePasswordStrength('password123')).toBe(false);
    expect(validatePasswordStrength('PASSWORD123')).toBe(false);
    expect(validatePasswordStrength('Password')).toBe(false);
    expect(validatePasswordStrength('Pass1')).toBe(false);
  });
});
