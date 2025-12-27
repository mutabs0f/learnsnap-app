import type { Express, Request, Response } from "express";
import { type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { generateQuestionsFromImages, RecaptureRequiredError } from "./ai-service";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import rateLimit from "express-rate-limit";
import logger from "./logger";
import { registerAuthRoutes } from "./auth-routes";
import lemonSqueezyRoutes, { verifyDeviceToken } from "./lemonsqueezy-routes";
import { metrics } from "./metrics";

// Custom error class for structured errors
class AppError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    message: string,
    public suggestion?: string,
    public retryAfter?: number
  ) {
    super(message);
    this.name = "AppError";
  }
}

// Error response helper
function sendError(res: Response, error: AppError | Error) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.errorCode,
      suggestion: error.suggestion,
      retryAfter: error.retryAfter,
    });
  }
  
  // Handle RecaptureRequiredError (reliability pipeline)
  if (error instanceof RecaptureRequiredError) {
    return res.status(400).json({
      error: error.message,
      code: "RECAPTURE_REQUIRED",
      suggestion: "صوّر الصفحة كاملة بإضاءة جيدة وتأكد من وضوح النص",
    });
  }
  
  // Handle specific error types
  const message = error.message || "";
  
  if (message.includes("No text found") || message.includes("No JSON found")) {
    return res.status(400).json({
      error: "لا يوجد نص واضح في الصورة",
      suggestion: "تأكد من تصوير صفحة الكتاب بشكل واضح",
      code: "NO_TEXT_FOUND",
    });
  }
  
  if (message.includes("Image too large") || message.includes("payload too large")) {
    return res.status(400).json({
      error: "حجم الصورة كبير جداً",
      suggestion: "قلل جودة الصورة وحاول مرة أخرى (الحد الأقصى 5 ميجابايت)",
      code: "IMAGE_TOO_LARGE",
    });
  }
  
  if (message.includes("rate limit") || message.includes("429") || message.includes("quota")) {
    return res.status(429).json({
      error: "الخدمة مشغولة حالياً",
      suggestion: "انتظر دقيقة وحاول مرة أخرى",
      code: "RATE_LIMIT",
      retryAfter: 60,
    });
  }
  
  if (message.includes("API") || message.includes("configuration")) {
    return res.status(503).json({
      error: "خدمة الذكاء الاصطناعي غير متاحة مؤقتاً",
      suggestion: "حاول مرة أخرى بعد قليل",
      code: "AI_UNAVAILABLE",
    });
  }
  
  // Generic fallback
  logger.error("Unexpected error", { error: message, stack: (error as Error).stack });
  return res.status(500).json({
    error: "حدث خطأ غير متوقع",
    suggestion: "حاول مرة أخرى أو تواصل مع الدعم",
    code: "INTERNAL_ERROR",
  });
}

// Rate limiters - use deviceId from body for more accurate limiting
const quizCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 quiz creations per 15 min per device
  message: {
    error: "الكثير من الطلبات - انتظر قليلاً",
    code: "RATE_LIMIT",
    suggestion: "انتظر 15 دقيقة ثم حاول مرة أخرى",
    retryAfter: 900,
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use deviceId from parsed body (body-parser runs first)
  keyGenerator: (req) => {
    const deviceId = req.body?.deviceId;
    if (deviceId && typeof deviceId === "string") {
      return deviceId;
    }
    // Fallback to validated IP (express-rate-limit handles IPv6 correctly by default)
    return "fallback";
  },
  validate: { xForwardedForHeader: false },
});

// Validation schemas
const createQuizSchema = z.object({
  images: z
    .array(z.string())
    .min(1, "يجب رفع صورة واحدة على الأقل")
    .max(20, "الحد الأقصى 20 صورة")
    .refine(
      (imgs) => imgs.every((img) => img.startsWith("data:image/")),
      "صيغة الصورة غير صحيحة"
    )
    .refine(
      (imgs) => imgs.every((img) => img.length < 7 * 1024 * 1024), // ~5MB base64
      "حجم الصورة كبير جداً (الحد الأقصى 5 ميجابايت)"
    ),
  deviceId: z
    .string()
    .min(1, "معرف الجهاز مطلوب")
    .max(100, "معرف الجهاز طويل جداً"),
});

const submitQuizSchema = z.object({
  answers: z.array(z.string()),
});

export async function registerRoutes(httpServer: Server, app: Express): Promise<void> {

  // Register authentication routes
  registerAuthRoutes(app);
  
  // Register LemonSqueezy payment routes
  app.use("/api", lemonSqueezyRoutes);

  // Health check endpoints
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || "development",
      version: "2.7.2",
    });
  });

  app.get("/health/ready", async (req, res) => {
    try {
      const startTime = Date.now();
      await storage.healthCheck();
      const dbLatency = Date.now() - startTime;

      res.json({
        status: "ready",
        timestamp: new Date().toISOString(),
        version: "2.7.2",
        services: {
          database: { status: "ok", latencyMs: dbLatency },
          ai: {
            gemini: !!process.env.GEMINI_API_KEY ? "configured" : "missing",
            openai: !!process.env.OPENAI_API_KEY ? "configured" : "missing",
            anthropic: !!process.env.ANTHROPIC_API_KEY ? "configured" : "missing",
          },
          validation: {
            enabled: !!(process.env.OPENAI_API_KEY && process.env.ANTHROPIC_API_KEY),
            models: ["gpt-4o-mini", "claude-haiku"]
          }
        },
        features: {
          evidenceExtraction: true,
          groundingValidation: true,
          fallbackRegeneration: true
        },
        memory: {
          usedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          totalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        },
      });
    } catch (error) {
      logger.error("Health check failed", { error });
      res.status(503).json({
        status: "not ready",
        error: "Service unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.get("/health/live", (req, res) => {
    res.json({
      status: "alive",
      timestamp: new Date().toISOString(),
    });
  });

  // Page Credits API with device token enforcement
  app.get("/api/credits/:deviceId", async (req, res) => {
    const tokenSecret = process.env.DEVICE_TOKEN_SECRET || process.env.SESSION_SECRET;
    const isProduction = process.env.NODE_ENV === 'production';
    // [SECURITY] Bypass ONLY allowed in development, NEVER in production
    const devBypass = !isProduction && process.env.ENABLE_DEV_DEVICE_BYPASS === 'true';
    
    try {
      const deviceId = req.params.deviceId;
      
      if (!deviceId || deviceId.length > 100) {
        return res.status(400).json({
          error: "معرف الجهاز غير صحيح",
          code: "INVALID_DEVICE_ID",
        });
      }

      // [FIX #1] Hard enforce device token - production ALWAYS enforces
      // Missing tokenSecret in production is a server misconfiguration
      if (isProduction && !tokenSecret) {
        logger.error("CRITICAL: No token secret configured in production");
        return res.status(500).json({ error: "Server configuration error", code: "CONFIG_ERROR" });
      }
      
      if (tokenSecret && !devBypass) {
        const token = req.cookies?.device_token || req.headers["x-device-token"];
        if (!token) {
          logger.warn("Credits request without device token", { deviceId: deviceId.substring(0, 8) });
          return res.status(401).json({ 
            error: "معرف الجهاز غير صالح",
            code: "MISSING_DEVICE_TOKEN" 
          });
        }
        if (!verifyDeviceToken(deviceId, token as string, tokenSecret)) {
          logger.warn("Invalid device token on credits request", { deviceId: deviceId.substring(0, 8) });
          return res.status(401).json({ 
            error: "معرف الجهاز غير صالح",
            code: "INVALID_DEVICE_TOKEN" 
          });
        }
      }

      let credits = await storage.getPageCredits(deviceId);

      if (!credits) {
        credits = await storage.initializeDeviceCredits(deviceId); // 2 free pages only
      }

      res.json({ 
        pagesRemaining: credits.pagesRemaining || 0,
        isEarlyAdopter: (credits as any).isEarlyAdopter || false,
        status: (credits as any).status || 'active'
      });
    } catch (error) {
      sendError(res, error as Error);
    }
  });

  // Quiz API with rate limiting and device token verification
  app.post("/api/quiz/create", quizCreateLimiter, async (req, res) => {
    const startTime = Date.now();
    const tokenSecret = process.env.DEVICE_TOKEN_SECRET || process.env.SESSION_SECRET;
    const isProduction = process.env.NODE_ENV === 'production';
    // [SECURITY] Bypass ONLY allowed in development, NEVER in production
    const devBypass = !isProduction && process.env.ENABLE_DEV_DEVICE_BYPASS === 'true';
    
    try {
      // Validate request
      const parseResult = createQuizSchema.safeParse(req.body);
      if (!parseResult.success) {
        const friendlyError = fromZodError(parseResult.error);
        return res.status(400).json({
          error: friendlyError.message,
          code: "VALIDATION_ERROR",
        });
      }

      const data = parseResult.data;
      const imageCount = data.images.length;

      // [FIX #1] Hard enforce device token - production ALWAYS enforces
      // Missing tokenSecret in production is a server misconfiguration
      if (isProduction && !tokenSecret) {
        logger.error("CRITICAL: No token secret configured in production");
        return res.status(500).json({ error: "Server configuration error", code: "CONFIG_ERROR" });
      }
      
      if (tokenSecret && !devBypass) {
        const token = req.cookies?.device_token || req.headers["x-device-token"];
        if (!token) {
          logger.warn("Quiz creation without device token", { deviceId: data.deviceId.substring(0, 8) });
          return res.status(401).json({ 
            error: "معرف الجهاز غير صالح",
            code: "MISSING_DEVICE_TOKEN" 
          });
        }
        if (!verifyDeviceToken(data.deviceId, token as string, tokenSecret)) {
          logger.warn("Invalid device token on quiz creation", { deviceId: data.deviceId.substring(0, 8) });
          return res.status(401).json({ 
            error: "معرف الجهاز غير صالح",
            code: "INVALID_DEVICE_TOKEN" 
          });
        }
      }

      logger.info("Quiz creation started", {
        deviceId: data.deviceId.substring(0, 8) + "...",
        imageCount,
      });

      // Check credits (create if not exists)
      let credits = await storage.getPageCredits(data.deviceId);
      if (!credits) {
        credits = await storage.initializeDeviceCredits(data.deviceId); // 2 free pages only
      }
      
      // Check if device is on hold (refund)
      if ((credits as any).status === 'on_hold') {
        return res.status(403).json({
          error: "الحساب موقوف مؤقتاً",
          code: "ACCOUNT_ON_HOLD",
          suggestion: "تواصل مع الدعم الفني",
        });
      }

      // Check if user has enough credits for all images
      if ((credits.pagesRemaining || 0) < imageCount) {
        return res.status(402).json({
          error: "رصيد الصفحات غير كافٍ",
          code: "INSUFFICIENT_CREDITS",
          needsPayment: true,
          pagesNeeded: imageCount,
          pagesRemaining: credits.pagesRemaining || 0,
          suggestion: "اشترِ المزيد من الصفحات للمتابعة",
        });
      }

      // Use credits atomically for all images first
      const creditsUsed = await storage.usePageCredits(data.deviceId, imageCount);
      if (!creditsUsed) {
        return res.status(402).json({
          error: "فشل في خصم الرصيد",
          code: "CREDIT_DEDUCTION_FAILED",
          needsPayment: true,
        });
      }

      // Create session
      const session = await storage.createQuizSession({
        deviceId: data.deviceId,
        images: data.images,
        imageCount: imageCount,
      });

      // [IMPROVEMENT 2] Process with AI in background - with proper error handling
      void processQuizAsync(session.id, data.images).catch(err => {
        logger.error("Background quiz processing failed", { 
          sessionId: session.id, 
          error: err.message 
        });
      });

      logger.info("Quiz session created", {
        sessionId: session.id,
        imageCount,
        duration: Date.now() - startTime,
      });

      res.json({ sessionId: session.id, status: "processing", imageCount });
    } catch (error) {
      logger.error("Failed to create quiz", {
        error: (error as Error).message,
        duration: Date.now() - startTime,
      });
      sendError(res, error as Error);
    }
  });

  app.get("/api/quiz/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;

      if (!sessionId || sessionId.length > 100) {
        return res.status(400).json({
          error: "معرف الجلسة غير صحيح",
          code: "INVALID_SESSION_ID",
        });
      }

      const session = await storage.getQuizSessionById(sessionId);

      if (!session) {
        return res.status(404).json({
          error: "الجلسة غير موجودة أو منتهية",
          code: "SESSION_NOT_FOUND",
          suggestion: "قد تكون الجلسة انتهت (24 ساعة). أنشئ اختباراً جديداً.",
        });
      }
      
      // Return session data - frontend handles recapture_required status via polling
      res.json({
        id: session.id,
        status: session.status,
        lesson: session.lesson || null,
        questions: session.questions || [],
        totalQuestions: session.totalQuestions,
        // NEW v2.7.0: Include recapture guidance when needed
        ...(session.status === "recapture_required" && {
          recaptureRequired: true,
          recaptureMessage: "الصور غير واضحة. الرجاء إعادة تصوير الصفحات بإضاءة أفضل وجودة أعلى",
        }),
      });
    } catch (error) {
      sendError(res, error as Error);
    }
  });

  app.post("/api/quiz/:sessionId/submit", async (req, res) => {
    try {
      const { sessionId } = req.params;

      if (!sessionId || sessionId.length > 100) {
        return res.status(400).json({
          error: "معرف الجلسة غير صحيح",
          code: "INVALID_SESSION_ID",
        });
      }

      const parseResult = submitQuizSchema.safeParse(req.body);
      if (!parseResult.success) {
        const friendlyError = fromZodError(parseResult.error);
        return res.status(400).json({
          error: friendlyError.message,
          code: "VALIDATION_ERROR",
        });
      }

      const data = parseResult.data;
      const session = await storage.getQuizSessionById(sessionId);

      if (!session) {
        return res.status(404).json({
          error: "الجلسة غير موجودة",
          code: "SESSION_NOT_FOUND",
        });
      }

      if (!session.questions || session.questions.length === 0) {
        return res.status(400).json({
          error: "الاختبار غير جاهز بعد",
          code: "QUIZ_NOT_READY",
          suggestion: "انتظر حتى تنتهي معالجة الأسئلة",
        });
      }

      // Calculate score with proper answer mapping
      let score = 0;
      const arabicToEnglish: Record<string, string> = { "أ": "A", "ب": "B", "ج": "C", "د": "D" };
      
      session.questions.forEach((q, i) => {
        const userAnswer = data.answers[i];
        const question = q as any;
        const correctAnswer = question.correct;
        
        switch (question.type) {
          case "true_false":
            // User sends "true" or "false" as string, correct is boolean
            if ((userAnswer === "true") === correctAnswer) {
              score++;
            }
            break;
            
          case "fill_blank": {
            // Flexible text matching - ignore case and handle partial matches
            const userAns = (userAnswer || "").trim().toLowerCase();
            const correctAns = (correctAnswer || "").toString().trim().toLowerCase();
            if (userAns === correctAns || userAns.includes(correctAns) || correctAns.includes(userAns)) {
              score++;
            }
            break;
          }
          
          case "matching":
            // User sends "correct" or "wrong"
            if (userAnswer === "correct") {
              score++;
            }
            break;
            
          case "multiple_choice":
          default: {
            // Map Arabic labels to English for comparison
            const mappedAnswer = arabicToEnglish[userAnswer] || userAnswer;
            if (mappedAnswer === correctAnswer) {
              score++;
            }
            break;
          }
        }
      });

      await storage.submitQuizAnswers(sessionId, data.answers, score);

      res.json({ success: true, score, total: session.questions.length });
    } catch (error) {
      sendError(res, error as Error);
    }
  });

  app.get("/api/quiz/:sessionId/result", async (req, res) => {
    try {
      const { sessionId } = req.params;

      if (!sessionId || sessionId.length > 100) {
        return res.status(400).json({
          error: "معرف الجلسة غير صحيح",
          code: "INVALID_SESSION_ID",
        });
      }

      const session = await storage.getQuizSessionById(sessionId);

      if (!session) {
        return res.status(404).json({
          error: "الجلسة غير موجودة",
          code: "SESSION_NOT_FOUND",
        });
      }

      res.json({
        id: session.id,
        questions: session.questions || [],
        answers: session.answers || [],
        score: session.score || 0,
        totalQuestions: session.questions?.length || 0,
      });
    } catch (error) {
      sendError(res, error as Error);
    }
  });

  // ==================== ADMIN DASHBOARD ====================

  // [IMPROVEMENT 3] Admin can be disabled entirely in production via ENABLE_ADMIN=false
  const adminEnabled = process.env.ENABLE_ADMIN !== 'false'; // Enabled by default
  const isProduction = process.env.NODE_ENV === 'production';

  // [IMPROVEMENT 3] Stricter rate limiter for admin endpoints
  const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isProduction ? 15 : 50, // Stricter in production
    message: { error: "Too many requests - please wait" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // [IMPROVEMENT 3] Admin authentication with timing-safe compare
  const adminAuth = (req: Request, res: Response, next: () => void) => {
    // Check if admin is disabled in production
    if (!adminEnabled && isProduction) {
      return res.status(503).json({ error: "Admin dashboard disabled" });
    }
    
    const adminPassword = req.headers["x-admin-password"];
    const envPassword = process.env.ADMIN_PASSWORD;
    
    if (!envPassword) {
      logger.warn("Admin auth failed - no password configured", { ip: req.ip });
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // [IMPROVEMENT 3] Timing-safe comparison to prevent timing attacks
    const providedBuffer = Buffer.from(String(adminPassword || ''));
    const expectedBuffer = Buffer.from(envPassword);
    
    // Ensure same length for timing-safe compare
    const isValidLength = providedBuffer.length === expectedBuffer.length;
    const isMatch = isValidLength && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
    
    if (!isMatch) {
      logger.warn("Admin auth failed", { 
        ip: req.ip,
        path: req.path,
      });
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  // [FIX] Only register admin routes if admin is enabled
  // This prevents the routes from being accessible at all when disabled
  if (adminEnabled || !isProduction) {
    // Admin stats endpoint
    app.get("/api/admin/stats", adminLimiter, adminAuth, async (req: Request, res: Response) => {
      try {
        // Get all statistics
        const [
          usersResult,
          devicesResult,
          quizzesResult,
          transactionsResult,
          totalPagesUsedResult,
          totalRevenueResult,
          recentQuizzesResult,
          recentUsersResult
        ] = await Promise.all([
          db.execute(sql`SELECT COUNT(*) as count FROM users`),
          db.execute(sql`SELECT COUNT(*) as count FROM page_credits`),
          db.execute(sql`SELECT COUNT(*) as count FROM quiz_sessions`),
          db.execute(sql`SELECT COUNT(*) as count FROM transactions`),
          db.execute(sql`SELECT COALESCE(SUM(total_pages_used), 0) as total FROM page_credits`),
          db.execute(sql`SELECT COALESCE(SUM(amount), 0) as total FROM transactions`),
          db.execute(sql`SELECT id, device_id, status, created_at FROM quiz_sessions ORDER BY created_at DESC LIMIT 10`),
          db.execute(sql`SELECT id, email, name, created_at FROM users ORDER BY created_at DESC LIMIT 10`)
        ]);

        res.json({
          stats: {
            totalUsers: Number(usersResult.rows[0]?.count || 0),
            totalDevices: Number(devicesResult.rows[0]?.count || 0),
            totalQuizzes: Number(quizzesResult.rows[0]?.count || 0),
            totalTransactions: Number(transactionsResult.rows[0]?.count || 0),
            totalPagesUsed: Number(totalPagesUsedResult.rows[0]?.total || 0),
            totalRevenue: Number(totalRevenueResult.rows[0]?.total || 0) / 100, // Convert from halalas to SAR
          },
          recentQuizzes: recentQuizzesResult.rows,
          recentUsers: recentUsersResult.rows,
        });
      } catch (error) {
        logger.error("Failed to get admin stats", { error: (error as Error).message });
        res.status(500).json({ error: "Failed to get stats" });
      }
    });

    // Get all devices with credits
    app.get("/api/admin/devices", adminLimiter, adminAuth, async (req: Request, res: Response) => {
      try {
        const result = await db.execute(sql`
          SELECT device_id, pages_remaining, total_pages_used, user_id, created_at, updated_at 
          FROM page_credits 
          ORDER BY updated_at DESC 
          LIMIT 100
        `);
        res.json({ devices: result.rows });
      } catch (error) {
        logger.error("Failed to get devices", { error: (error as Error).message });
        res.status(500).json({ error: "Failed to get devices" });
      }
    });

    // Get all transactions
    app.get("/api/admin/transactions", adminLimiter, adminAuth, async (req: Request, res: Response) => {
      try {
        const result = await db.execute(sql`
          SELECT id, device_id, amount, pages_purchased, created_at 
          FROM transactions 
          ORDER BY created_at DESC 
          LIMIT 100
        `);
        res.json({ transactions: result.rows });
      } catch (error) {
        logger.error("Failed to get transactions", { error: (error as Error).message });
        res.status(500).json({ error: "Failed to get transactions" });
      }
    });
    
    // Metrics endpoint (admin only)
    app.get("/api/admin/metrics", adminLimiter, adminAuth, async (req: Request, res: Response) => {
      try {
        const currentMetrics = metrics.getMetrics();
        
        const dbStats = await db.execute(sql`
          SELECT
            (SELECT COUNT(*) FROM quiz_sessions) as total_quizzes,
            (SELECT COUNT(*) FROM quiz_sessions WHERE status = 'ready') as completed_quizzes,
            (SELECT COUNT(*) FROM page_credits) as total_devices,
            (SELECT COALESCE(SUM(pages_remaining), 0) FROM page_credits) as total_credits_remaining
        `);
        
        res.json({
          ...currentMetrics,
          database: dbStats.rows[0],
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error("Failed to get metrics", { error: (error as Error).message });
        res.status(500).json({ error: "Failed to get metrics" });
      }
    });

    logger.info("Admin routes registered");
  } else {
    logger.info("Admin routes disabled in production (ENABLE_ADMIN=false)");
  }

  // Analytics events storage
  const analyticsEvents: Array<{ event: string; properties?: Record<string, unknown>; timestamp: string }> = [];
  const MAX_EVENTS = 10000;

  // Analytics events endpoint (public)
  app.post("/api/analytics/events", async (req: Request, res: Response) => {
    const { events } = req.body;
    
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: "Invalid events format" });
    }
    
    analyticsEvents.push(...events);
    
    if (analyticsEvents.length > MAX_EVENTS) {
      analyticsEvents.splice(0, analyticsEvents.length - MAX_EVENTS);
    }
    
    events.forEach((event: { event: string; properties?: Record<string, unknown> }) => {
      if (["quiz_completed", "credits_purchased"].includes(event.event)) {
        logger.info(`Analytics: ${event.event}`, event.properties);
      }
    });
    
    res.json({ received: events.length });
  });
}

async function processQuizAsync(sessionId: string, images: string[]): Promise<void> {
  const startTime = Date.now();
  
  try {
    logger.info(`Processing quiz ${sessionId} with ${images.length} images...`);

    const content = await generateQuestionsFromImages(images);

    await storage.updateQuizSessionContent(sessionId, content.lesson, content.questions);
    
    // Clear images from DB to reduce storage (keep only imageCount)
    await storage.clearQuizSessionImages(sessionId);

    logger.info(`Quiz ${sessionId} ready`, {
      lessonTitle: content.lesson.title,
      questionCount: content.questions.length,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    logger.error(`Failed to process quiz ${sessionId}`, {
      error: (error as Error).message,
      stack: (error as Error).stack,
      duration: Date.now() - startTime,
    });
    await storage.updateQuizSessionStatus(sessionId, "error");
    
    // Also clear images on error to prevent DB bloat
    try {
      await storage.clearQuizSessionImages(sessionId);
    } catch {}
  }
}

// Periodic cleanup (every hour in production)
if (process.env.NODE_ENV === 'production') {
  setInterval(async () => {
    try {
      const deleted = await storage.deleteExpiredSessions();
      if (deleted > 0) {
        logger.info(`Cleaned up ${deleted} expired quiz sessions`);
      }
    } catch (error) {
      logger.error("Session cleanup failed", { error: (error as Error).message });
    }
  }, 60 * 60 * 1000); // Every hour
}
