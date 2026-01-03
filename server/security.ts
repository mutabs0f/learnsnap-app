import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { doubleCsrf } from 'csrf-csrf';
import type { Express, Request, Response, NextFunction } from 'express';

// Global rate limiter - 100 requests per 15 minutes
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'عدد كبير من الطلبات، حاول لاحقاً' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth limiter - 5 attempts per 15 minutes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { error: 'عدد كبير من محاولات تسجيل الدخول، حاول لاحقاً' },
  standardHeaders: true,
  legacyHeaders: false,
});

// AI processing limiter - 10 requests per hour
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'تجاوزت حد المعالجة، انتظر ساعة' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Sensitive operations limiter
export const sensitiveOpsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'الكثير من المحاولات، انتظر ساعة' },
  standardHeaders: true,
  legacyHeaders: false,
});

export function setupSecurityMiddleware(app: Express): void {
  // CORS configuration
  app.use(cors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  // [SECURITY FIX v4.2] Additional security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Security headers with helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        // [SECURITY FIX v4.2] Remove unsafe-eval in production
        scriptSrc: process.env.NODE_ENV === 'production' 
          ? ["'self'", "'unsafe-inline'"]
          : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'", "https://api.lemonsqueezy.com", "https://*.sentry.io"],
        frameSrc: ["'self'", "https://*.lemonsqueezy.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: process.env.NODE_ENV === 'production' ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    } : false
  }));
}

// CSRF protection middleware (using csrf-csrf - maintained alternative to deprecated csurf)
const csrfSecret = process.env.SESSION_SECRET || 'dev-csrf-secret-min-32-characters-long';

const csrfUtilities = doubleCsrf({
  getSecret: () => csrfSecret,
  getSessionIdentifier: (req: Request) => (req as any).sessionID || req.ip || 'anonymous',
  cookieName: process.env.NODE_ENV === 'production' ? '__Host-csrf' : 'csrf-token',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 3600000,
  },
  getCsrfTokenFromRequest: (req: Request) => req.headers['csrf-token'] as string,
});

export const doubleCsrfProtection = csrfUtilities.doubleCsrfProtection;
export const generateToken = csrfUtilities.generateCsrfToken;

export function createCsrfProtection() {
  return doubleCsrfProtection;
}

// CSRF error handler
export function csrfErrorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  if (err.code !== 'EBADCSRFTOKEN') {
    return next(err);
  }
  
  // Handle CSRF token errors
  res.status(403).json({
    error: 'طلب غير صالح - يرجى إعادة تحميل الصفحة',
    code: 'CSRF_INVALID',
    suggestion: 'قم بتحديث الصفحة وحاول مرة أخرى',
  });
}
