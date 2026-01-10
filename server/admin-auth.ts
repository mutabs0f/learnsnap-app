/**
 * Admin Authentication Service (L6 Compliance)
 * 
 * Provides JWT-based admin authentication with:
 * - Session management (like regular users)
 * - Role-based access control (RBAC)
 * - Audit logging for all admin actions
 * - Rate limiting and lockout protection
 * 
 * @version 3.4.0
 */

import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { db } from "./db";
import { sql } from "drizzle-orm";
import logger from "./logger";
import { auditLog } from "./audit-logger";
import { apiError } from "./utils/helpers";
import { checkAccountLock, recordFailedLogin, clearFailedLogins } from "./lockout-service";

const isProduction = process.env.NODE_ENV === 'production';
const ADMIN_SESSION_TTL = 4 * 60 * 60 * 1000;
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || process.env.SESSION_SECRET;

if (!ADMIN_JWT_SECRET && isProduction) {
  throw new Error("ADMIN_JWT_SECRET or JWT_SECRET is required in production");
}

export interface AdminSession {
  adminId: string;
  role: 'super_admin' | 'admin' | 'support';
  email: string;
  permissions: string[];
  createdAt: number;
  expiresAt: number;
}

export interface AdminRequest extends Request {
  adminSession?: AdminSession;
}

const adminSessions = new Map<string, AdminSession>();

export const ADMIN_ROLES = {
  super_admin: ['*'],
  admin: ['stats.read', 'users.read', 'users.verify', 'reports.read', 'reports.update', 'devices.read', 'transactions.read'],
  support: ['stats.read', 'users.read', 'users.verify', 'reports.read'],
} as const;

export function hasPermission(session: AdminSession, permission: string): boolean {
  if (session.permissions.includes('*')) return true;
  return session.permissions.includes(permission);
}

export async function createAdminSession(adminId: string, email: string, role: keyof typeof ADMIN_ROLES): Promise<string> {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  
  const session: AdminSession = {
    adminId,
    role,
    email,
    permissions: [...ADMIN_ROLES[role]],
    createdAt: now,
    expiresAt: now + ADMIN_SESSION_TTL,
  };
  
  adminSessions.set(sessionId, session);
  
  const token = jwt.sign(
    { sessionId, adminId, role },
    ADMIN_JWT_SECRET!,
    { expiresIn: '4h' }
  );
  
  await auditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'ADMIN_SESSION_CREATE',
    metadata: { role, email: email.substring(0, 3) + '***' },
  });
  
  return token;
}

export async function validateAdminToken(token: string): Promise<AdminSession | null> {
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET!) as { sessionId: string; adminId: string };
    const session = adminSessions.get(decoded.sessionId);
    
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      adminSessions.delete(decoded.sessionId);
      return null;
    }
    
    return session;
  } catch {
    return null;
  }
}

/**
 * Authenticate admin with password
 * 
 * Security: Supports two modes:
 * 1. ADMIN_PASSWORD_HASH (bcrypt) - Preferred, secure
 * 2. ADMIN_PASSWORD (plaintext env) - Legacy fallback with timing-safe comparison
 * 
 * Production should use ADMIN_PASSWORD_HASH with a bcrypt hash like:
 * ADMIN_PASSWORD_HASH=$2b$12$... (generate with bcrypt.hash(password, 12))
 */
export async function authenticateAdminPassword(password: string): Promise<{ success: boolean; token?: string; error?: string }> {
  const adminEmail = 'admin@learnsnap.app';
  
  const lockStatus = await checkAccountLock(adminEmail);
  if (lockStatus.locked) {
    return { 
      success: false, 
      error: `Account locked. Try again in ${Math.ceil((lockStatus.retryAfter || 0) / 60)} minutes` 
    };
  }
  
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const envPassword = process.env.ADMIN_PASSWORD;
  
  if (!passwordHash && !envPassword) {
    logger.warn("Admin auth failed - no password configured");
    return { success: false, error: "Admin not configured" };
  }
  
  let isMatch = false;
  
  if (passwordHash) {
    try {
      isMatch = await bcrypt.compare(password, passwordHash);
    } catch (error) {
      logger.error("Admin password hash comparison failed", { error: (error as Error).message });
      return { success: false, error: "Authentication error" };
    }
  } else if (envPassword) {
    if (isProduction) {
      logger.warn("Using plaintext ADMIN_PASSWORD in production - migrate to ADMIN_PASSWORD_HASH");
    }
    const providedBuffer = Buffer.from(String(password || ''));
    const expectedBuffer = Buffer.from(envPassword);
    
    if (providedBuffer.length === expectedBuffer.length) {
      isMatch = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
    }
  }
  
  if (!isMatch) {
    await recordFailedLogin(adminEmail);
    await auditLog({
      actorType: 'admin',
      actorId: 'unknown',
      action: 'ADMIN_LOGIN_FAILED',
      metadata: { reason: 'invalid_password' },
    });
    return { success: false, error: "Invalid credentials" };
  }
  
  await clearFailedLogins(adminEmail);
  
  const adminId = 'admin_' + crypto.randomBytes(8).toString('hex');
  const token = await createAdminSession(adminId, adminEmail, 'super_admin');
  
  return { success: true, token };
}

export function requireAdminAuth(requiredPermission?: string) {
  return async (req: AdminRequest, res: Response, next: NextFunction) => {
    const adminEnabled = isProduction 
      ? process.env.ENABLE_ADMIN === 'true'
      : process.env.ENABLE_ADMIN !== 'false';
      
    if (!adminEnabled && isProduction) {
      return res.status(503).json(apiError("Admin dashboard disabled", "ADMIN_DISABLED"));
    }
    
    const authHeader = req.headers.authorization;
    const legacyPassword = req.headers["x-admin-password"] as string;
    
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const session = await validateAdminToken(token);
      
      if (!session) {
        return res.status(401).json(apiError("Invalid or expired admin session", "ADMIN_SESSION_INVALID"));
      }
      
      if (requiredPermission && !hasPermission(session, requiredPermission)) {
        await auditLog({
          actorType: 'admin',
          actorId: session.adminId,
          action: 'ADMIN_ACCESS_DENIED',
          metadata: { requiredPermission, role: session.role },
        });
        return res.status(403).json(apiError("Insufficient permissions", "PERMISSION_DENIED"));
      }
      
      req.adminSession = session;
      return next();
    }
    
    if (legacyPassword) {
      const result = await authenticateAdminPassword(legacyPassword);
      if (!result.success) {
        logger.warn("Admin legacy auth failed", { ip: req.ip, path: req.path });
        return res.status(401).json(apiError(result.error || "Unauthorized", "ADMIN_AUTH_FAILED"));
      }
      
      const session = await validateAdminToken(result.token!);
      if (session) {
        req.adminSession = session;
        res.setHeader('X-Admin-Token', result.token!);
      }
      return next();
    }
    
    return res.status(401).json(apiError("Admin authentication required", "ADMIN_AUTH_REQUIRED"));
  };
}

export function cleanupExpiredSessions(): void {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [sessionId, session] of adminSessions) {
    if (now > session.expiresAt) {
      adminSessions.delete(sessionId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.debug(`Cleaned up ${cleaned} expired admin sessions`);
  }
}

setInterval(cleanupExpiredSessions, 15 * 60 * 1000);
