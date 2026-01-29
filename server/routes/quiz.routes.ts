/**
 * Quiz management endpoints
 * Extracted from routes.ts
 * 
 * Endpoints:
 * - POST /api/quiz/create
 * - GET /api/quiz/:sessionId
 * - POST /api/quiz/:sessionId/submit
 * - GET /api/quiz/:sessionId/result
 * - GET /api/quiz/job/:jobId/status
 * - GET /api/quiz/job/:jobId/result
 * - POST /api/quiz/:sessionId/report-question
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { fromZodError } from "zod-validation-error";
import { storage } from "../storage";
import { generateQuestionsFromImages } from "../ai-service";
import logger from "../logger";
import { metrics } from "../metrics";
import { getDeviceTokenSecret } from "../env-helpers";
import { verifyDeviceToken } from "../paylink-routes";
import { checkAndIncrementQuota } from "../audit-logger";
import { sendQuestionReportNotification } from "../email-service";
import {
  queueQuizGeneration,
  getJobStatus,
  isRedisAvailable,
  isRedisRequiredForQuiz,
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
} from "../queue-service";

import {
  verifySessionDeviceToken,
  sendError,
  createQuizSchema,
  submitQuizSchema,
  isProduction,
} from "./shared";

const quizCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    error: "الكثير من الطلبات - انتظر قليلاً",
    code: "RATE_LIMIT",
    suggestion: "انتظر 15 دقيقة ثم حاول مرة أخرى",
    retryAfter: 900,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const deviceId = req.body?.deviceId;
    if (deviceId && typeof deviceId === "string") {
      return deviceId;
    }
    return "fallback";
  },
  validate: { xForwardedForHeader: false },
});

const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: "تم تجاوز عدد البلاغات المسموح به، حاول لاحقاً" }
});

async function processQuizAsync(
  sessionId: string, 
  deviceId: string,
  creditsToCharge: number,
  images: string[],
  userId: string | null,
  options?: {
    optimizeImages?: boolean;
    optimizationLevel?: 'standard' | 'high-quality' | 'max-quality';
  }
): Promise<void> {
  const startTime = Date.now();
  const TIMEOUT_MS = 5 * 60 * 1000;
  
  const localJobId = `local-${sessionId}`;
  await setSessionJobId(sessionId, localJobId);
  
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

    const contentPromise = generateQuestionsFromImages(images, options);
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
    );
    
    const content = await Promise.race([contentPromise, timeoutPromise]);

    await updateProgress(90, 'حفظ النتائج');
    
    await storage.updateQuizSessionContent(sessionId, content.lesson, content.questions, content.warnings);
    
    await storage.clearQuizSessionImages(sessionId);

    if (creditsToCharge > 0) {
      const charged = await (storage as any).useCreditsForOwner(deviceId, userId, creditsToCharge);
      const ownerId = userId ? `user_${userId.substring(0, 8)}...` : deviceId.substring(0, 8) + '...';
      if (charged) {
        metrics.recordCreditsUsed(creditsToCharge);
        logger.info(`Credits charged on success`, { 
          sessionId, 
          ownerId, 
          credits: creditsToCharge 
        });
      } else {
        logger.warn(`Failed to charge credits (possible race)`, { sessionId, ownerId });
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
    
    try {
      await storage.clearQuizSessionImages(sessionId);
    } catch {}
  }
}

export function registerQuizRoutes(app: Express): void {
  app.post("/api/quiz/create", quizCreateLimiter, async (req: Request, res: Response) => {
    const startTime = Date.now();
    const tokenSecret = getDeviceTokenSecret();
    const isProd = process.env.NODE_ENV === 'production';
    const devBypass = !isProd && process.env.ENABLE_DEV_DEVICE_BYPASS === 'true';
    let idemKey: string | undefined;
    
    try {
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

      const dailyQuizLimit = parseInt(process.env.QUIZ_DAILY_LIMIT || '60', 10);
      const quotaKey = `quiz:${data.deviceId}`;
      const { allowed, currentCount } = await checkAndIncrementQuota(quotaKey, dailyQuizLimit);
      
      if (!allowed) {
        logger.warn("Daily quiz quota exceeded", { 
          deviceId: data.deviceId.substring(0, 8),
          currentCount,
          dailyLimit: dailyQuizLimit,
        });
        return res.status(429).json({
          error: "لقد وصلت للحد اليومي للاختبارات. حاول غداً.",
          code: "QUOTA_EXCEEDED",
          dailyLimit: dailyQuizLimit,
          currentCount,
        });
      }

      const requestId = data.requestId || req.headers['x-request-id'] as string || crypto.randomUUID();
      idemKey = generateIdempotencyKey(data.deviceId, requestId);
      
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
      
      const reserved = await setIdempotencyPending(idemKey);
      if (!reserved) {
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
      
      // [P0 FIX] In production, Redis is required for quiz generation to prevent OOM
      if (!isRedisRequiredForQuiz()) {
        await clearIdempotency(idemKey);
        logger.error("Quiz generation unavailable - Redis not configured in production");
        return res.status(503).json({
          error: "خدمة توليد الاختبارات غير متاحة حالياً",
          code: "SERVICE_UNAVAILABLE",
          suggestion: "حاول مرة أخرى لاحقاً",
          retryAfter: 300,
        });
      }

      let quizUserId: string | null = null;
      
      // [FIX v3.8.6] Check BOTH session cookie AND Bearer token (same as credits.routes.ts)
      const SESSION_COOKIE_NAME = process.env.NODE_ENV === 'production' ? '__Host-session' : 'session_token';
      
      // [Priority 1] Check session cookie first (Google OAuth / session-based login)
      const sessionCookie = req.cookies?.[SESSION_COOKIE_NAME];
      if (sessionCookie) {
        try {
          const session = await storage.getUserSession(sessionCookie);
          if (session && new Date(session.expiresAt) > new Date()) {
            quizUserId = session.userId;
            logger.info("[Quiz] User authenticated via session cookie", {
              userId: quizUserId.substring(0, 8),
              deviceId: data.deviceId.substring(0, 8),
            });
          }
        } catch (e) {
          logger.warn("[Quiz] Error checking session cookie", { error: (e as Error).message });
        }
      }
      
      // [Priority 2] Check Bearer token if no session cookie
      if (!quizUserId) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          const sessionToken = authHeader.substring(7);
          try {
            const session = await storage.getUserSession(sessionToken);
            if (session && new Date(session.expiresAt) > new Date()) {
              quizUserId = session.userId;
              logger.info("[Quiz] User authenticated via Bearer token", {
                userId: quizUserId.substring(0, 8),
                deviceId: data.deviceId.substring(0, 8),
              });
            }
          } catch (e) {
            logger.warn("[Quiz] Error checking Bearer token", { error: (e as Error).message });
          }
        }
      }
      
      logger.info("[Quiz] Credits lookup", {
        deviceId: data.deviceId.substring(0, 8),
        hasUserId: !!quizUserId,
        userId: quizUserId?.substring(0, 8) || null,
      });
      
      let credits = await (storage as any).getCreditsForOwner(data.deviceId, quizUserId);
      if (!credits) {
        if (quizUserId) {
          const userOwnerId = `user_${quizUserId}`;
          credits = await storage.createOrUpdatePageCredits(userOwnerId, 0);
        } else {
          credits = await storage.initializeDeviceCredits(data.deviceId);
        }
      }
      
      if ((credits as any).status === 'on_hold') {
        await clearIdempotency(idemKey);
        return res.status(403).json({
          error: "الحساب موقوف مؤقتاً",
          code: "ACCOUNT_ON_HOLD",
          suggestion: "تواصل مع الدعم الفني",
        });
      }

      if ((credits.pagesRemaining || 0) < imageCount) {
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

      const creditsToCharge = imageCount;

      const session = await storage.createQuizSession({
        deviceId: data.deviceId,
        images: data.images,
        imageCount: imageCount,
      });

      let jobId = "local";
      let status: "queued" | "processing" = "processing";

      // [v3.8.7 FIX] In production, allow sync fallback when Redis is unavailable
      // This enables moderate traffic without Redis while still preferring queue when available
      if (!redisUp && isProd) {
        logger.warn("Redis unavailable in production - using synchronous fallback", {
          sessionId: session.id,
          deviceId: data.deviceId.substring(0, 8),
        });
        // Continue to sync processing instead of blocking
      }

      if (redisUp) {
        try {
          jobId = await queueQuizGeneration(
            session.id,
            data.deviceId,
            data.images,
            data.optimizationLevel,
            creditsToCharge,
            quizUserId
          );
          status = "queued";
          await setJobMapping(jobId, session.id, "queued");
          await setSessionJobId(session.id, jobId);
          await setIdempotency(idemKey, jobId, session.id);
          metrics.recordQuizQueued();
          
          logger.info("Quiz job queued", { sessionId: session.id, jobId, creditsToCharge, hasUser: !!quizUserId });
        } catch (queueError) {
          // [v3.8.7 FIX] In production, allow sync fallback when queue fails
          logger.warn("Quiz queue failed - falling back to sync processing", { 
            sessionId: session.id,
            error: (queueError as Error).message,
            isProd 
          });
          await setIdempotency(idemKey, "local", session.id);
          
          const capturedIdemKey = idemKey;
          void processQuizAsync(session.id, data.deviceId, creditsToCharge, data.images, quizUserId, {
            optimizeImages: data.optimizeImages,
            optimizationLevel: data.optimizationLevel
          }).catch(err => {
            logger.error("Background quiz processing failed", { 
              sessionId: session.id, 
              error: err.message 
            });
            if (capturedIdemKey) void clearIdempotency(capturedIdemKey);
          });
        }
      } else {
        // Dev mode only: allow local fallback when Redis is down
        await setIdempotency(idemKey, "local", session.id);
        
        const capturedIdemKey = idemKey;
        void processQuizAsync(session.id, data.deviceId, creditsToCharge, data.images, quizUserId, {
          optimizeImages: data.optimizeImages,
          optimizationLevel: data.optimizationLevel
        }).catch(err => {
          logger.error("Background quiz processing failed", { 
            sessionId: session.id, 
            error: err.message 
          });
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

  app.get("/api/quiz/:sessionId", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const headerDeviceId = req.headers["x-device-id"] as string | undefined;
      
      logger.info("Quiz GET request", {
        sessionId: sessionId?.substring(0, 8) + "...",
        headerDeviceId: headerDeviceId?.substring(0, 8) || "NONE",
      });

      if (!sessionId || sessionId.length > 100) {
        return res.status(400).json({
          error: "معرف الجلسة غير صحيح",
          code: "INVALID_SESSION_ID",
        });
      }

      const session = await storage.getQuizSessionById(sessionId);

      if (!session) {
        logger.warn("Quiz session not found in DB", { sessionId: sessionId.substring(0, 8) });
        return res.status(404).json({
          error: "الجلسة غير موجودة أو منتهية",
          code: "SESSION_NOT_FOUND",
          suggestion: "قد تكون الجلسة انتهت (24 ساعة). أنشئ اختباراً جديداً.",
        });
      }
      
      logger.info("Quiz session found", {
        sessionId: session.id.substring(0, 8),
        sessionDeviceId: session.deviceId?.substring(0, 8) || "NONE",
        status: session.status,
        questionCount: session.questions?.length || 0,
      });
      
      if (!verifySessionDeviceToken(req, res, session.deviceId)) {
        return;
      }
      
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
      
      let processing: { progress: number; stage: string; etaSeconds: number } | undefined;
      if (session.status === 'processing') {
        const jobId = await getSessionJobId(sessionId);
        if (jobId) {
          const progressData = await getJobProgress(jobId);
          if (progressData) {
            const avgMs = metrics.getMetrics().quizzes.averageProcessingTime || 0;
            const remaining = (100 - progressData.progress) / 100;
            const etaSeconds = avgMs > 0 
              ? Math.ceil(remaining * avgMs / 1000)
              : Math.ceil(remaining * (session.imageCount || 5) * 12);
            processing = {
              progress: progressData.progress,
              stage: progressData.stage,
              etaSeconds,
            };
          }
        }
        if (!processing) {
          processing = {
            progress: 10,
            stage: 'جاري المعالجة',
            etaSeconds: (session.imageCount || 5) * 12,
          };
        }
      }
      
      res.json({
        id: session.id,
        status: session.status,
        lesson: session.lesson || null,
        questions: session.questions || [],
        totalQuestions: session.totalQuestions,
        ...(processing && { processing }),
        qualityScore,
        validationSummary: {
          status: validationStatus,
          reasons: session.status === 'recapture_required' 
            ? ["الصور غير واضحة", "يرجى إعادة التصوير"] 
            : session.status === 'failed'
              ? ["حدث خطأ أثناء المعالجة"]
              : [],
        },
        ...(session.status === "recapture_required" && {
          recaptureRequired: true,
          recaptureMessage: "الصور غير واضحة. الرجاء إعادة تصوير الصفحات بإضاءة أفضل وجودة أعلى",
        }),
      });
    } catch (error) {
      sendError(res, error as Error);
    }
  });

  app.post("/api/quiz/:sessionId/submit", async (req: Request, res: Response) => {
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
      
      if (!verifySessionDeviceToken(req, res, session.deviceId)) {
        return;
      }

      if (!session.questions || session.questions.length === 0) {
        return res.status(400).json({
          error: "الاختبار غير جاهز بعد",
          code: "QUIZ_NOT_READY",
          suggestion: "انتظر حتى تنتهي معالجة الأسئلة",
        });
      }

      let score = 0;
      const arabicToEnglish: Record<string, string> = { "أ": "A", "ب": "B", "ج": "C", "د": "D" };
      
      session.questions.forEach((q, i) => {
        const userAnswer = data.answers[i];
        const question = q as any;
        const correctAnswer = question.correct;
        
        switch (question.type) {
          case "true_false":
            if ((userAnswer === "true") === correctAnswer) {
              score++;
            }
            break;
            
          case "fill_blank": {
            const userAns = (userAnswer || "").trim().toLowerCase();
            const correctAns = (correctAnswer || "").toString().trim().toLowerCase();
            if (userAns === correctAns || userAns.includes(correctAns) || correctAns.includes(userAns)) {
              score++;
            }
            break;
          }
          
          case "matching":
            if (userAnswer === "correct") {
              score++;
            }
            break;
            
          case "multiple_choice":
          default: {
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

  app.get("/api/quiz/:sessionId/result", async (req: Request, res: Response) => {
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
      
      if (!verifySessionDeviceToken(req, res, session.deviceId)) {
        return;
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

  app.get("/api/quiz/job/:jobId/status", async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      if (!jobId || jobId.length > 100) {
        return res.status(400).json({
          error: "معرف المهمة غير صحيح",
          code: "INVALID_JOB_ID",
        });
      }

      if (jobId === "local") {
        return res.json({
          jobId: "local",
          status: "processing",
          message: "المعالجة تتم محلياً بدون queue",
        });
      }

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

  app.get("/api/quiz/job/:jobId/result", async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      if (!jobId || jobId.length > 100) {
        return res.status(400).json({
          error: "معرف المهمة غير صحيح",
          code: "INVALID_JOB_ID",
        });
      }

      if (jobId === "local") {
        return res.status(409).json({
          error: "لا يمكن الحصول على النتيجة من المعالجة المحلية",
          code: "LOCAL_PROCESSING",
          suggestion: "استخدم /api/quiz/:sessionId للحصول على النتيجة",
        });
      }

      const mapping = await getJobMapping(jobId);
      if (!mapping) {
        return res.status(404).json({
          error: "المهمة غير موجودة",
          code: "JOB_NOT_FOUND",
        });
      }

      const status = await getJobStatus(jobId);
      if (status.status !== "completed") {
        return res.status(409).json({
          error: "المهمة لم تنتهِ بعد",
          code: "JOB_NOT_COMPLETED",
          status: status.status,
          progress: status.progress,
        });
      }

      const session = await storage.getQuizSessionById(mapping.sessionId);
      if (!session) {
        return res.status(404).json({
          error: "الجلسة غير موجودة",
          code: "SESSION_NOT_FOUND",
        });
      }
      
      if (!verifySessionDeviceToken(req, res, session.deviceId)) {
        return;
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

  app.post("/api/quiz/:sessionId/report-question", reportLimiter, async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { questionIndex, questionText, reason, details, deviceId } = req.body;
      
      if (typeof questionIndex !== 'number' || !questionText || !reason) {
        return res.status(400).json({ error: "بيانات البلاغ غير مكتملة" });
      }
      
      const validReasons = ['unclear', 'wrong_answer', 'duplicate', 'inappropriate', 'other'];
      if (!validReasons.includes(reason)) {
        return res.status(400).json({ error: "سبب البلاغ غير صالح" });
      }
      
      const session = await storage.getQuizSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      
      const report = await storage.createQuestionReport({
        sessionId,
        questionIndex,
        questionText: questionText.substring(0, 1000),
        reportReason: reason,
        reportDetails: details?.substring(0, 2000) || null,
        deviceId: deviceId || session.deviceId,
        userId: null,
      });
      
      logger.info("Question report submitted", {
        reportId: report.id,
        sessionId,
        questionIndex,
        reason,
      });
      
      sendQuestionReportNotification({
        reportId: report.id,
        sessionId,
        questionIndex,
        questionText,
        reason,
        details,
      }).catch((emailError) => {
        logger.warn("Failed to send report notification email", { error: (emailError as Error).message });
      });
      
      res.json({ success: true, reportId: report.id });
    } catch (error) {
      logger.error("Failed to submit question report", { error: (error as Error).message });
      res.status(500).json({ error: "فشل إرسال البلاغ" });
    }
  });

  /**
   * [v3.8.5] Question Feedback (thumbs up/down)
   * POST /api/quiz/:sessionId/feedback
   */
  app.post("/api/quiz/:sessionId/feedback", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { questionIndex, questionText, feedback } = req.body;
      
      if (!["up", "down"].includes(feedback)) {
        return res.status(400).json({ error: "Invalid feedback value" });
      }
      
      if (typeof questionIndex !== "number" || questionIndex < 0) {
        return res.status(400).json({ error: "Invalid question index" });
      }
      
      await storage.createQuestionFeedback({
        sessionId,
        questionIndex,
        questionText: questionText || null,
        feedback,
      });
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Feedback error", { error: (error as Error).message });
      res.status(500).json({ error: "Failed to save feedback" });
    }
  });
}
