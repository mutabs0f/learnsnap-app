import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import crypto from "crypto";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { generateQuestionsFromImages, RecaptureRequiredError, ValidationUnavailableError } from "./ai-service";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import rateLimit from "express-rate-limit";
import logger from "./logger";
import { registerAuthRoutes } from "./auth-routes";
import paylinkRoutes, { verifyDeviceToken } from "./paylink-routes";
import { metrics } from "./metrics";
import { createCsrfProtection, csrfErrorHandler } from "./security";
import { apiVersionMiddleware, checkDeprecatedVersion } from "./api-versioning";
// FIX: Added setJobProgress import for fallback mode progress tracking
import {
  getQuizQueue,
  queueQuizGeneration,
  getJobStatus,
  isRedisAvailable,
  generateIdempotencyKey,
  checkIdempotency,
  setIdempotency,
  setIdempotencyPending,
  clearIdempotency,
  setJobMapping,
  getJobMapping,
  setSessionJobId,
  getSessionJobId,
  getJobProgress,
  setJobProgress,
} from "./queue-service";

// [SECURITY FIX v2.9.2] Device token verification helper for session endpoints (BOLA fix)
function verifySessionDeviceToken(
  req: Request,
  res: Response,
  sessionDeviceId: string | null | undefined
): boolean {
  const tokenSecret = process.env.DEVICE_TOKEN_SECRET || process.env.SESSION_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  const devBypass = !isProduction && process.env.ENABLE_DEV_DEVICE_BYPASS === 'true';
  
  // Production requires token secret
  if (isProduction && !tokenSecret) {
    logger.error("CRITICAL: No token secret configured in production for session verification");
    res.status(500).json({ error: "خطأ في إعداد الخادم", code: "CONFIG_ERROR" });
    return false;
  }
  
  // Session must have deviceId (except in dev bypass mode)
  if (!sessionDeviceId) {
    if (devBypass) {
      logger.warn("Session missing deviceId - allowed in dev bypass mode");
      return true;
    }
    logger.warn("Session missing deviceId - rejecting request");
    res.status(409).json({
      error: "الجلسة غير مرتبطة بجهاز. أنشئ اختباراً جديداً.",
      code: "SESSION_MISSING_DEVICE_ID",
    });
    return false;
  }
  
  // Dev bypass mode skips token check
  if (devBypass) {
    return true;
  }
  
  // Get device ID from header (primary method for BOLA prevention)
  const headerDeviceId = req.headers["x-device-id"] as string | undefined;
  
  // If x-device-id header is present, use direct comparison (BOLA fix)
  if (headerDeviceId) {
    if (headerDeviceId === sessionDeviceId) {
      return true;
    }
    logger.warn("Device ID mismatch on quiz session request", { 
      sessionDeviceId: sessionDeviceId.substring(0, 8),
      headerDeviceId: headerDeviceId.substring(0, 8),
    });
    res.status(403).json({
      error: "لا يمكنك الوصول إلى هذه الجلسة",
      code: "DEVICE_MISMATCH",
    });
    return false;
  }
  
  // Fallback: Get token from cookie or header (legacy method with cryptographic verification)
  const token = req.cookies?.device_token || req.headers["x-device-token"];
  if (!token) {
    logger.warn("Quiz session request without device token or device ID", { sessionDeviceId: sessionDeviceId.substring(0, 8) });
    res.status(401).json({
      error: "يرجى تسجيل الدخول أو إعادة فتح التطبيق",
      code: "MISSING_DEVICE_TOKEN",
    });
    return false;
  }
  
  // Verify token
  if (!verifyDeviceToken(sessionDeviceId, token as string, tokenSecret!)) {
    logger.warn("Invalid device token on quiz session request", { sessionDeviceId: sessionDeviceId.substring(0, 8) });
    res.status(401).json({
      error: "معرف الجهاز غير صالح",
      code: "INVALID_DEVICE_TOKEN",
    });
    return false;
  }
  
  return true;
}

// [SECURITY FIX v4.2] Input sanitization helper
function sanitizeInput(input: unknown): unknown {
  if (typeof input === 'string') {
    return input.replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  if (input && typeof input === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  return input;
}

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
  
  // Handle RecaptureRequiredError (bad image quality)
  if (error instanceof RecaptureRequiredError) {
    return res.status(400).json({
      error: error.message,
      code: "RECAPTURE_REQUIRED",
      suggestion: "صوّر الصفحة كاملة بإضاءة جيدة وتأكد من وضوح النص",
    });
  }
  
  // [GO-1] Handle ValidationUnavailableError (provider down/timeout)
  if (error instanceof ValidationUnavailableError) {
    metrics.recordValidationOutcome('unavailable');
    return res.status(503).json({
      error: error.message,
      code: "VALIDATION_UNAVAILABLE",
      suggestion: "خدمة التحقق غير متوفرة مؤقتاً - حاول مرة أخرى بعد قليل",
      retryAfter: 60,
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
    return res.status(413).json({
      error: "حجم الصورة كبير جداً",
      suggestion: "قلل جودة الصورة وحاول مرة أخرى (الحد الأقصى 6 ميجابايت للصورة)",
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

// Validation schemas - reasonable limits for quiz creation
const MAX_IMAGE_SIZE_BYTES = 6 * 1024 * 1024; // 6MB per image (binary)
const MAX_IMAGES_COUNT = 20; // Max 20 images per request (restored from v2.8)
const MAX_TOTAL_PAYLOAD_MB = 85; // 85MB total (20 images × 6MB binary, accounting for base64 overhead)

const createQuizSchema = z.object({
  images: z
    .array(z.string())
    .min(1, "يجب رفع صورة واحدة على الأقل")
    .max(MAX_IMAGES_COUNT, `الحد الأقصى ${MAX_IMAGES_COUNT} صور`)
    .refine(
      (imgs) => imgs.every((img) => img.startsWith("data:image/")),
      "صيغة الصورة غير صحيحة"
    )
    .refine(
      (imgs) => imgs.every((img) => {
        const approxBytes = (img.length * 3) / 4;
        return approxBytes < MAX_IMAGE_SIZE_BYTES;
      }),
      `حجم الصورة كبير جداً (الحد الأقصى ${Math.round(MAX_IMAGE_SIZE_BYTES / 1024 / 1024)} ميجابايت)`
    )
    .refine(
      (imgs) => {
        const totalBytes = imgs.reduce((sum, img) => sum + (img.length * 3) / 4, 0);
        return totalBytes < MAX_TOTAL_PAYLOAD_MB * 1024 * 1024;
      },
      `الحجم الإجمالي كبير جداً (الحد الأقصى ${MAX_TOTAL_PAYLOAD_MB} ميجابايت)`
    ),
  deviceId: z
    .string()
    .min(1, "معرف الجهاز مطلوب")
    .max(100, "معرف الجهاز طويل جداً"),
  requestId: z.string().optional(),
  optimizeImages: z.boolean().optional().default(true),
  optimizationLevel: z.enum(['standard', 'high-quality', 'max-quality']).optional().default('standard'),
});

const submitQuizSchema = z.object({
  answers: z.array(z.string()),
});

export async function registerRoutes(httpServer: Server, app: Express): Promise<void> {
  // Request ID middleware for tracing
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).id = randomUUID();
    next();
  });

  // API versioning middleware
  app.use('/api', apiVersionMiddleware);
  app.use('/api', checkDeprecatedVersion);

  // [SECURITY FIX v4.2] Sanitize all incoming JSON bodies
  app.use('/api', (req: Request, _res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeInput(req.body);
    }
    next();
  });

  // CSRF protection
  const csrfProtection = createCsrfProtection();
  
  // CSRF token endpoint - frontend fetches this first
  app.get('/api/csrf-token', (req: Request, res: Response) => {
    const { generateToken } = require('./security');
    const token = generateToken(req, res);
    res.json({ csrfToken: token });
  });
  
  // Apply CSRF protection to mutating endpoints
  app.use('/api/quiz/create', csrfProtection);
  app.use('/api/billing', csrfProtection);
  
  // CSRF error handler
  app.use(csrfErrorHandler);

  // Register authentication routes
  registerAuthRoutes(app);
  
  // Register Paylink payment routes
  app.use("/api", paylinkRoutes);

  // Health check endpoints
  app.get("/health", async (req, res) => {
    const checks: Record<string, any> = {};
    let healthy = true;
    
    try {
      const dbStart = Date.now();
      await storage.healthCheck();
      checks.database = { status: true, latency: Date.now() - dbStart };
    } catch {
      checks.database = { status: false };
      healthy = false;
    }
    
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
    checks.redis = { status: !!redisUrl, configured: !!redisUrl };
    
    const mem = process.memoryUsage();
    checks.memory = {
      used: Math.round(mem.heapUsed / 1024 / 1024),
      total: Math.round(mem.heapTotal / 1024 / 1024),
      percentage: Math.round((mem.heapUsed / mem.heapTotal) * 100)
    };
    
    res.status(healthy ? 200 : 503).json({
      status: healthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: "2.9.1",
      checks
    });
  });

  app.get("/health/ready", async (req, res) => {
    try {
      const startTime = Date.now();
      await storage.healthCheck();
      const dbLatency = Date.now() - startTime;
      
      const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;

      res.json({
        status: "ready",
        timestamp: new Date().toISOString(),
        version: "2.9.1",
        services: {
          database: { status: "ok", latencyMs: dbLatency },
          redis: { status: redisUrl ? "configured" : "not configured" },
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
          caching: !!redisUrl,
          asyncProcessing: !!redisUrl,
          encryption: !!process.env.ENCRYPTION_KEY,
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
  
  // /api/metrics moved to /api/admin/metrics with adminAuth protection
  // Public metrics endpoint removed for security

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
    let idemKey: string | undefined;
    
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

      // [NEW] Check idempotency cache to prevent duplicate requests
      // Use client-provided requestId or generate UUID for unique request identification
      const requestId = data.requestId || req.headers['x-request-id'] as string || crypto.randomUUID();
      idemKey = generateIdempotencyKey(data.deviceId, requestId);
      
      // Idempotency check works with both Redis and in-memory fallback
      const idemResult = await checkIdempotency(idemKey);
      if (idemResult.exists && idemResult.sessionId) {
        metrics.recordCacheHit('idempotency');
        logger.info("Idempotency hit - returning existing session", {
          sessionId: idemResult.sessionId,
          jobId: idemResult.jobId,
        });
        return res.json({
          sessionId: idemResult.sessionId,
          jobId: idemResult.jobId || "local",
          status: "processing",
          imageCount,
          cached: true,
          requestId,
        });
      }
      
      // Try to reserve the idempotency slot BEFORE any processing
      const reserved = await setIdempotencyPending(idemKey);
      if (!reserved) {
        // Another request is already processing this - return 409 Conflict
        logger.warn("Duplicate request detected during processing", { 
          deviceId: data.deviceId.substring(0, 8),
          requestId 
        });
        return res.status(409).json({
          error: "الطلب قيد المعالجة بالفعل",
          code: "DUPLICATE_REQUEST",
          suggestion: "انتظر قليلاً ثم حاول مجدداً",
        });
      }
      metrics.recordCacheMiss('idempotency');
      
      const redisUp = await isRedisAvailable();

      // Check credits (create if not exists)
      let credits = await storage.getPageCredits(data.deviceId);
      if (!credits) {
        credits = await storage.initializeDeviceCredits(data.deviceId);
      }
      
      // Check if device is on hold (refund)
      if ((credits as any).status === 'on_hold') {
        // Clear idempotency on early exit so client can retry
        await clearIdempotency(idemKey);
        return res.status(403).json({
          error: "الحساب موقوف مؤقتاً",
          code: "ACCOUNT_ON_HOLD",
          suggestion: "تواصل مع الدعم الفني",
        });
      }

      // [GO-1] Check if user has enough credits for all images (but don't charge yet)
      if ((credits.pagesRemaining || 0) < imageCount) {
        // Clear idempotency on early exit so client can retry after purchasing
        await clearIdempotency(idemKey);
        return res.status(402).json({
          error: "رصيد الصفحات غير كافٍ",
          code: "INSUFFICIENT_CREDITS",
          needsPayment: true,
          pagesNeeded: imageCount,
          pagesRemaining: credits.pagesRemaining || 0,
          suggestion: "اشترِ المزيد من الصفحات للمتابعة",
        });
      }

      // [GO-1] Credits will be charged ONLY on successful quiz generation
      // This prevents charging users when AI fails or validation is unavailable
      const creditsToCharge = imageCount;

      // Create session
      const session = await storage.createQuizSession({
        deviceId: data.deviceId,
        images: data.images,
        imageCount: imageCount,
      });

      let jobId = "local";
      let status: "queued" | "processing" = "processing";

      // [NEW] Use Redis Queue if available, otherwise fallback to in-process
      if (redisUp) {
        try {
          jobId = await queueQuizGeneration(
            session.id,
            data.deviceId,
            data.images,
            data.optimizationLevel,
            creditsToCharge // [GO-1] Pass credits to worker for delayed charging
          );
          status = "queued";
          await setJobMapping(jobId, session.id, "queued");
          await setSessionJobId(session.id, jobId); // [GO-2] Map session to job for progress
          // Update the pending idempotency entry with session/job info
          await setIdempotency(idemKey, jobId, session.id);
          metrics.recordQuizQueued();
          
          logger.info("Quiz job queued", { sessionId: session.id, jobId, creditsToCharge });
        } catch (queueError) {
          logger.warn("Queue failed, falling back to in-process", { 
            error: (queueError as Error).message 
          });
          // Set idempotency immediately for fallback mode
          await setIdempotency(idemKey, "local", session.id);
          
          // Fallback to in-process
          // Capture for closure
          const capturedIdemKey = idemKey;
          void processQuizAsync(session.id, data.deviceId, creditsToCharge, data.images, {
            optimizeImages: data.optimizeImages,
            optimizationLevel: data.optimizationLevel
          }).catch(err => {
            logger.error("Background quiz processing failed", { 
              sessionId: session.id, 
              error: err.message 
            });
            // Clear idempotency on failure so client can retry
            if (capturedIdemKey) void clearIdempotency(capturedIdemKey);
          });
        }
      } else {
        // No Redis - process in-process (existing behavior)
        // Set idempotency in-memory for fallback mode
        await setIdempotency(idemKey, "local", session.id);
        
        // Capture for closure
        const capturedIdemKey = idemKey;
        void processQuizAsync(session.id, data.deviceId, creditsToCharge, data.images, {
          optimizeImages: data.optimizeImages,
          optimizationLevel: data.optimizationLevel
        }).catch(err => {
          logger.error("Background quiz processing failed", { 
            sessionId: session.id, 
            error: err.message 
          });
          // Clear idempotency on failure so client can retry
          if (capturedIdemKey) void clearIdempotency(capturedIdemKey);
        });
      }
      
      metrics.recordQuizCreated();

      logger.info("Quiz session created", {
        sessionId: session.id,
        jobId,
        status,
        imageCount,
        optimizeImages: data.optimizeImages,
        optimizationLevel: data.optimizationLevel,
        duration: Date.now() - startTime,
      });

      res.json({ 
        sessionId: session.id,
        jobId,
        status,
        imageCount,
        requestId,
        optimizationSettings: {
          enabled: data.optimizeImages,
          level: data.optimizationLevel
        }
      });
    } catch (error) {
      // Clear idempotency on unexpected error so client can retry
      if (idemKey) {
        void clearIdempotency(idemKey).catch(() => {});
      }
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
      
      // [SECURITY v2.9.2] Verify device token ownership (BOLA fix)
      if (!verifySessionDeviceToken(req, res, session.deviceId)) {
        return; // Response already sent by helper
      }
      
      // [2.3] Calculate quality score and validation summary
      const lesson = session.lesson as any;
      const qualityScore = lesson?.confidence 
        ? Math.round(lesson.confidence * 100) 
        : (session.status === 'completed' ? 80 : 0);
      
      const validationStatus = session.status === 'completed' 
        ? 'VALIDATED' 
        : session.status === 'recapture_required' 
          ? 'NEEDS_RECAPTURE' 
          : session.status === 'failed' 
            ? 'VALIDATION_UNAVAILABLE' 
            : 'PROCESSING';
      
      // [GO-2] Fetch progress info for processing sessions
      let processing: { progress: number; stage: string; etaSeconds: number } | undefined;
      if (session.status === 'processing') {
        const jobId = await getSessionJobId(sessionId);
        if (jobId) {
          const progressData = await getJobProgress(jobId);
          if (progressData) {
            // Calculate ETA based on average processing time
            const avgMs = metrics.getMetrics().quizzes.averageProcessingTime || 0;
            const remaining = (100 - progressData.progress) / 100;
            const etaSeconds = avgMs > 0 
              ? Math.ceil(remaining * avgMs / 1000)
              : Math.ceil(remaining * (session.imageCount || 5) * 12); // Fallback: 12s per image
            processing = {
              progress: progressData.progress,
              stage: progressData.stage,
              etaSeconds,
            };
          }
        }
        // Fallback if no progress data available
        if (!processing) {
          processing = {
            progress: 10,
            stage: 'جاري المعالجة',
            etaSeconds: (session.imageCount || 5) * 12,
          };
        }
      }
      
      // Return session data with quality signals - frontend handles recapture_required status via polling
      res.json({
        id: session.id,
        status: session.status,
        lesson: session.lesson || null,
        questions: session.questions || [],
        totalQuestions: session.totalQuestions,
        // [GO-2] Progress tracking for processing sessions
        ...(processing && { processing }),
        // [2.3] Quality signals for client/support
        qualityScore,
        validationSummary: {
          status: validationStatus,
          reasons: session.status === 'recapture_required' 
            ? ["الصور غير واضحة", "يرجى إعادة التصوير"] 
            : session.status === 'failed'
              ? ["حدث خطأ أثناء المعالجة"]
              : [],
        },
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
      
      // [SECURITY v2.9.2] Verify device token ownership (BOLA fix)
      if (!verifySessionDeviceToken(req, res, session.deviceId)) {
        return; // Response already sent by helper
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
      
      // [SECURITY v2.9.2] Verify device token ownership (BOLA fix)
      if (!verifySessionDeviceToken(req, res, session.deviceId)) {
        return; // Response already sent by helper
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

  // ==================== JOB ENDPOINTS (NEW) ====================

  app.get("/api/quiz/job/:jobId/status", async (req, res) => {
    try {
      const { jobId } = req.params;

      if (!jobId || jobId.length > 100) {
        return res.status(400).json({
          error: "معرف المهمة غير صحيح",
          code: "INVALID_JOB_ID",
        });
      }

      // Handle "local" jobId (in-process mode)
      if (jobId === "local") {
        return res.json({
          jobId: "local",
          status: "processing",
          message: "المعالجة تتم محلياً بدون queue",
        });
      }

      // Check Redis job mapping first
      const mapping = await getJobMapping(jobId);
      if (mapping) {
        const bullStatus = await getJobStatus(jobId);
        
        return res.json({
          jobId,
          sessionId: mapping.sessionId,
          status: bullStatus.status === "unknown" ? mapping.status : bullStatus.status,
          progress: bullStatus.progress,
          updatedAt: new Date(mapping.updatedAt).toISOString(),
          error: bullStatus.error,
        });
      }

      // Fallback to Bull queue directly
      const status = await getJobStatus(jobId);
      
      if (status.status === "unknown") {
        return res.status(404).json({
          error: "المهمة غير موجودة",
          code: "JOB_NOT_FOUND",
        });
      }

      res.json({
        jobId,
        status: status.status,
        progress: status.progress,
        error: status.error,
      });
    } catch (error) {
      sendError(res, error as Error);
    }
  });

  app.get("/api/quiz/job/:jobId/result", async (req, res) => {
    try {
      const { jobId } = req.params;

      if (!jobId || jobId.length > 100) {
        return res.status(400).json({
          error: "معرف المهمة غير صحيح",
          code: "INVALID_JOB_ID",
        });
      }

      // Handle "local" jobId
      if (jobId === "local") {
        return res.status(409).json({
          error: "لا يمكن الحصول على النتيجة من المعالجة المحلية",
          code: "LOCAL_PROCESSING",
          suggestion: "استخدم /api/quiz/:sessionId للحصول على النتيجة",
        });
      }

      // Get session ID from job mapping
      const mapping = await getJobMapping(jobId);
      if (!mapping) {
        return res.status(404).json({
          error: "المهمة غير موجودة",
          code: "JOB_NOT_FOUND",
        });
      }

      // Check job status
      const status = await getJobStatus(jobId);
      if (status.status !== "completed") {
        return res.status(409).json({
          error: "المهمة لم تنتهِ بعد",
          code: "JOB_NOT_COMPLETED",
          status: status.status,
          progress: status.progress,
        });
      }

      // Get quiz session data
      const session = await storage.getQuizSessionById(mapping.sessionId);
      if (!session) {
        return res.status(404).json({
          error: "الجلسة غير موجودة",
          code: "SESSION_NOT_FOUND",
        });
      }
      
      // [SECURITY v2.9.2] Verify device token ownership (BOLA fix)
      if (!verifySessionDeviceToken(req, res, session.deviceId)) {
        return; // Response already sent by helper
      }

      res.json({
        jobId,
        sessionId: mapping.sessionId,
        status: "completed",
        lesson: session.lesson,
        questions: session.questions || [],
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

// [GO-1] Updated to charge credits only on success
// [GO-2] Added progress tracking for fallback mode
async function processQuizAsync(
  sessionId: string, 
  deviceId: string,
  creditsToCharge: number,
  images: string[],
  options?: {
    optimizeImages?: boolean;
    optimizationLevel?: 'standard' | 'high-quality' | 'max-quality';
  }
): Promise<void> {
  const startTime = Date.now();
  // [FAST MODE] Reduced timeout - new pipeline is much faster
  const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes timeout (should complete in ~30-60s)
  
  // [GO-2] Create a local job ID for progress tracking
  const localJobId = `local-${sessionId}`;
  await setSessionJobId(sessionId, localJobId);
  
  // [GO-2] Progress helper
  const updateProgress = async (progress: number, stage: string) => {
    await setJobProgress(localJobId, progress, stage);
  };
  
  try {
    await updateProgress(5, 'تهيئة الطلب');
    
    logger.info(`Processing quiz ${sessionId} with ${images.length} images...`, {
      optimizeImages: options?.optimizeImages ?? true,
      optimizationLevel: options?.optimizationLevel ?? 'standard',
      creditsToCharge
    });

    // Add timeout wrapper with progress callback
    const contentPromise = generateQuestionsFromImages(images, {
      ...options,
      onProgress: async (p: number, stage: string) => {
        await updateProgress(p, stage);
      }
    });
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
    );
    
    const content = await Promise.race([contentPromise, timeoutPromise]);

    await updateProgress(90, 'حفظ النتائج');
    
    await storage.updateQuizSessionContent(sessionId, content.lesson, content.questions, content.warnings);
    
    // Clear images from DB to reduce storage (keep only imageCount)
    await storage.clearQuizSessionImages(sessionId);

    // [GO-1] Charge credits ONLY on successful quiz generation
    if (creditsToCharge > 0) {
      const charged = await storage.usePageCredits(deviceId, creditsToCharge);
      if (charged) {
        metrics.recordCreditsUsed(creditsToCharge);
        logger.info(`Credits charged on success`, { 
          sessionId, 
          deviceId: deviceId.substring(0, 8) + '...', 
          credits: creditsToCharge 
        });
      } else {
        logger.warn(`Failed to charge credits (possible race)`, { sessionId, deviceId: deviceId.substring(0, 8) });
        metrics.recordCreditsNotCharged('race_condition');
      }
    }

    await updateProgress(100, 'اكتمل');
    
    const duration = Date.now() - startTime;
    metrics.recordQuizCompleted(duration);

    logger.info(`Quiz ${sessionId} ready`, {
      lessonTitle: content.lesson.title,
      questionCount: content.questions.length,
      duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = (error as Error).message;
    
    logger.error(`Failed to process quiz ${sessionId}`, {
      error: errorMsg,
      stack: (error as Error).stack,
      duration,
    });
    
    // Set specific error status based on error type
    let errorStatus = "error";
    if (errorMsg === 'TIMEOUT') {
      errorStatus = "timeout";
      logger.warn(`Quiz ${sessionId} timed out after ${duration}ms`);
    } else if (errorMsg.includes('API') || errorMsg.includes('quota')) {
      errorStatus = "service_error";
    } else if (errorMsg.includes('No text') || errorMsg.includes('UNCLEAR')) {
      errorStatus = "recapture_required";
    }
    
    metrics.recordQuizFailed();
    await storage.updateQuizSessionStatus(sessionId, errorStatus);
    
    // Also clear images on error to prevent DB bloat
    try {
      await storage.clearQuizSessionImages(sessionId);
    } catch {}
  }
}

// [P1 FIX v2.9.2] Comprehensive periodic cleanup (every hour in production)
if (process.env.NODE_ENV === 'production') {
  setInterval(async () => {
    try {
      const results = await storage.cleanupAllExpiredData();
      const total = Object.values(results).reduce((a, b) => a + b, 0);
      if (total > 0) {
        logger.info('Cleanup completed', results);
      }
    } catch (error) {
      logger.error("Cleanup failed", { error: (error as Error).message });
    }
  }, 60 * 60 * 1000); // Every hour
}
