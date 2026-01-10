import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import bcrypt from "bcrypt";
import crypto from "crypto";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import logger from "./logger";
import { sendVerificationEmail, sendWelcomeEmail, sendPasswordResetEmail } from "./email-service";
import rateLimit from "express-rate-limit";
import { validatePasswordStrength } from "./password-validator";
import { auditLog } from "./audit-logger";
import { checkAccountLock, recordFailedLogin, clearFailedLogins } from "./lockout-service";

const SALT_ROUNDS = 12;
const SESSION_DURATION_DAYS = 30;
const VERIFICATION_TOKEN_DURATION_HOURS = 24;
const EARLY_ADOPTER_LIMIT = 30; // First 30 users get bonus
const EARLY_ADOPTER_FREE_PAGES = 50; // 50 free pages for early adopters
const DEFAULT_FREE_PAGES = 2; // 2 free pages for all new users

// [ENTERPRISE v3.0] Session cookie configuration
const SESSION_COOKIE_NAME = process.env.NODE_ENV === 'production' ? '__Host-session' : 'session_token';
const SESSION_COOKIE_MAX_AGE = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000; // 30 days in ms

// [ENTERPRISE v3.0] Helper to set session cookie
function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // Lax allows OAuth redirects to work
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
}

// [ENTERPRISE v3.0] Helper to clear session cookie
function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

// Rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 min
  message: {
    error: "محاولات كثيرة، انتظر قليلاً",
    code: "AUTH_RATE_LIMIT",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// [SECURITY FIX v3.3.3] Account lockout now uses lockout-service.ts (Redis-backed)

// [SECURITY FIX v3.3.3] Stricter rate limit for password reset - prevents email enumeration
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Only 3 reset requests per hour per IP
  message: {
    error: "محاولات كثيرة لإعادة تعيين كلمة المرور، انتظر ساعة",
    code: "PASSWORD_RESET_RATE_LIMIT",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation schemas
const registerSchema = z.object({
  email: z.string().email("الإيميل غير صحيح"),
  password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
  name: z.string().min(2, "الاسم يجب أن يكون حرفين على الأقل").optional(),
  deviceId: z.string().min(10).max(100).optional(), // Link anonymous device usage to user account
});

const loginSchema = z.object({
  email: z.string().email("الإيميل غير صحيح"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
  deviceId: z.string().min(10).max(100).optional(), // Link anonymous device usage to user account
});

const forgotPasswordSchema = z.object({
  email: z.string().email("الإيميل غير صحيح"),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
});

// Helper to generate secure token
function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Helper to create session token
async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
  
  await storage.createUserSession({
    userId,
    token,
    expiresAt,
  });
  
  return token;
}

// [ENTERPRISE v3.0] Middleware to check authentication - supports both httpOnly cookie (primary) and Bearer token (legacy)
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // [ENTERPRISE v3.0] Primary: Check httpOnly cookie first
  let token: string | undefined = req.cookies?.[SESSION_COOKIE_NAME];
  let authMethod: 'cookie' | 'bearer' = 'cookie';
  
  // Legacy: Fall back to Authorization Bearer header if cookie not present
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
      authMethod = 'bearer';
    }
  }
  
  if (!token) {
    return res.status(401).json({
      error: "يجب تسجيل الدخول",
      code: "UNAUTHORIZED",
    });
  }
  
  try {
    const session = await storage.getUserSession(token);
    
    if (!session) {
      // Clear invalid cookie if it was used
      if (authMethod === 'cookie') {
        clearSessionCookie(res);
      }
      return res.status(401).json({
        error: "جلسة غير صالحة",
        code: "INVALID_SESSION",
      });
    }
    
    if (new Date(session.expiresAt) < new Date()) {
      await storage.deleteUserSession(token);
      if (authMethod === 'cookie') {
        clearSessionCookie(res);
      }
      return res.status(401).json({
        error: "انتهت صلاحية الجلسة",
        code: "SESSION_EXPIRED",
      });
    }
    
    const user = await storage.getUserById(session.userId);
    if (!user) {
      return res.status(401).json({
        error: "المستخدم غير موجود",
        code: "USER_NOT_FOUND",
      });
    }
    
    (req as any).user = user;
    (req as any).sessionToken = token;
    (req as any).authMethod = authMethod;
    next();
  } catch (error) {
    logger.error("Auth middleware error", { error: (error as Error).message });
    return res.status(500).json({
      error: "خطأ في التحقق من الجلسة",
      code: "AUTH_ERROR",
    });
  }
}

// Configure Google OAuth Strategy
function setupGoogleStrategy() {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDebug = process.env.DEBUG === 'true';
  
  // [IMPROVEMENT 3] Only log configuration details in development with DEBUG=true
  if (!isProduction && isDebug) {
    logger.info("Checking Google OAuth environment variables", {
      hasGOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      hasGOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    });
  }
  
  // Support multiple naming conventions for environment variables
  const clientID = process.env.GOOGLE_CLIENT_ID || process.env.google_Client_ID || process.env.GOOGLE_CLIENT_ID_REPLIT;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.google_Client_secrets || process.env.GOOGLE_CLIENT_SECRET_REPLIT;
  
  if (!clientID || !clientSecret) {
    logger.error("Google OAuth credentials missing - check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  }
  
  const appUrl = process.env.APP_URL || "http://localhost:5000";
  const callbackURL = process.env.GOOGLE_CALLBACK_URL || `${appUrl}/api/auth/google/callback`;
  
  // [IMPROVEMENT 3] Only log non-sensitive config info
  logger.info("Google OAuth configuration", { 
    callbackURL,
    hasClientID: !!clientID,
    hasClientSecret: !!clientSecret,
  });
  
  if (!clientID || !clientSecret) {
    logger.warn("Google OAuth DISABLED - missing credentials");
    return false;
  }
  
  // [IMPROVEMENT 3] Only validate format in development with DEBUG
  if (!isProduction && isDebug) {
    if (!clientID.includes('.apps.googleusercontent.com')) {
      logger.warn("GOOGLE_CLIENT_ID format may be incorrect");
    }
  }
  
  try {
    passport.use(new GoogleStrategy({
      clientID,
      clientSecret,
      callbackURL,
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const email = profile.emails?.[0]?.value?.toLowerCase();
        const name = profile.displayName;
        const avatarUrl = profile.photos?.[0]?.value;
        
        logger.info("Google OAuth callback received", { 
          googleId, 
          email: email?.substring(0, 10) + '...',
          hasName: !!name,
          hasAvatar: !!avatarUrl
        });
        
        if (!email) {
          return done(new Error("لم نتمكن من الحصول على الإيميل من Google"), undefined);
        }
        
        // Check if user exists by Google ID
        let user = await storage.getUserByGoogleId(googleId);
        
        if (!user) {
          // Check if user exists by email (might have registered with email/password)
          user = await storage.getUserByEmail(email);
          
          if (user) {
            // Link Google account to existing user
            logger.info("Existing user logged in via Google", { userId: user.id, email });
          } else {
            // Check if early adopter (first 30 users)
            const userCount = await storage.countUsers();
            const isEarlyAdopter = userCount < EARLY_ADOPTER_LIMIT;
            
            // Create new user
            user = await storage.createUser({
              email,
              name,
              googleId,
              avatarUrl,
            });
            
            // Mark as verified since Google verified the email
            await storage.updateUserEmailVerified(user.id);
            
            // [FIX v2.9.11] Give pages with idempotency protection
            try {
              const tempDeviceId = `google_${user.id}`;
              
              // [FIX v2.9.15] Use atomic grant to prevent race conditions
              const grantResult = await storage.grantRegistrationBonusAtomic(tempDeviceId, user.id, isEarlyAdopter);
              if (grantResult.granted) {
                logger.info(isEarlyAdopter ? "✅ Early adopter bonus granted (atomic)" : "✅ Free pages granted (atomic)", { 
                  userId: user.id, 
                  deviceId: tempDeviceId,
                  pages: grantResult.pages,
                });
              }
            } catch (bonusError) {
              logger.warn("Could not grant free pages", { error: (bonusError as Error).message });
            }
            
            // Send welcome email
            sendWelcomeEmail(email, name).catch((err) => {
              logger.error("Failed to send welcome email", { email, error: err.message });
            });
            
            logger.info("✅ New user registered via Google", { 
              userId: user.id, 
              email,
              isEarlyAdopter,
              userNumber: userCount + 1
            });
          }
        }
        
        return done(null, user);
      } catch (error) {
        logger.error("❌ Google OAuth error in callback", { 
          error: (error as Error).message,
          stack: (error as Error).stack
        });
        return done(error as Error, undefined);
      }
    }));
    
    passport.serializeUser((user: any, done) => {
      done(null, user.id);
    });
    
    passport.deserializeUser(async (id: string, done) => {
      try {
        const user = await storage.getUserById(id);
        done(null, user);
      } catch (error) {
        done(error, undefined);
      }
    });
    
    logger.info("✅ Google OAuth strategy initialized successfully");
    return true;
  } catch (error) {
    logger.error("❌ Failed to initialize Google OAuth strategy", {
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    return false;
  }
}

export function registerAuthRoutes(app: Express): void {
  // Initialize Google Strategy
  const googleEnabled = setupGoogleStrategy();
  
  // Initialize Passport
  app.use(passport.initialize());
  
  // Register with email/password
  app.post("/api/auth/register", authLimiter, async (req: Request, res: Response) => {
    try {
      logger.info("📝 Registration attempt started", {
        email: req.body.email?.substring(0, 10) + '...',
        hasPassword: !!req.body.password,
        hasName: !!req.body.name,
        bodyKeys: Object.keys(req.body),
      });
      
      const parseResult = registerSchema.safeParse(req.body);
      if (!parseResult.success) {
        const friendlyError = fromZodError(parseResult.error);
        logger.error("❌ Registration validation failed", {
          error: friendlyError.message,
          issues: parseResult.error.issues,
        });
        return res.status(400).json({
          error: friendlyError.message,
          code: "VALIDATION_ERROR",
        });
      }
      
      const { email, password, name, deviceId } = parseResult.data;
      const normalizedEmail = email.toLowerCase();
      
      // Validate password strength
      const passwordStrengthCheck = validatePasswordStrength(password);
      if (!passwordStrengthCheck.isValid) {
        return res.status(400).json({
          error: "كلمة المرور ضعيفة جداً",
          code: "WEAK_PASSWORD",
          feedback: passwordStrengthCheck.feedback,
          score: passwordStrengthCheck.score
        });
      }
      
      logger.info("✅ Validation passed, checking if user exists", { 
        normalizedEmail: normalizedEmail.substring(0, 10) + '...' 
      });
      
      // Check if user exists
      const existingUser = await storage.getUserByEmail(normalizedEmail);
      if (existingUser) {
        logger.info("❌ User already exists", { 
          email: normalizedEmail.substring(0, 10) + '...' 
        });
        return res.status(409).json({
          error: "هذا الإيميل مسجل مسبقاً",
          code: "EMAIL_EXISTS",
        });
      }
      
      logger.info("✅ User doesn't exist, hashing password...");
      
      // Check if early adopter (first 30 users)
      const userCount = await storage.countUsers();
      const isEarlyAdopter = userCount < EARLY_ADOPTER_LIMIT;
      
      // Hash password
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      
      logger.info("✅ Password hashed, creating user in database...", {
        passwordHashLength: passwordHash.length,
      });
      
      // Create user - THIS IS WHERE IT MIGHT FAIL
      let user;
      try {
        user = await storage.createUser({
          email: normalizedEmail,
          passwordHash,
          name,
        });
        logger.info("✅ User created successfully", { 
          userId: user.id, 
          email: normalizedEmail.substring(0, 10) + '...',
          hasPasswordHash: !!user.passwordHash,
          emailVerified: user.emailVerified,
        });
      } catch (dbError: any) {
        logger.error("❌ Database error creating user", {
          error: dbError.message,
          code: dbError.code,
          detail: dbError.detail,
          constraint: dbError.constraint,
          stack: dbError.stack,
          insertData: {
            email: normalizedEmail.substring(0, 10) + '...',
            hasPasswordHash: !!passwordHash,
            passwordHashLength: passwordHash?.length,
            hasName: !!name,
          }
        });
        
        // Check for specific database errors
        if (dbError.code === '23505') { // Unique violation
          return res.status(409).json({
            error: "هذا الإيميل مسجل مسبقاً",
            code: "EMAIL_EXISTS",
          });
        }
        
        // Re-throw to be caught by outer catch
        throw dbError;
      }
      
      logger.info("Creating verification token...");
      
      // Create verification token
      const verificationToken = generateToken();
      const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_DURATION_HOURS * 60 * 60 * 1000);
      
      try {
        await storage.createEmailVerificationToken({
          userId: user.id,
          token: verificationToken,
          expiresAt,
        });
        logger.info("✅ Verification token created");
      } catch (tokenError: any) {
        logger.error("❌ Failed to create verification token", {
          error: tokenError.message,
          userId: user.id,
        });
        // Continue anyway - user is created
      }
      
      // Send verification email
      logger.info("Sending verification email...");
      const emailResult = await sendVerificationEmail(normalizedEmail, verificationToken, name);
      
      if (!emailResult.success) {
        logger.error("❌ Failed to send verification email", { 
          email: normalizedEmail.substring(0, 10) + '...',
          error: emailResult.error 
        });
      } else {
        logger.info("✅ Verification email sent successfully");
      }
      
      // [FIX v2.9.17] Grant registration bonus - linkDeviceToUser is DISABLED
      if (deviceId) {
        try {
          // [REMOVED v2.9.17] linkDeviceToUser is disabled - user_<id> is sole credit owner
          // await storage.linkDeviceToUser(deviceId, user.id);
          
          // [FIX v2.9.11] Give pages with idempotency protection
          const tempDeviceId = `email_${user.id}`;
          
          // [FIX v2.9.15] Use atomic grant to prevent race conditions
          const grantResult = await storage.grantRegistrationBonusAtomic(tempDeviceId, user.id, isEarlyAdopter);
          if (grantResult.granted) {
            logger.info(isEarlyAdopter ? "✅ Early adopter bonus granted to temp device (atomic)" : "✅ Free pages granted to temp device (atomic)", { 
              userId: user.id, 
              tempDeviceId: tempDeviceId.substring(0, 12) + '...',
              pages: grantResult.pages,
              isEarlyAdopter,
              userNumber: userCount + 1
            });
          }
        } catch (linkError) {
          logger.warn("Could not grant registration bonus", { error: (linkError as Error).message });
        }
      } else {
        // No deviceId provided, create temp device for pages
        try {
          const tempDeviceId = `email_${user.id}`;
          
          // [FIX v2.9.15] Use atomic grant even when no deviceId
          const grantResult = await storage.grantRegistrationBonusAtomic(tempDeviceId, user.id, isEarlyAdopter);
          if (grantResult.granted) {
            logger.info(isEarlyAdopter ? "✅ Early adopter bonus granted (no device, atomic)" : "✅ Free pages granted (no device, atomic)", { 
              userId: user.id, 
              pages: grantResult.pages,
              isEarlyAdopter,
              userNumber: userCount + 1
            });
          }
        } catch (bonusError) {
          logger.warn("Could not grant free pages", { error: (bonusError as Error).message });
        }
      }
      
      logger.info("✅ Registration completed successfully", {
        userId: user.id,
        isEarlyAdopter,
        userNumber: userCount + 1,
      });
      
      res.status(201).json({
        success: true,
        message: emailResult.success 
          ? "تم التسجيل بنجاح! تفقد بريدك الإلكتروني لتفعيل الحساب"
          : "تم التسجيل بنجاح! لم نتمكن من إرسال إيميل التفعيل، لكن يمكنك تسجيل الدخول",
        userId: user.id,
      });
    } catch (error: any) {
      logger.error("❌ Registration error (outer catch)", { 
        error: error.message,
        code: error.code,
        stack: error.stack,
        name: error.name,
      });
      return res.status(500).json({
        error: "حدث خطأ أثناء التسجيل",
        code: "REGISTRATION_ERROR",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  });
  
  // Login with email/password
  app.post("/api/auth/login", authLimiter, async (req: Request, res: Response) => {
    try {
      const parseResult = loginSchema.safeParse(req.body);
      if (!parseResult.success) {
        const friendlyError = fromZodError(parseResult.error);
        return res.status(400).json({
          error: friendlyError.message,
          code: "VALIDATION_ERROR",
        });
      }
      
      const { email, password, deviceId } = parseResult.data;
      const normalizedEmail = email.toLowerCase();
      
      // Check account lockout
      const lockStatus = await checkAccountLock(normalizedEmail);
      if (lockStatus.locked) {
        return res.status(429).json({
          error: "الحساب مقفل مؤقتاً بسبب محاولات تسجيل دخول فاشلة",
          code: "ACCOUNT_LOCKED",
          retryAfter: lockStatus.retryAfter,
        });
      }
      
      // Get user
      const user = await storage.getUserByEmail(normalizedEmail);
      if (!user) {
        await recordFailedLogin(normalizedEmail);
        return res.status(401).json({
          error: "الإيميل أو كلمة المرور غير صحيحة",
          code: "INVALID_CREDENTIALS",
        });
      }
      
      // Check if user has password (might be Google-only user)
      if (!user.passwordHash) {
        return res.status(401).json({
          error: "هذا الحساب مسجل عبر Google. استخدم تسجيل الدخول بـ Google.",
          code: "GOOGLE_ACCOUNT",
        });
      }
      
      // Verify password
      const passwordValid = await bcrypt.compare(password, user.passwordHash);
      if (!passwordValid) {
        await recordFailedLogin(normalizedEmail);
        
        // [ENTERPRISE v3.0] Audit log failed login
        await auditLog({
          actorType: 'user',
          actorId: normalizedEmail,
          action: 'AUTH_LOGIN_FAIL',
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { reason: 'invalid_password' },
        });
        
        return res.status(401).json({
          error: "الإيميل أو كلمة المرور غير صحيحة",
          code: "INVALID_CREDENTIALS",
        });
      }
      
      // Check if email is verified
      if (!user.emailVerified) {
        return res.status(403).json({
          error: "يجب تفعيل الإيميل أولاً",
          code: "EMAIL_NOT_VERIFIED",
          userId: user.id,
        });
      }
      
      // Clear failed login attempts on successful login
      await clearFailedLogins(normalizedEmail);
      
      // Create session
      const sessionToken = await createSession(user.id);
      
      // [ENTERPRISE v3.0] Set httpOnly session cookie (primary auth method)
      setSessionCookie(res, sessionToken);
      
      // [REMOVED v2.9.17] linkDeviceToUser is disabled - user_<id> is sole credit owner
      // Device linking no longer needed - credits are tracked by user_<userId>
      if (deviceId) {
        logger.info("Device ID provided on login (not linked in v2.9.17)", { deviceId: deviceId.substring(0, 8) + '...', userId: user.id });
      }
      
      logger.info("User logged in", { userId: user.id, email: normalizedEmail, authMethod: 'cookie' });
      
      // [ENTERPRISE v3.0] Audit log successful login
      await auditLog({
        actorType: 'user',
        actorId: String(user.id),
        action: 'AUTH_LOGIN_SUCCESS',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { email: normalizedEmail, method: 'password' },
      });
      
      // [ENTERPRISE v3.0] Still return token in JSON for legacy clients
      res.json({
        success: true,
        token: sessionToken, // Legacy: returned for backward compatibility
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
      });
    } catch (error) {
      logger.error("Login error", { error: (error as Error).message });
      res.status(500).json({
        error: "حدث خطأ أثناء تسجيل الدخول",
        code: "LOGIN_ERROR",
      });
    }
  });
  
  // Verify email
  app.get("/api/auth/verify-email/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      
      const verificationToken = await storage.getEmailVerificationToken(token);
      
      if (!verificationToken) {
        // [SECURITY FIX v4.3] Uniform response to prevent enumeration
        return res.json({
          success: true,
          message: "إذا كان الرابط صالحاً، تم تفعيل الإيميل",
        });
      }
      
      if (new Date(verificationToken.expiresAt) < new Date()) {
        await storage.deleteEmailVerificationToken(token);
        // [SECURITY FIX v4.3] Uniform response to prevent enumeration
        return res.json({
          success: true,
          message: "إذا كان الرابط صالحاً، تم تفعيل الإيميل",
        });
      }
      
      // Mark email as verified
      await storage.updateUserEmailVerified(verificationToken.userId);
      
      // Delete token
      await storage.deleteEmailVerificationToken(token);
      
      // Get user for welcome email
      const user = await storage.getUserById(verificationToken.userId);
      if (user) {
        sendWelcomeEmail(user.email, user.name || undefined).catch((err) => {
          logger.error("Failed to send welcome email", { error: err.message });
        });
      }
      
      logger.info("Email verified", { userId: verificationToken.userId });
      
      res.json({
        success: true,
        message: "تم تفعيل الإيميل بنجاح",
      });
    } catch (error) {
      logger.error("Email verification error", { error: (error as Error).message });
      res.status(500).json({
        error: "حدث خطأ أثناء تفعيل الإيميل",
        code: "VERIFICATION_ERROR",
      });
    }
  });
  
  // Resend verification email
  app.post("/api/auth/resend-verification", authLimiter, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({
          error: "الإيميل مطلوب",
          code: "EMAIL_REQUIRED",
        });
      }
      
      const user = await storage.getUserByEmail(email.toLowerCase());
      
      if (!user) {
        // Don't reveal if user exists
        return res.json({
          success: true,
          message: "إذا كان الإيميل مسجلاً، سيتم إرسال رابط التفعيل",
        });
      }
      
      if (user.emailVerified) {
        return res.status(400).json({
          error: "الإيميل مفعل مسبقاً",
          code: "ALREADY_VERIFIED",
        });
      }
      
      // Create new verification token
      const verificationToken = generateToken();
      const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_DURATION_HOURS * 60 * 60 * 1000);
      
      await storage.createEmailVerificationToken({
        userId: user.id,
        token: verificationToken,
        expiresAt,
      });
      
      // Send verification email
      await sendVerificationEmail(user.email, verificationToken, user.name || undefined);
      
      res.json({
        success: true,
        message: "تم إرسال رابط التفعيل",
      });
    } catch (error) {
      logger.error("Resend verification error", { error: (error as Error).message });
      res.status(500).json({
        error: "حدث خطأ أثناء إرسال رابط التفعيل",
        code: "RESEND_ERROR",
      });
    }
  });
  
  // [SECURITY FIX v3.3.3] Forgot password with stricter rate limiting
  app.post("/api/auth/forgot-password", passwordResetLimiter, async (req: Request, res: Response) => {
    try {
      const parseResult = forgotPasswordSchema.safeParse(req.body);
      if (!parseResult.success) {
        const friendlyError = fromZodError(parseResult.error);
        return res.status(400).json({
          error: friendlyError.message,
          code: "VALIDATION_ERROR",
        });
      }
      
      const { email } = parseResult.data;
      const user = await storage.getUserByEmail(email.toLowerCase());
      
      // Don't reveal if user exists
      if (!user || !user.passwordHash) {
        return res.json({
          success: true,
          message: "إذا كان الإيميل مسجلاً، سيتم إرسال رابط إعادة تعيين كلمة المرور",
        });
      }
      
      // Create reset token (reusing verification token table)
      const resetToken = generateToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      
      await storage.createEmailVerificationToken({
        userId: user.id,
        token: resetToken,
        expiresAt,
      });
      
      // Send reset email
      await sendPasswordResetEmail(user.email, resetToken, user.name || undefined);
      
      res.json({
        success: true,
        message: "إذا كان الإيميل مسجلاً، سيتم إرسال رابط إعادة تعيين كلمة المرور",
      });
    } catch (error) {
      logger.error("Forgot password error", { error: (error as Error).message });
      res.status(500).json({
        error: "حدث خطأ",
        code: "FORGOT_PASSWORD_ERROR",
      });
    }
  });
  
  // [SECURITY FIX v3.3.3] Reset password with password strength validation
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const parseResult = resetPasswordSchema.safeParse(req.body);
      if (!parseResult.success) {
        const friendlyError = fromZodError(parseResult.error);
        return res.status(400).json({
          error: friendlyError.message,
          code: "VALIDATION_ERROR",
        });
      }
      
      const { token, password } = parseResult.data;
      
      // [SECURITY FIX v3.3.3] Validate password strength on reset
      const passwordStrength = validatePasswordStrength(password);
      if (!passwordStrength.isValid) {
        return res.status(400).json({
          error: passwordStrength.feedback.join(', ') || 'كلمة المرور ضعيفة',
          code: "WEAK_PASSWORD",
        });
      }
      
      const resetToken = await storage.getEmailVerificationToken(token);
      
      if (!resetToken) {
        return res.status(400).json({
          error: "رابط إعادة التعيين غير صالح",
          code: "INVALID_TOKEN",
        });
      }
      
      if (new Date(resetToken.expiresAt) < new Date()) {
        await storage.deleteEmailVerificationToken(token);
        return res.status(400).json({
          error: "انتهت صلاحية رابط إعادة التعيين",
          code: "TOKEN_EXPIRED",
        });
      }
      
      // Hash new password
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      
      // Update password
      await storage.updateUserPassword(resetToken.userId, passwordHash);
      
      // Delete token
      await storage.deleteEmailVerificationToken(token);
      
      // Delete all sessions for this user (force re-login)
      await storage.deleteUserSessions(resetToken.userId);
      
      logger.info("Password reset", { userId: resetToken.userId });
      
      res.json({
        success: true,
        message: "تم تغيير كلمة المرور بنجاح",
      });
    } catch (error) {
      logger.error("Reset password error", { error: (error as Error).message });
      res.status(500).json({
        error: "حدث خطأ أثناء إعادة تعيين كلمة المرور",
        code: "RESET_PASSWORD_ERROR",
      });
    }
  });
  
  // Logout
  app.post("/api/auth/logout", requireAuth, async (req: Request, res: Response) => {
    try {
      const sessionToken = (req as any).sessionToken;
      await storage.deleteUserSession(sessionToken);
      
      // [ENTERPRISE v3.0] Clear session cookie on logout
      clearSessionCookie(res);
      
      res.json({
        success: true,
        message: "تم تسجيل الخروج",
      });
    } catch (error) {
      logger.error("Logout error", { error: (error as Error).message });
      res.status(500).json({
        error: "حدث خطأ أثناء تسجيل الخروج",
        code: "LOGOUT_ERROR",
      });
    }
  });
  
  // Get current user
  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
    });
  });
  
  // [FIX v2.9.16] Sync credits using Owner ID system
  app.post("/api/auth/sync-credits", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { deviceId } = req.body;
      
      if (!deviceId || typeof deviceId !== 'string') {
        return res.status(400).json({
          error: "معرف الجهاز مطلوب",
          code: "DEVICE_ID_REQUIRED",
        });
      }
      
      const userOwnerId = `user_${user.id}`;
      
      logger.info(`[sync-credits v2.9.16] Starting sync`, {
        userId: user.id.substring(0, 8),
        deviceId: deviceId.substring(0, 8),
        userOwnerId,
      });
      
      // Step 1: Check if user needs early adopter bonus (first time setup)
      const earlyAdopterCount = await storage.countEarlyAdopters();
      const isEarlyAdopter = earlyAdopterCount < EARLY_ADOPTER_LIMIT;
      const grantResult = await (storage as any).initializeUserOwnerCredits(user.id, isEarlyAdopter);
      
      if (grantResult.granted) {
        logger.info(`[sync-credits] Initial bonus granted`, {
          userId: user.id.substring(0, 8),
          pages: grantResult.pages,
          isEarlyAdopter,
        });
      }
      
      // Step 2: Transfer guest credits from this device (ONE TIME ONLY)
      const transferResult = await (storage as any).transferGuestCreditsToUserOwner(deviceId, user.id);
      
      if (transferResult.transferred) {
        logger.info(`[sync-credits] Guest credits transferred`, {
          userId: user.id.substring(0, 8),
          deviceId: deviceId.substring(0, 8),
          amount: transferResult.amount,
        });
      }
      
      // Step 3: Also transfer from temp devices (google_userId, email_userId)
      const googleTempId = `google_${user.id}`;
      const emailTempId = `email_${user.id}`;
      
      await (storage as any).transferGuestCreditsToUserOwner(googleTempId, user.id);
      await (storage as any).transferGuestCreditsToUserOwner(emailTempId, user.id);
      
      // Step 4: Get final user credits from their owner record
      const userCredits = await (storage as any).getCreditsForOwner(deviceId, user.id);
      
      logger.info(`[sync-credits] Sync complete`, {
        userId: user.id.substring(0, 8),
        pagesRemaining: userCredits?.pagesRemaining || 0,
      });
      
      res.json({
        success: true,
        pagesRemaining: userCredits?.pagesRemaining || 0,
        isEarlyAdopter: (userCredits as any)?.isEarlyAdopter || false,
        synced: true,
      });
    } catch (error) {
      logger.error("Sync credits error", { error: (error as Error).message });
      res.status(500).json({
        error: "حدث خطأ أثناء مزامنة الصفحات",
        code: "SYNC_CREDITS_ERROR",
      });
    }
  });
  
  // Google OAuth routes
  if (googleEnabled) {
    // [SECURITY FIX v2.9.32] Enable state parameter to prevent login CSRF
    app.get("/api/auth/google", passport.authenticate("google", {
      scope: ["profile", "email"],
      state: true,
    }));
    
    app.get("/api/auth/google/callback",
      passport.authenticate("google", { session: false, failureRedirect: "/auth?error=google_failed" }),
      async (req: Request, res: Response) => {
        try {
          const user = req.user as any;
          
          if (!user) {
            return res.redirect("/auth?error=google_failed");
          }
          
          // Create session
          const sessionToken = await createSession(user.id);
          
          // [ENTERPRISE v3.0] Set httpOnly session cookie (primary auth method)
          setSessionCookie(res, sessionToken);
          
          logger.info("Google login successful", { userId: user.id, authMethod: 'cookie' });
          
          // [ENTERPRISE v3.0] Audit log Google OAuth success
          await auditLog({
            actorType: 'user',
            actorId: String(user.id),
            action: 'GOOGLE_OAUTH_CALLBACK_SUCCESS',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
          });
          
          // [ENTERPRISE v3.0] By default, redirect WITHOUT token in URL (cookie carries auth)
          // Legacy mode: LEGACY_TOKEN_REDIRECT=true puts token in URL fragment for old clients
          const legacyRedirect = process.env.LEGACY_TOKEN_REDIRECT === 'true';
          
          if (legacyRedirect) {
            // [SECURITY FIX v2.9.32] Redirect with token in URL fragment (not query string)
            // Fragment is not sent to server in HTTP requests, protecting token from logs/referrer
            res.redirect(`/auth/callback#token=${sessionToken}`);
          } else {
            // [ENTERPRISE v3.0] No token in URL - cookie handles authentication
            res.redirect('/auth/callback');
          }
        } catch (error) {
          logger.error("Google callback error", { error: (error as Error).message });
          res.redirect("/auth?error=google_failed");
        }
      }
    );
  }
  
  // Check if Google OAuth is enabled
  app.get("/api/auth/providers", (req: Request, res: Response) => {
    res.json({
      google: googleEnabled,
      email: true,
    });
  });
}
