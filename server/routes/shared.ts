/**
 * Shared utilities for route handlers
 * Extracted from routes.ts for modularity
 * 
 * @version 3.7.2
 * - [SECURITY] Added MIME type validation for uploaded images
 */

import type { Request, Response } from "express";
import { z } from "zod";
import logger from "../logger";
import { metrics } from "../metrics";
import { RecaptureRequiredError, ValidationUnavailableError } from "../ai-service";
import { getDeviceTokenSecret } from "../env-helpers";
import { verifyDeviceToken } from "../paylink-routes";

/**
 * [SECURITY FIX v2.9.2] Device token verification helper for session endpoints (BOLA fix)
 */
export function verifySessionDeviceToken(
  req: Request,
  res: Response,
  sessionDeviceId: string | null | undefined
): boolean {
  const tokenSecret = getDeviceTokenSecret();
  const isProd = process.env.NODE_ENV === 'production';
  const devBypass = !isProd && process.env.ENABLE_DEV_DEVICE_BYPASS === 'true';
  
  if (isProd && !tokenSecret) {
    logger.error("CRITICAL: No token secret configured in production for session verification");
    res.status(500).json({ error: "خطأ في إعداد الخادم", code: "CONFIG_ERROR" });
    return false;
  }
  
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
  
  if (devBypass) {
    return true;
  }
  
  const headerDeviceId = req.headers["x-device-id"] as string | undefined;
  
  const token = req.cookies?.device_token || req.headers["x-device-token"];
  if (!token) {
    logger.warn("Quiz session request without device token", { sessionDeviceId: sessionDeviceId.substring(0, 8) });
    res.status(401).json({
      error: "يرجى تسجيل الدخول أو إعادة فتح التطبيق",
      code: "MISSING_DEVICE_TOKEN",
    });
    return false;
  }
  
  if (!verifyDeviceToken(sessionDeviceId, token as string, tokenSecret!)) {
    logger.warn("Invalid device token on quiz session request", { sessionDeviceId: sessionDeviceId.substring(0, 8) });
    res.status(401).json({
      error: "معرف الجهاز غير صالح",
      code: "INVALID_DEVICE_TOKEN",
    });
    return false;
  }
  
  if (headerDeviceId && headerDeviceId !== sessionDeviceId) {
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
  
  return true;
}

/**
 * [SECURITY FIX v4.2] Input sanitization helper
 */
export function sanitizeInput(input: unknown): unknown {
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

/**
 * Custom error class for structured errors
 */
export class AppError extends Error {
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

/**
 * Error response helper - DO NOT CHANGE ERROR MESSAGES
 */
export function sendError(res: Response, error: AppError | Error) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.errorCode,
      suggestion: error.suggestion,
      retryAfter: error.retryAfter,
    });
  }
  
  if (error instanceof RecaptureRequiredError) {
    return res.status(400).json({
      error: error.message,
      code: "RECAPTURE_REQUIRED",
      suggestion: "صوّر الصفحة كاملة بإضاءة جيدة وتأكد من وضوح النص",
    });
  }
  
  if (error instanceof ValidationUnavailableError) {
    metrics.recordValidationOutcome('unavailable');
    return res.status(503).json({
      error: error.message,
      code: "VALIDATION_UNAVAILABLE",
      suggestion: "خدمة التحقق غير متوفرة مؤقتاً - حاول مرة أخرى بعد قليل",
      retryAfter: 60,
    });
  }
  
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
  
  logger.error("Unexpected error", { error: message, stack: (error as Error).stack });
  return res.status(500).json({
    error: "حدث خطأ غير متوقع",
    suggestion: "حاول مرة أخرى أو تواصل مع الدعم",
    code: "INTERNAL_ERROR",
  });
}

// Validation schemas - reasonable limits for quiz creation
const MAX_IMAGE_SIZE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGES_COUNT = 20;
const MAX_TOTAL_PAYLOAD_MB = 85;

// [SECURITY v3.7.2] Allowed image MIME types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

/**
 * Extract MIME type from base64 data URL
 */
function extractMimeType(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,/i);
  return match ? match[1].toLowerCase() : null;
}

export const createQuizSchema = z.object({
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
        const mimeType = extractMimeType(img);
        return mimeType && ALLOWED_IMAGE_TYPES.includes(mimeType);
      }),
      "نوع الصورة غير مدعوم - يُسمح فقط بـ JPEG, PNG, WebP"
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

export const submitQuizSchema = z.object({
  answers: z.array(z.string()),
});

export const isProduction = process.env.NODE_ENV === 'production';
