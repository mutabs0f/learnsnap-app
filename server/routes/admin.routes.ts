/**
 * Admin endpoints (protected) - L6 Compliance Update
 * 
 * @version 3.4.0 - JWT-based admin authentication with RBAC
 * 
 * Endpoints (versioned with legacy fallback):
 * - POST /api/v1/admin/login - Admin login (returns JWT)
 * - GET /api/v1/admin/stats - Dashboard statistics
 * - GET /api/v1/admin/devices - Device list
 * - GET /api/v1/admin/transactions - Transaction list
 * - GET /api/v1/admin/metrics - System metrics
 * - GET /api/v1/admin/question-reports - Question reports
 * - GET /api/v1/admin/question-reports/stats - Report statistics
 * - PATCH /api/v1/admin/question-reports/:reportId - Update report
 * - GET /api/v1/admin/users - User list (paginated)
 * - PATCH /api/v1/admin/users/:userId/verify-email - Verify user email
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import logger from "../logger";
import { metrics } from "../metrics";
import { requireAdminAuth, authenticateAdminPassword, AdminRequest } from "../admin-auth";
import { apiSuccess, apiError } from "../utils/helpers";
import { auditLog } from "../audit-logger";
import { featureFlags } from "../feature-flags";

const isProduction = process.env.NODE_ENV === 'production';

const adminEnabled = isProduction 
  ? process.env.ENABLE_ADMIN === 'true'
  : process.env.ENABLE_ADMIN !== 'false';

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 15 : 50,
  message: apiError("Too many requests - please wait", "RATE_LIMIT_EXCEEDED"),
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: apiError("Too many login attempts", "LOGIN_RATE_LIMIT"),
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLoginSchema = z.object({
  password: z.string().min(1),
});

// Handler functions (DRY principle - used by both versioned and legacy routes)
async function handleAdminLogin(req: Request, res: Response, auditEnabled = false) {
  const parseResult = adminLoginSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json(apiError("Invalid request", "VALIDATION_ERROR"));
  }
  
  const { password } = parseResult.data;
  const result = await authenticateAdminPassword(password);
  
  if (!result.success) {
    return res.status(401).json(apiError(result.error || "Invalid credentials", "AUTH_FAILED"));
  }
  
  if (auditEnabled) {
    await auditLog({
      actorType: 'admin',
      actorId: 'admin',
      action: 'ADMIN_LOGIN_SUCCESS',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
  
  return res.json(apiSuccess({ 
    token: result.token,
    expiresIn: 4 * 60 * 60,
  }));
}

async function handleGetStats(_req: AdminRequest, res: Response) {
  try {
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
        totalRevenue: Number(totalRevenueResult.rows[0]?.total || 0) / 100,
      },
      recentQuizzes: recentQuizzesResult.rows,
      recentUsers: recentUsersResult.rows,
    });
  } catch (error) {
    logger.error("Failed to get admin stats", { error: (error as Error).message });
    res.status(500).json(apiError("Failed to get stats", "STATS_ERROR"));
  }
}

async function handleGetDevices(_req: AdminRequest, res: Response) {
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
    res.status(500).json(apiError("Failed to get devices", "DEVICES_ERROR"));
  }
}

async function handleGetTransactions(_req: AdminRequest, res: Response) {
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
    res.status(500).json(apiError("Failed to get transactions", "TRANSACTIONS_ERROR"));
  }
}

async function handleGetMetrics(_req: AdminRequest, res: Response) {
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
    res.status(500).json(apiError("Failed to get metrics", "METRICS_ERROR"));
  }
}

async function handleGetReports(req: AdminRequest, res: Response) {
  try {
    const status = req.query.status as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    
    const { reports, total } = await storage.getQuestionReports(status, page, limit);
    const totalPages = Math.ceil(total / limit);
    
    res.json({ reports, total, page, totalPages });
  } catch (error) {
    logger.error("Failed to get question reports", { error: (error as Error).message });
    res.status(500).json(apiError("Failed to get reports", "REPORTS_ERROR"));
  }
}

async function handleGetReportStats(_req: AdminRequest, res: Response) {
  try {
    const stats = await storage.getQuestionReportStats();
    res.json(stats);
  } catch (error) {
    logger.error("Failed to get report stats", { error: (error as Error).message });
    res.status(500).json(apiError("Failed to get stats", "STATS_ERROR"));
  }
}

async function handleUpdateReport(req: AdminRequest, res: Response) {
  try {
    const reportId = parseInt(req.params.reportId);
    const { status, adminNotes } = req.body;
    
    if (!['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json(apiError("Invalid status", "VALIDATION_ERROR"));
    }
    
    await storage.updateQuestionReportStatus(reportId, status, adminNotes);
    logger.info("Question report status updated", { reportId, status });
    
    res.json(apiSuccess({ updated: true }));
  } catch (error) {
    logger.error("Failed to update report", { error: (error as Error).message });
    res.status(500).json(apiError("Failed to update report", "UPDATE_ERROR"));
  }
}

async function handleGetUsers(_req: AdminRequest, res: Response) {
  try {
    const result = await db.execute(sql`
      SELECT id, email, name, email_verified, created_at 
      FROM users 
      ORDER BY created_at DESC 
      LIMIT 100
    `);
    res.json({ users: result.rows });
  } catch (error) {
    logger.error("Failed to get users", { error: (error as Error).message });
    res.status(500).json(apiError("Failed to get users", "USERS_ERROR"));
  }
}

async function handleVerifyUserEmail(req: AdminRequest, res: Response) {
  try {
    const { userId } = req.params;
    
    const result = await db.execute(sql`
      UPDATE users 
      SET email_verified = true, updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id, email, email_verified
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json(apiError("User not found", "NOT_FOUND"));
    }
    
    logger.info("Admin manually verified user email", { 
      userId, 
      email: result.rows[0].email 
    });
    
    res.json(apiSuccess({ 
      user: result.rows[0],
      message: "Email verified successfully" 
    }));
  } catch (error) {
    logger.error("Failed to verify user email", { error: (error as Error).message });
    res.status(500).json(apiError("Failed to verify email", "VERIFY_ERROR"));
  }
}

export function registerAdminRoutes(app: Express): void {
  const adminPasswordConfigured = !!(process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD_HASH);
  const shouldEnableAdmin = isProduction 
    ? (adminEnabled && adminPasswordConfigured)
    : (adminEnabled || !isProduction);
  
  if (!isProduction && adminEnabled && !adminPasswordConfigured) {
    logger.warn("Admin enabled in dev mode without ADMIN_PASSWORD - admin routes will reject requests");
  }
  
  if (isProduction && adminEnabled && !adminPasswordConfigured) {
    logger.error("ENABLE_ADMIN=true but ADMIN_PASSWORD not set - admin routes disabled for security");
  }
  
  if (!shouldEnableAdmin) {
    logger.info("Admin routes disabled in production (ENABLE_ADMIN=false)");
    return;
  }

  // === Versioned Routes (v1) ===
  app.post("/api/v1/admin/login", loginLimiter, (req, res) => handleAdminLogin(req, res, true));
  app.get("/api/v1/admin/stats", adminLimiter, requireAdminAuth('stats.read'), handleGetStats);
  app.get("/api/v1/admin/devices", adminLimiter, requireAdminAuth('devices.read'), handleGetDevices);
  app.get("/api/v1/admin/transactions", adminLimiter, requireAdminAuth('transactions.read'), handleGetTransactions);
  app.get("/api/v1/admin/metrics", adminLimiter, requireAdminAuth('stats.read'), handleGetMetrics);
  app.get("/api/v1/admin/question-reports", adminLimiter, requireAdminAuth('reports.read'), handleGetReports);
  app.get("/api/v1/admin/question-reports/stats", adminLimiter, requireAdminAuth('reports.read'), handleGetReportStats);
  app.patch("/api/v1/admin/question-reports/:reportId", adminLimiter, requireAdminAuth('reports.update'), handleUpdateReport);
  app.get("/api/v1/admin/users", adminLimiter, requireAdminAuth('users.read'), handleGetUsers);
  app.patch("/api/v1/admin/users/:userId/verify-email", adminLimiter, requireAdminAuth('users.verify'), handleVerifyUserEmail);

  // === Legacy Routes (backward compatibility) ===
  app.post("/api/admin/login", loginLimiter, (req, res) => handleAdminLogin(req, res, false));
  app.get("/api/admin/stats", adminLimiter, requireAdminAuth('stats.read'), handleGetStats);
  app.get("/api/admin/devices", adminLimiter, requireAdminAuth('devices.read'), handleGetDevices);
  app.get("/api/admin/transactions", adminLimiter, requireAdminAuth('transactions.read'), handleGetTransactions);
  app.get("/api/admin/metrics", adminLimiter, requireAdminAuth('stats.read'), handleGetMetrics);
  app.get("/api/admin/question-reports", adminLimiter, requireAdminAuth('reports.read'), handleGetReports);
  app.get("/api/admin/question-reports/stats", adminLimiter, requireAdminAuth('reports.read'), handleGetReportStats);
  app.patch("/api/admin/question-reports/:reportId", adminLimiter, requireAdminAuth('reports.update'), handleUpdateReport);
  app.get("/api/admin/users", adminLimiter, requireAdminAuth('users.read'), handleGetUsers);
  app.patch("/api/admin/users/:userId/verify-email", adminLimiter, requireAdminAuth('users.verify'), handleVerifyUserEmail);

  // === Feature Flag Management Routes [SRE v3.5.0] ===
  app.get("/api/v1/admin/feature-flags", adminLimiter, requireAdminAuth('stats.read'), (_req: AdminRequest, res: Response) => {
    res.json(apiSuccess({ flags: featureFlags.getAllFlags() }));
  });

  app.post("/api/v1/admin/feature-flags/:flag", adminLimiter, requireAdminAuth('super_admin'), async (req: AdminRequest, res: Response) => {
    const { flag } = req.params;
    const { enabled } = req.body;
    
    const validFlags = ['MAINTENANCE_MODE', 'DISABLE_AI_GENERATION', 'DISABLE_PAYMENTS', 'READ_ONLY_MODE', 'DISABLE_REGISTRATION', 'REDUCED_AI_CONCURRENCY'];
    
    if (!validFlags.includes(flag)) {
      return res.status(400).json(apiError(`Invalid flag: ${flag}`, "INVALID_FLAG"));
    }
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json(apiError("enabled must be boolean", "VALIDATION_ERROR"));
    }
    
    featureFlags.setFlag(flag as any, enabled);
    
    await auditLog({
      actorType: 'admin',
      actorId: req.admin?.role || 'admin',
      action: 'FEATURE_FLAG_CHANGED',
      targetType: 'feature_flag',
      targetId: flag,
      metadata: { flag, enabled },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    
    res.json(apiSuccess({ flag, enabled, message: `Feature flag ${flag} set to ${enabled}` }));
  });

  app.delete("/api/v1/admin/feature-flags/:flag", adminLimiter, requireAdminAuth('super_admin'), async (req: AdminRequest, res: Response) => {
    const { flag } = req.params;
    
    const validFlags = ['MAINTENANCE_MODE', 'DISABLE_AI_GENERATION', 'DISABLE_PAYMENTS', 'READ_ONLY_MODE', 'DISABLE_REGISTRATION', 'REDUCED_AI_CONCURRENCY'];
    
    if (!validFlags.includes(flag)) {
      return res.status(400).json(apiError(`Invalid flag: ${flag}`, "INVALID_FLAG"));
    }
    
    featureFlags.clearOverride(flag as any);
    
    await auditLog({
      actorType: 'admin',
      actorId: req.admin?.role || 'admin',
      action: 'FEATURE_FLAG_OVERRIDE_CLEARED',
      targetType: 'feature_flag',
      targetId: flag,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    
    res.json(apiSuccess({ flag, message: `Override for ${flag} cleared, reverting to default` }));
  });

  logger.info("Admin routes registered");
}
