import { Router, Request, Response } from "express";
import { z } from "zod";
import { storage } from "./storage";
import { db } from "./db";
import { sql, eq } from "drizzle-orm";
import { supportActions, users, pageCredits, pendingPayments, transactions } from "../shared/schema.js";
import logger from "./logger";
import { sendVerificationEmail } from "./email-service";
import rateLimit from "express-rate-limit";

const router = Router();

const MAX_PAGES_PER_ACTION = 500;

const VALID_REASON_CODES = ["COMPENSATION", "PROMO", "BUG", "FRAUD_REVIEW", "OTHER"] as const;
const VALID_ACTION_TYPES = ["GRANT_PAGES", "REVERSE_PAGES", "RESEND_VERIFICATION", "MARK_VERIFIED"] as const;

const adminSupportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "عدد طلبات كثيرة، يرجى الانتظار", code: "RATE_LIMITED" },
  standardHeaders: true,
  legacyHeaders: false,
});

function isAdminAuthenticated(req: Request): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  const providedPassword = req.headers["x-admin-password"];
  return providedPassword === adminPassword;
}

function adminAuthMiddleware(req: Request, res: Response, next: Function) {
  if (!isAdminAuthenticated(req)) {
    return res.status(401).json({ error: "غير مصرح", code: "UNAUTHORIZED" });
  }
  next();
}

const lookupSchema = z.object({
  email: z.string().email().optional(),
  userId: z.string().optional(),
  deviceId: z.string().optional(),
  transactionNo: z.string().optional(),
}).refine(data => data.email || data.userId || data.deviceId || data.transactionNo, {
  message: "At least one search parameter required"
});

const grantPagesSchema = z.object({
  targetOwnerId: z.string().min(1, "targetOwnerId required"),
  amount: z.number().int().positive().max(MAX_PAGES_PER_ACTION, `Max ${MAX_PAGES_PER_ACTION} pages per action`),
  reasonCode: z.enum(VALID_REASON_CODES),
  referenceId: z.string().min(1, "referenceId required"),
  notes: z.string().optional(),
  idempotencyKey: z.string().min(1, "idempotencyKey required"),
});

const reversePagesSchema = z.object({
  targetOwnerId: z.string().min(1, "targetOwnerId required"),
  amount: z.number().int().positive().max(MAX_PAGES_PER_ACTION, `Max ${MAX_PAGES_PER_ACTION} pages per action`),
  reasonCode: z.enum(VALID_REASON_CODES),
  referenceId: z.string().min(1, "referenceId required"),
  notes: z.string().optional(),
  idempotencyKey: z.string().min(1, "idempotencyKey required"),
});

const resendVerificationSchema = z.object({
  userId: z.string().min(1, "userId required"),
  reasonCode: z.enum(VALID_REASON_CODES),
  referenceId: z.string().min(1, "referenceId required"),
  notes: z.string().optional(),
  idempotencyKey: z.string().min(1, "idempotencyKey required"),
});

const markVerifiedSchema = z.object({
  userId: z.string().min(1, "userId required"),
  reasonCode: z.enum(VALID_REASON_CODES),
  referenceId: z.string().min(1, "referenceId required"),
  notes: z.string().optional(),
  idempotencyKey: z.string().min(1, "idempotencyKey required"),
  confirmationText: z.literal("CONFIRM"),
});

router.get("/lookup", adminAuthMiddleware, adminSupportLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = lookupSchema.safeParse({
      email: req.query.email,
      userId: req.query.userId,
      deviceId: req.query.deviceId,
      transactionNo: req.query.transactionNo,
    });
    
    if (!parsed.success) {
      return res.status(400).json({ error: "At least one search parameter required", code: "INVALID_PARAMS" });
    }
    
    const { email, userId, deviceId, transactionNo } = parsed.data;
    
    let user = null;
    let credits = null;
    let recentPayments: any[] = [];
    let recentActions: any[] = [];
    let targetDeviceId = deviceId;
    let targetUserId = userId;
    
    if (email) {
      const userResult = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (userResult.length > 0) {
        user = {
          id: userResult[0].id,
          email: userResult[0].email,
          name: userResult[0].name,
          emailVerified: userResult[0].emailVerified,
          createdAt: userResult[0].createdAt,
        };
        targetUserId = userResult[0].id;
      }
    }
    
    if (targetUserId && !user) {
      const userResult = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
      if (userResult.length > 0) {
        user = {
          id: userResult[0].id,
          email: userResult[0].email,
          name: userResult[0].name,
          emailVerified: userResult[0].emailVerified,
          createdAt: userResult[0].createdAt,
        };
      }
    }
    
    if (transactionNo) {
      const paymentResult = await db.select().from(pendingPayments)
        .where(eq(pendingPayments.transactionNo, transactionNo)).limit(1);
      if (paymentResult.length > 0) {
        recentPayments.push({
          orderNumber: paymentResult[0].orderNumber,
          transactionNo: paymentResult[0].transactionNo,
          deviceId: paymentResult[0].deviceId,
          pages: paymentResult[0].pages,
          amount: paymentResult[0].amount,
          status: paymentResult[0].status,
          createdAt: paymentResult[0].createdAt,
        });
        if (!targetDeviceId) targetDeviceId = paymentResult[0].deviceId;
      }
    }
    
    let creditOwnerId = targetUserId ? `user_${targetUserId}` : targetDeviceId;
    
    if (creditOwnerId) {
      const creditsResult = await db.select().from(pageCredits).where(eq(pageCredits.deviceId, creditOwnerId)).limit(1);
      if (creditsResult.length > 0) {
        credits = {
          ownerId: creditOwnerId,
          pagesRemaining: creditsResult[0].pagesRemaining,
          totalPagesUsed: creditsResult[0].totalPagesUsed,
          isEarlyAdopter: (creditsResult[0] as any).isEarlyAdopter,
          updatedAt: creditsResult[0].updatedAt,
        };
      } else {
        credits = {
          ownerId: creditOwnerId,
          pagesRemaining: 0,
          totalPagesUsed: 0,
          isEarlyAdopter: false,
          updatedAt: null,
        };
      }
    }
    
    if (creditOwnerId || targetUserId || targetDeviceId) {
      const conditions: string[] = [];
      if (targetUserId) conditions.push(`target_user_id = '${targetUserId.replace(/'/g, "''")}'`);
      if (targetDeviceId) conditions.push(`target_device_id = '${targetDeviceId.replace(/'/g, "''")}'`);
      
      const actionsResult = conditions.length > 0 
        ? await db.select().from(supportActions)
            .where(sql.raw(conditions.join(" OR ")))
            .orderBy(sql`created_at DESC`)
            .limit(10)
        : [];
      recentActions = actionsResult.map(a => ({
        id: a.id,
        actionType: a.actionType,
        amountPages: a.amountPages,
        reasonCode: a.reasonCode,
        referenceId: a.referenceId,
        status: a.status,
        createdAt: a.createdAt,
      }));
    }
    
    logger.info("Admin support lookup", {
      operation: "support_lookup",
      adminId: "local-admin",
      searchParams: { email: email?.substring(0, 5) + "...", userId: userId?.substring(0, 8), deviceId: deviceId?.substring(0, 8), transactionNo },
    });
    
    return res.json({
      user,
      credits,
      recentPayments,
      recentActions,
      searchedBy: { email, userId, deviceId, transactionNo },
    });
  } catch (error) {
    logger.error("Support lookup error", { error: (error as Error).message });
    return res.status(500).json({ error: "خطأ في البحث", code: "LOOKUP_ERROR" });
  }
});

router.post("/grant-pages", adminAuthMiddleware, adminSupportLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = grantPagesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message, code: "INVALID_INPUT" });
    }
    
    const { targetOwnerId, amount, reasonCode, referenceId, notes, idempotencyKey } = parsed.data;
    
    const existingAction = await db.select().from(supportActions)
      .where(eq(supportActions.idempotencyKey, idempotencyKey)).limit(1);
    
    if (existingAction.length > 0) {
      if (existingAction[0].status === "APPLIED") {
        return res.json({ 
          success: true, 
          idempotent: true,
          message: "Action already applied",
          action: existingAction[0],
        });
      }
      return res.status(409).json({ 
        error: "Action with this idempotency key failed previously",
        previousStatus: existingAction[0].status,
        code: "IDEMPOTENCY_CONFLICT",
      });
    }
    
    const currentCredits = await storage.getPageCredits(targetOwnerId);
    const beforeSnapshot = {
      pagesRemaining: currentCredits?.pagesRemaining || 0,
      totalPagesUsed: currentCredits?.totalPagesUsed || 0,
    };
    
    const isUserOwner = targetOwnerId.startsWith("user_");
    const targetUserIdVal = isUserOwner ? targetOwnerId.replace("user_", "") : null;
    const targetDeviceIdVal = isUserOwner ? null : targetOwnerId;
    
    let insertedAction;
    try {
      const inserted = await db.insert(supportActions).values({
        adminIdentifier: "local-admin",
        targetUserId: targetUserIdVal,
        targetDeviceId: targetDeviceIdVal,
        actionType: "GRANT_PAGES",
        amountPages: amount,
        reasonCode,
        referenceId,
        notes: notes || null,
        idempotencyKey,
        beforeSnapshot,
        afterSnapshot: null,
        status: "PENDING",
        error: null,
      }).returning();
      insertedAction = inserted[0];
    } catch (dbErr: any) {
      if (dbErr.code === "23505") {
        const existingRetry = await db.select().from(supportActions)
          .where(eq(supportActions.idempotencyKey, idempotencyKey)).limit(1);
        if (existingRetry.length > 0 && existingRetry[0].status === "APPLIED") {
          return res.json({ success: true, idempotent: true, message: "Action already applied", action: existingRetry[0] });
        }
        return res.status(409).json({ error: "Concurrent request - action already exists", code: "IDEMPOTENCY_CONFLICT" });
      }
      throw dbErr;
    }
    
    let actionStatus = "APPLIED";
    let actionError: string | null = null;
    let afterSnapshot = null;
    
    try {
      const updatedCredits = await storage.addPageCredits(targetOwnerId, amount);
      afterSnapshot = {
        pagesRemaining: updatedCredits.pagesRemaining,
        totalPagesUsed: updatedCredits.totalPagesUsed,
      };
    } catch (err) {
      actionStatus = "FAILED";
      actionError = (err as Error).message;
    }
    
    await db.update(supportActions)
      .set({ status: actionStatus, afterSnapshot, error: actionError })
      .where(eq(supportActions.id, insertedAction.id));
    
    logger.info("Support grant pages", {
      operation: "support_grant_pages",
      targetOwnerId: targetOwnerId.substring(0, 12) + "...",
      amount,
      reasonCode,
      referenceId,
      status: actionStatus,
    });
    
    if (actionStatus === "FAILED") {
      return res.status(500).json({ error: actionError, code: "GRANT_FAILED" });
    }
    
    return res.json({
      success: true,
      action: {
        type: "GRANT_PAGES",
        amount,
        beforePages: beforeSnapshot.pagesRemaining,
        afterPages: afterSnapshot?.pagesRemaining,
      },
    });
  } catch (error) {
    logger.error("Support grant pages error", { error: (error as Error).message });
    return res.status(500).json({ error: "خطأ في إضافة الصفحات", code: "GRANT_ERROR" });
  }
});

router.post("/reverse-pages", adminAuthMiddleware, adminSupportLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = reversePagesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message, code: "INVALID_INPUT" });
    }
    
    const { targetOwnerId, amount, reasonCode, referenceId, notes, idempotencyKey } = parsed.data;
    
    const existingAction = await db.select().from(supportActions)
      .where(eq(supportActions.idempotencyKey, idempotencyKey)).limit(1);
    
    if (existingAction.length > 0) {
      if (existingAction[0].status === "APPLIED") {
        return res.json({ 
          success: true, 
          idempotent: true,
          message: "Action already applied",
          action: existingAction[0],
        });
      }
      if (existingAction[0].status === "REJECTED") {
        return res.status(400).json({ 
          error: "Action was previously rejected",
          previousStatus: existingAction[0].status,
          code: "IDEMPOTENCY_REJECTED",
        });
      }
      return res.status(409).json({ 
        error: "Action with this idempotency key failed previously",
        previousStatus: existingAction[0].status,
        code: "IDEMPOTENCY_CONFLICT",
      });
    }
    
    const currentCredits = await storage.getPageCredits(targetOwnerId);
    const beforeSnapshot = {
      pagesRemaining: currentCredits?.pagesRemaining || 0,
      totalPagesUsed: currentCredits?.totalPagesUsed || 0,
    };
    
    const isUserOwner = targetOwnerId.startsWith("user_");
    const targetUserIdVal = isUserOwner ? targetOwnerId.replace("user_", "") : null;
    const targetDeviceIdVal = isUserOwner ? null : targetOwnerId;
    
    if (!currentCredits || (currentCredits.pagesRemaining || 0) < amount) {
      try {
        await db.insert(supportActions).values({
          adminIdentifier: "local-admin",
          targetUserId: targetUserIdVal,
          targetDeviceId: targetDeviceIdVal,
          actionType: "REVERSE_PAGES",
          amountPages: amount,
          reasonCode,
          referenceId,
          notes: notes || null,
          idempotencyKey,
          beforeSnapshot,
          afterSnapshot: null,
          status: "REJECTED",
          error: `Insufficient credits. Available: ${beforeSnapshot.pagesRemaining}, Requested: ${amount}`,
        });
      } catch (dbErr: any) {
        if (dbErr.code === "23505") {
          return res.status(409).json({ error: "Concurrent request - action already exists", code: "IDEMPOTENCY_CONFLICT" });
        }
        throw dbErr;
      }
      
      return res.status(400).json({ 
        error: `الرصيد غير كافي. المتوفر: ${beforeSnapshot.pagesRemaining}، المطلوب: ${amount}`,
        code: "INSUFFICIENT_CREDITS",
        available: beforeSnapshot.pagesRemaining,
        requested: amount,
      });
    }
    
    let insertedAction;
    try {
      const inserted = await db.insert(supportActions).values({
        adminIdentifier: "local-admin",
        targetUserId: targetUserIdVal,
        targetDeviceId: targetDeviceIdVal,
        actionType: "REVERSE_PAGES",
        amountPages: amount,
        reasonCode,
        referenceId,
        notes: notes || null,
        idempotencyKey,
        beforeSnapshot,
        afterSnapshot: null,
        status: "PENDING",
        error: null,
      }).returning();
      insertedAction = inserted[0];
    } catch (dbErr: any) {
      if (dbErr.code === "23505") {
        const existingRetry = await db.select().from(supportActions)
          .where(eq(supportActions.idempotencyKey, idempotencyKey)).limit(1);
        if (existingRetry.length > 0 && existingRetry[0].status === "APPLIED") {
          return res.json({ success: true, idempotent: true, message: "Action already applied", action: existingRetry[0] });
        }
        return res.status(409).json({ error: "Concurrent request - action already exists", code: "IDEMPOTENCY_CONFLICT" });
      }
      throw dbErr;
    }
    
    let actionStatus = "APPLIED";
    let actionError: string | null = null;
    let afterSnapshot = null;
    
    try {
      const success = await storage.deductPageCredits(targetOwnerId, amount);
      if (!success) {
        throw new Error("Deduction failed - race condition or insufficient credits");
      }
      const updatedCredits = await storage.getPageCredits(targetOwnerId);
      afterSnapshot = {
        pagesRemaining: updatedCredits?.pagesRemaining || 0,
        totalPagesUsed: updatedCredits?.totalPagesUsed || 0,
      };
    } catch (err) {
      actionStatus = "FAILED";
      actionError = (err as Error).message;
    }
    
    await db.update(supportActions)
      .set({ status: actionStatus, afterSnapshot, error: actionError })
      .where(eq(supportActions.id, insertedAction.id));
    
    logger.info("Support reverse pages", {
      operation: "support_reverse_pages",
      targetOwnerId: targetOwnerId.substring(0, 12) + "...",
      amount,
      reasonCode,
      referenceId,
      status: actionStatus,
    });
    
    if (actionStatus === "FAILED") {
      return res.status(500).json({ error: actionError, code: "REVERSE_FAILED" });
    }
    
    return res.json({
      success: true,
      action: {
        type: "REVERSE_PAGES",
        amount,
        beforePages: beforeSnapshot.pagesRemaining,
        afterPages: afterSnapshot?.pagesRemaining,
      },
    });
  } catch (error) {
    logger.error("Support reverse pages error", { error: (error as Error).message });
    return res.status(500).json({ error: "خطأ في استرجاع الصفحات", code: "REVERSE_ERROR" });
  }
});

router.post("/resend-verification", adminAuthMiddleware, adminSupportLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = resendVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message, code: "INVALID_INPUT" });
    }
    
    const { userId, reasonCode, referenceId, notes, idempotencyKey } = parsed.data;
    
    const existingAction = await db.select().from(supportActions)
      .where(eq(supportActions.idempotencyKey, idempotencyKey)).limit(1);
    
    if (existingAction.length > 0) {
      if (existingAction[0].status === "APPLIED") {
        return res.json({ success: true, idempotent: true, message: "Verification email already resent" });
      }
      return res.status(409).json({ error: "Action failed previously", code: "IDEMPOTENCY_CONFLICT" });
    }
    
    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "المستخدم غير موجود", code: "USER_NOT_FOUND" });
    }
    
    const beforeSnapshot = { emailVerified: user.emailVerified };
    
    if (user.emailVerified) {
      await db.insert(supportActions).values({
        adminIdentifier: "local-admin",
        targetUserId: userId,
        targetDeviceId: null,
        actionType: "RESEND_VERIFICATION",
        amountPages: null,
        reasonCode,
        referenceId,
        notes: notes || null,
        idempotencyKey,
        beforeSnapshot,
        afterSnapshot: beforeSnapshot,
        status: "REJECTED",
        error: "Email already verified",
      });
      return res.status(400).json({ error: "البريد الإلكتروني مفعل مسبقاً", code: "ALREADY_VERIFIED" });
    }
    
    const hasResend = !!process.env.RESEND_API_KEY;
    if (!hasResend) {
      await db.insert(supportActions).values({
        adminIdentifier: "local-admin",
        targetUserId: userId,
        targetDeviceId: null,
        actionType: "RESEND_VERIFICATION",
        amountPages: null,
        reasonCode,
        referenceId,
        notes: notes || null,
        idempotencyKey,
        beforeSnapshot,
        afterSnapshot: null,
        status: "FAILED",
        error: "Email service not configured (RESEND_API_KEY missing)",
      });
      return res.status(503).json({ error: "خدمة البريد الإلكتروني غير متاحة", code: "EMAIL_SERVICE_UNAVAILABLE" });
    }
    
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    await storage.createEmailVerificationToken({ userId, token, expiresAt });
    
    const result = await sendVerificationEmail(user.email, token, user.name || undefined);
    
    const actionStatus = result.success ? "APPLIED" : "FAILED";
    
    await db.insert(supportActions).values({
      adminIdentifier: "local-admin",
      targetUserId: userId,
      targetDeviceId: null,
      actionType: "RESEND_VERIFICATION",
      amountPages: null,
      reasonCode,
      referenceId,
      notes: notes || null,
      idempotencyKey,
      beforeSnapshot,
      afterSnapshot: beforeSnapshot,
      status: actionStatus,
      error: result.error || null,
    });
    
    logger.info("Support resend verification", {
      operation: "support_resend_verification",
      userId: userId.substring(0, 8) + "...",
      reasonCode,
      referenceId,
      status: actionStatus,
    });
    
    if (!result.success) {
      return res.status(500).json({ error: result.error, code: "EMAIL_SEND_FAILED" });
    }
    
    return res.json({ success: true, message: "تم إرسال رسالة التأكيد" });
  } catch (error) {
    logger.error("Support resend verification error", { error: (error as Error).message });
    return res.status(500).json({ error: "خطأ في إرسال رسالة التأكيد", code: "RESEND_ERROR" });
  }
});

router.post("/mark-verified", adminAuthMiddleware, adminSupportLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = markVerifiedSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message, code: "INVALID_INPUT" });
    }
    
    const { userId, reasonCode, referenceId, notes, idempotencyKey } = parsed.data;
    
    const existingAction = await db.select().from(supportActions)
      .where(eq(supportActions.idempotencyKey, idempotencyKey)).limit(1);
    
    if (existingAction.length > 0) {
      if (existingAction[0].status === "APPLIED") {
        return res.json({ success: true, idempotent: true, message: "Email already marked verified" });
      }
      return res.status(409).json({ error: "Action failed previously", code: "IDEMPOTENCY_CONFLICT" });
    }
    
    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "المستخدم غير موجود", code: "USER_NOT_FOUND" });
    }
    
    const beforeSnapshot = { emailVerified: user.emailVerified };
    
    if (user.emailVerified) {
      await db.insert(supportActions).values({
        adminIdentifier: "local-admin",
        targetUserId: userId,
        targetDeviceId: null,
        actionType: "MARK_VERIFIED",
        amountPages: null,
        reasonCode,
        referenceId,
        notes: notes || null,
        idempotencyKey,
        beforeSnapshot,
        afterSnapshot: beforeSnapshot,
        status: "REJECTED",
        error: "Email already verified",
      });
      return res.status(400).json({ error: "البريد الإلكتروني مفعل مسبقاً", code: "ALREADY_VERIFIED" });
    }
    
    await storage.updateUserEmailVerified(userId);
    
    const afterSnapshot = { emailVerified: true };
    
    await db.insert(supportActions).values({
      adminIdentifier: "local-admin",
      targetUserId: userId,
      targetDeviceId: null,
      actionType: "MARK_VERIFIED",
      amountPages: null,
      reasonCode,
      referenceId,
      notes: notes || null,
      idempotencyKey,
      beforeSnapshot,
      afterSnapshot,
      status: "APPLIED",
      error: null,
    });
    
    logger.info("Support mark verified", {
      operation: "support_mark_verified",
      userId: userId.substring(0, 8) + "...",
      reasonCode,
      referenceId,
    });
    
    return res.json({ success: true, message: "تم تفعيل البريد الإلكتروني" });
  } catch (error) {
    logger.error("Support mark verified error", { error: (error as Error).message });
    return res.status(500).json({ error: "خطأ في تفعيل البريد", code: "MARK_VERIFIED_ERROR" });
  }
});

router.get("/actions", adminAuthMiddleware, adminSupportLimiter, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    
    const actions = await db.select().from(supportActions)
      .orderBy(sql`created_at DESC`)
      .limit(limit)
      .offset(offset);
    
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(supportActions);
    const total = Number(countResult[0]?.count || 0);
    
    return res.json({ actions, total, limit, offset });
  } catch (error) {
    logger.error("Support actions list error", { error: (error as Error).message });
    return res.status(500).json({ error: "خطأ في جلب السجلات", code: "LIST_ERROR" });
  }
});

export default router;

import crypto from "crypto";
