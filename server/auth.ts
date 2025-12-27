import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { storage } from './storage';

interface ChildJWT {
  childId: string;
  parentId: string;
}

interface ParentJWT {
  userId: string;
  email: string;
}

export interface AuthRequest extends Request {
  child?: ChildJWT;
  parent?: ParentJWT;
  authenticatedChildId?: string;
  authenticatedParentId?: string;
}

// Alias for backward compatibility
export type ChildRequest = AuthRequest;

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'learnsnap-development-secret-key-min-32-chars';

// Parent session functions
export function generateParentToken(userId: string, email: string): string {
  return jwt.sign(
    { userId, email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyParentToken(token: string): ParentJWT {
  return jwt.verify(token, JWT_SECRET) as ParentJWT;
}

export function setParentCookie(res: Response, userId: string, email: string): void {
  const token = generateParentToken(userId, email);
  res.cookie('parentToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
}

export function clearParentCookie(res: Response): void {
  res.clearCookie('parentToken');
}

// Middleware to require parent session
export function requireParentSession(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.parentToken;
  
  if (!token) {
    return res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً' });
  }
  
  try {
    const decoded = verifyParentToken(token);
    req.parent = decoded;
    req.authenticatedParentId = decoded.userId;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'انتهت صلاحية الجلسة' });
  }
}

export function generateChildToken(childId: string, parentId: string): string {
  return jwt.sign(
    { childId, parentId },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

export function verifyChildToken(token: string): ChildJWT {
  return jwt.verify(token, JWT_SECRET) as ChildJWT;
}

export function requireChildAuth(req: ChildRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.childToken;
  
  if (!token) {
    return res.status(401).json({ error: 'غير مصرح - يرجى تسجيل الدخول' });
  }
  
  try {
    req.child = verifyChildToken(token);
    next();
  } catch (error) {
    res.status(401).json({ error: 'جلسة منتهية - يرجى تسجيل الدخول مجدداً' });
  }
}

export function setChildCookie(res: Response, childId: string, parentId: string): void {
  const token = generateChildToken(childId, parentId);
  res.cookie('childToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });
}

export function clearChildCookie(res: Response): void {
  res.clearCookie('childToken');
}

// Flexible middleware that allows either:
// 1. Child JWT cookie (for child learning flow)
// 2. Parent session cookie (for parent dashboard accessing child data)
export function requireChildAccess(req: AuthRequest, res: Response, next: NextFunction) {
  // First, try child JWT cookie (child learning flow)
  const childToken = req.cookies?.childToken;
  if (childToken) {
    try {
      const decoded = verifyChildToken(childToken);
      req.child = decoded;
      req.authenticatedChildId = decoded.childId;
      req.authenticatedParentId = decoded.parentId;
      return next();
    } catch (error) {
      // Token invalid, continue to check parent access
    }
  }
  
  // Second, check for parent session cookie (parent dashboard)
  const parentToken = req.cookies?.parentToken;
  if (parentToken) {
    try {
      const decoded = verifyParentToken(parentToken);
      const parentId = decoded.userId;
      req.parent = decoded;
      req.authenticatedParentId = parentId;
      
      // Get childId from request
      const childId = req.params.childId || req.params.id || req.query.childId as string || req.body?.childId;
      
      if (childId) {
        // Verify the child belongs to this parent
        storage.getChildById(childId).then(child => {
          if (child && child.parentId === parentId) {
            req.authenticatedChildId = childId;
            return next();
          }
          return res.status(403).json({ error: 'ليس لديك صلاحية لهذا الطفل' });
        }).catch(error => {
          console.error('Auth error:', error);
          return res.status(500).json({ error: 'خطأ في التحقق' });
        });
        return;
      }
      
      // Parent is authenticated but no childId in request - allow for parent-level access
      return next();
    } catch (error) {
      // Parent token invalid
    }
  }
  
  // No valid authentication
  return res.status(401).json({ error: 'غير مصرح - يرجى تسجيل الدخول' });
}
