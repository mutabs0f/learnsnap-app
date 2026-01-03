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

const SALT_ROUNDS = 12;
const SESSION_DURATION_DAYS = 30;
const VERIFICATION_TOKEN_DURATION_HOURS = 24;
const EARLY_ADOPTER_LIMIT = 30; // First 30 users get bonus
const EARLY_ADOPTER_FREE_PAGES = 50; // 50 free pages for early adopters
const DEFAULT_FREE_PAGES = 2; // 2 free pages for all new users

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

// Account lockout tracking (in-memory, use Redis in production for multi-instance)
const loginAttempts = new Map<string, { count: number; lockUntil: number }>();

function checkAccountLock(email: string): { locked: boolean; retryAfter?: number } {
  const record = loginAttempts.get(email.toLowerCase());
  if (!record) return { locked: false };
  
  if (Date.now() < record.lockUntil) {
    return { 
      locked: true, 
      retryAfter: Math.ceil((record.lockUntil - Date.now()) / 1000) 
    };
  }
  
  // Lock expired, reset
  loginAttempts.delete(email.toLowerCase());
  return { locked: false };
}

function recordFailedLogin(email: string): void {
  const key = email.toLowerCase();
  const record = loginAttempts.get(key) || { count: 0, lockUntil: 0 };
  record.count++;
  
  // Progressive lockout: 5 fails = 15min, 10 fails = 1hr, 15+ fails = 24hr
  if (record.count >= 15) {
    record.lockUntil = Date.now() + 24 * 60 * 60 * 1000;
  } else if (record.count >= 10) {
    record.lockUntil = Date.now() + 60 * 60 * 1000;
  } else if (record.count >= 5) {
    record.lockUntil = Date.now() + 15 * 60 * 1000;
  }
  
  loginAttempts.set(key, record);
}

function clearFailedLogins(email: string): void {
  loginAttempts.delete(email.toLowerCase());
}

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

// Middleware to check authentication
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "يجب تسجيل الدخول",
      code: "UNAUTHORIZED",
    });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const session = await storage.getUserSession(token);
    
    if (!session) {
      return res.status(401).json({
        error: "جلسة غير صالحة",
        code: "INVALID_SESSION",
      });
    }
    
    if (new Date(session.expiresAt) < new Date()) {
      await storage.deleteUserSession(token);
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
  const clientID = process.env.GOOGLE_CLIENT_ID || process.env.google_Client_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.google_Client_secrets;
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
            
            // Give pages based on early adopter status
            try {
              const tempDeviceId = `google_${user.id}`;
              const freePages = isEarlyAdopter ? EARLY_ADOPTER_FREE_PAGES : DEFAULT_FREE_PAGES;
              await storage.addPageCredits(tempDeviceId, freePages);
              await storage.linkDeviceToUser(tempDeviceId, user.id);
              logger.info(isEarlyAdopter ? "✅ Early adopter bonus granted" : "✅ Free pages granted", { 
                userId: user.id, 
                pages: freePages,
                isEarlyAdopter,
                userNumber: userCount + 1
              });
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
      
      // Link device to user if deviceId provided
      if (deviceId) {
        try {
          await storage.linkDeviceToUser(deviceId, user.id);
          logger.info("✅ Device linked to user", { deviceId: deviceId.substring(0, 8) + '...', userId: user.id });
          
          // Give pages based on early adopter status
          const freePages = isEarlyAdopter ? EARLY_ADOPTER_FREE_PAGES : DEFAULT_FREE_PAGES;
          await storage.addPageCredits(deviceId, freePages);
          logger.info(isEarlyAdopter ? "✅ Early adopter bonus granted" : "✅ Free pages granted", { 
            userId: user.id, 
            deviceId: deviceId.substring(0, 8) + '...',
            pages: freePages,
            isEarlyAdopter,
            userNumber: userCount + 1
          });
        } catch (linkError) {
          logger.warn("Could not link device to user", { error: (linkError as Error).message });
        }
      } else {
        // No deviceId provided, create temp device for pages
        try {
          const tempDeviceId = `email_${user.id}`;
          const freePages = isEarlyAdopter ? EARLY_ADOPTER_FREE_PAGES : DEFAULT_FREE_PAGES;
          await storage.addPageCredits(tempDeviceId, freePages);
          await storage.linkDeviceToUser(tempDeviceId, user.id);
          logger.info(isEarlyAdopter ? "✅ Early adopter bonus granted (no device)" : "✅ Free pages granted (no device)", { 
            userId: user.id, 
            pages: freePages,
            isEarlyAdopter,
            userNumber: userCount + 1
          });
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
      const lockStatus = checkAccountLock(normalizedEmail);
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
        recordFailedLogin(normalizedEmail);
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
        recordFailedLogin(normalizedEmail);
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
      clearFailedLogins(normalizedEmail);
      
      // Create session
      const sessionToken = await createSession(user.id);
      
      // Link device to user if deviceId provided
      if (deviceId) {
        try {
          await storage.linkDeviceToUser(deviceId, user.id);
          logger.info("✅ Device linked to user on login", { deviceId: deviceId.substring(0, 8) + '...', userId: user.id });
        } catch (linkError) {
          logger.warn("Could not link device to user on login", { error: (linkError as Error).message });
        }
      }
      
      logger.info("User logged in", { userId: user.id, email: normalizedEmail });
      
      res.json({
        success: true,
        token: sessionToken,
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
  
  // Forgot password
  app.post("/api/auth/forgot-password", authLimiter, async (req: Request, res: Response) => {
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
  
  // Reset password
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
  
  // [FIX] Sync credits to device after login
  // This transfers any credits from temp deviceId (google_{userId} or email_{userId}) to the browser's deviceId
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
      
      // Transfer any credits from temp device to the browser's device
      await storage.transferCreditsToDevice(user.id, deviceId);
      
      // Also link the device to the user
      await storage.linkDeviceToUser(deviceId, user.id);
      
      // Get current credits for this deviceId
      let credits = await storage.getPageCredits(deviceId);
      
      // [FIX v4.6] If new device or no credits, give free pages
      if (!credits || credits.pagesRemaining === 0) {
        const earlyAdopterCount = await storage.countEarlyAdopters();
        const isEarlyAdopter = earlyAdopterCount < EARLY_ADOPTER_LIMIT;
        const freePages = isEarlyAdopter ? EARLY_ADOPTER_FREE_PAGES : DEFAULT_FREE_PAGES;
        
        credits = await storage.createOrUpdatePageCredits(deviceId, freePages);
        await storage.linkDeviceToUser(deviceId, user.id);
        
        // Mark as early adopter if applicable
        if (isEarlyAdopter) {
          await storage.grantEarlyAdopterBonus(deviceId);
        }
        
        logger.info(`Gave ${freePages} free pages to user ${user.id} (early adopter: ${isEarlyAdopter})`);
      }
      
      logger.info("Credits synced to device", { 
        userId: user.id, 
        deviceId: deviceId.substring(0, 8) + '...',
        pagesRemaining: credits?.pagesRemaining || 0
      });
      
      res.json({
        success: true,
        pagesRemaining: credits?.pagesRemaining || 0,
        isEarlyAdopter: (credits as any)?.isEarlyAdopter || false,
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
    app.get("/api/auth/google", passport.authenticate("google", {
      scope: ["profile", "email"],
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
          
          logger.info("Google login successful", { userId: user.id });
          
          // Redirect to frontend with token
          res.redirect(`/auth/callback?token=${sessionToken}`);
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
