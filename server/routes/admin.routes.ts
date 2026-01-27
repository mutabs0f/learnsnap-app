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

  // === Support Tickets Routes [v4.0.0] ===
  const VALID_TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
  const VALID_TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
  
  async function getTickets(statusFilter: string, limitNum: number) {
    // Validate status
    const validStatus = VALID_TICKET_STATUSES.includes(statusFilter) ? statusFilter : null;
    const safeLimit = Math.min(Math.max(1, limitNum), 100);
    
    let result;
    if (validStatus) {
      result = await db.execute(sql`
        SELECT * FROM support_tickets 
        WHERE status = ${validStatus}
        ORDER BY created_at DESC 
        LIMIT ${safeLimit}
      `);
    } else {
      result = await db.execute(sql`
        SELECT * FROM support_tickets 
        ORDER BY created_at DESC 
        LIMIT ${safeLimit}
      `);
    }
    
    const statsResult = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'open') as open,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE status = 'closed') as closed
      FROM support_tickets
    `);
    
    return { tickets: result.rows, stats: statsResult.rows[0] };
  }
  
  async function updateTicket(ticketIdNum: number, status?: string, adminNotes?: string, priority?: string) {
    // Validate ticket ID
    if (!Number.isInteger(ticketIdNum) || ticketIdNum <= 0) {
      throw new Error("Invalid ticket ID");
    }
    
    // Validate status
    if (status && !VALID_TICKET_STATUSES.includes(status)) {
      throw new Error("Invalid status value");
    }
    
    // Validate priority
    if (priority && !VALID_TICKET_PRIORITIES.includes(priority)) {
      throw new Error("Invalid priority value");
    }
    
    // Sanitize adminNotes
    const safeNotes = adminNotes ? adminNotes.slice(0, 2000) : null;
    
    if (status === 'resolved') {
      await db.execute(sql`
        UPDATE support_tickets 
        SET status = ${status}, 
            admin_notes = COALESCE(${safeNotes}, admin_notes),
            priority = COALESCE(${priority}, priority),
            updated_at = NOW(),
            resolved_at = NOW()
        WHERE id = ${ticketIdNum}
      `);
    } else if (status) {
      await db.execute(sql`
        UPDATE support_tickets 
        SET status = ${status}, 
            admin_notes = COALESCE(${safeNotes}, admin_notes),
            priority = COALESCE(${priority}, priority),
            updated_at = NOW()
        WHERE id = ${ticketIdNum}
      `);
    } else {
      await db.execute(sql`
        UPDATE support_tickets 
        SET admin_notes = COALESCE(${safeNotes}, admin_notes),
            priority = COALESCE(${priority}, priority),
            updated_at = NOW()
        WHERE id = ${ticketIdNum}
      `);
    }
  }

  app.get("/api/v1/admin/support-tickets", adminLimiter, requireAdminAuth('reports.read'), async (req: AdminRequest, res: Response) => {
    try {
      const status = (req.query.status as string) || 'all';
      const limit = parseInt(req.query.limit as string) || 50;
      const data = await getTickets(status, limit);
      res.json(apiSuccess(data));
    } catch (error) {
      logger.error("Failed to get support tickets", { error: (error as Error).message });
      res.status(500).json(apiError("Failed to get tickets", "FETCH_ERROR"));
    }
  });

  app.patch("/api/v1/admin/support-tickets/:ticketId", adminLimiter, requireAdminAuth('reports.update'), async (req: AdminRequest, res: Response) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const { status, adminNotes, priority } = req.body;
      await updateTicket(ticketId, status, adminNotes, priority);
      res.json(apiSuccess({ message: "Ticket updated" }));
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes("Invalid")) {
        return res.status(400).json(apiError(msg, "VALIDATION_ERROR"));
      }
      logger.error("Failed to update ticket", { error: msg });
      res.status(500).json(apiError("Failed to update ticket", "UPDATE_ERROR"));
    }
  });

  // Legacy routes for tickets
  app.get("/api/admin/support-tickets", adminLimiter, requireAdminAuth('reports.read'), async (req: AdminRequest, res: Response) => {
    try {
      const status = (req.query.status as string) || 'all';
      const limit = parseInt(req.query.limit as string) || 50;
      const data = await getTickets(status, limit);
      res.json(apiSuccess(data));
    } catch (error) {
      logger.error("Failed to get support tickets", { error: (error as Error).message });
      res.status(500).json(apiError("Failed to get tickets", "FETCH_ERROR"));
    }
  });

  app.patch("/api/admin/support-tickets/:ticketId", adminLimiter, requireAdminAuth('reports.update'), async (req: AdminRequest, res: Response) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const { status, adminNotes, priority } = req.body;
      await updateTicket(ticketId, status, adminNotes, priority);
      res.json(apiSuccess({ message: "Ticket updated" }));
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes("Invalid")) {
        return res.status(400).json(apiError(msg, "VALIDATION_ERROR"));
      }
      logger.error("Failed to update ticket", { error: msg });
      res.status(500).json(apiError("Failed to update ticket", "UPDATE_ERROR"));
    }
  });

  // === Enhanced Search API [Admin Dashboard v2.0] ===
  app.get("/api/admin/search", adminLimiter, requireAdminAuth('users.read'), async (req: AdminRequest, res: Response) => {
    try {
      const query = (req.query.q as string || '').trim();
      if (!query || query.length < 2) {
        return res.json(apiSuccess({ 
          results: { users: [], devices: [] },
          query 
        }));
      }
      
      const searchPattern = `%${query}%`;
      
      // Search in users, devices, and transactions
      const [usersResult, devicesResult] = await Promise.all([
        db.execute(sql`
          SELECT id, email, name, email_verified, created_at,
                 (SELECT pages_remaining FROM page_credits WHERE user_id = users.id LIMIT 1) as credits
          FROM users 
          WHERE email ILIKE ${searchPattern} 
             OR id::text ILIKE ${searchPattern}
             OR name ILIKE ${searchPattern}
          ORDER BY created_at DESC 
          LIMIT 20
        `),
        db.execute(sql`
          SELECT pc.device_id, pc.pages_remaining, pc.total_pages_used, pc.user_id, pc.created_at, pc.updated_at,
                 u.email as user_email
          FROM page_credits pc
          LEFT JOIN users u ON pc.user_id = u.id
          WHERE pc.device_id ILIKE ${searchPattern}
             OR pc.user_id ILIKE ${searchPattern}
          ORDER BY pc.updated_at DESC 
          LIMIT 20
        `)
      ]);
      
      res.json(apiSuccess({ 
        results: {
          users: usersResult.rows,
          devices: devicesResult.rows
        },
        query 
      }));
    } catch (error) {
      logger.error("Admin search failed", { error: (error as Error).message });
      res.status(500).json(apiError("Search failed", "SEARCH_ERROR"));
    }
  });

  // === Alerts API (Suspicious Operations) [Admin Dashboard v2.0] ===
  app.get("/api/admin/alerts", adminLimiter, requireAdminAuth('stats.read'), async (_req: AdminRequest, res: Response) => {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      // 1. Users who added more than 100 credits in one day
      const highCreditsResult = await db.execute(sql`
        SELECT device_id, SUM(pages_purchased) as total_credits, COUNT(*) as transaction_count
        FROM transactions 
        WHERE created_at > ${oneDayAgo.toISOString()}
        GROUP BY device_id
        HAVING SUM(pages_purchased) > 100
        ORDER BY total_credits DESC
        LIMIT 10
      `);
      
      // 2. Failed transactions (more than 3 in an hour)
      const failedTxResult = await db.execute(sql`
        SELECT device_id, COUNT(*) as failed_count
        FROM transactions 
        WHERE created_at > ${oneHourAgo.toISOString()}
          AND (status = 'failed' OR status = 'error')
        GROUP BY device_id
        HAVING COUNT(*) > 3
        ORDER BY failed_count DESC
        LIMIT 10
      `);
      
      // 3. New accounts with high usage (created in last 24h, used >50 credits)
      const newHighUsageResult = await db.execute(sql`
        SELECT pc.device_id, pc.total_pages_used, pc.created_at, u.email
        FROM page_credits pc
        LEFT JOIN users u ON pc.user_id = u.id
        WHERE pc.created_at > ${oneDayAgo.toISOString()}
          AND pc.total_pages_used > 50
        ORDER BY pc.total_pages_used DESC
        LIMIT 10
      `);
      
      const alerts = [];
      
      // Build alerts array
      for (const row of highCreditsResult.rows) {
        alerts.push({
          type: 'high_credits',
          severity: 'warning',
          message: `جهاز ${(row.device_id as string).substring(0, 8)}... أضاف ${row.total_credits} رصيد في يوم واحد`,
          deviceId: row.device_id,
          value: row.total_credits,
          createdAt: new Date().toISOString()
        });
      }
      
      for (const row of failedTxResult.rows) {
        alerts.push({
          type: 'failed_transactions',
          severity: 'error',
          message: `جهاز ${(row.device_id as string).substring(0, 8)}... لديه ${row.failed_count} معاملات فاشلة`,
          deviceId: row.device_id,
          value: row.failed_count,
          createdAt: new Date().toISOString()
        });
      }
      
      for (const row of newHighUsageResult.rows) {
        alerts.push({
          type: 'new_high_usage',
          severity: 'warning',
          message: `حساب جديد ${row.email || (row.device_id as string).substring(0, 8)} استخدم ${row.total_pages_used} صفحة بسرعة`,
          deviceId: row.device_id,
          email: row.email,
          value: row.total_pages_used,
          createdAt: row.created_at
        });
      }
      
      res.json(apiSuccess({ alerts, count: alerts.length }));
    } catch (error) {
      logger.error("Failed to get alerts", { error: (error as Error).message });
      res.status(500).json(apiError("Failed to get alerts", "ALERTS_ERROR"));
    }
  });

  // === Credits Management API [Admin Dashboard v2.0] ===
  const creditsActionSchema = z.object({
    deviceId: z.string().min(1),
    amount: z.number().int().min(1).max(1000),
    reason: z.string().min(3).max(500),
    action: z.enum(['add', 'subtract'])
  });

  app.post("/api/admin/credits/adjust", adminLimiter, requireAdminAuth('devices.update'), async (req: AdminRequest, res: Response) => {
    try {
      const parseResult = creditsActionSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json(apiError("بيانات غير صالحة", "VALIDATION_ERROR"));
      }
      
      const { deviceId, amount, reason, action } = parseResult.data;
      
      // Get current credits
      const currentResult = await db.execute(sql`
        SELECT pages_remaining, user_id FROM page_credits WHERE device_id = ${deviceId}
      `);
      
      if (currentResult.rows.length === 0) {
        return res.status(404).json(apiError("الجهاز غير موجود", "NOT_FOUND"));
      }
      
      const currentCredits = Number(currentResult.rows[0].pages_remaining);
      const userId = currentResult.rows[0].user_id;
      
      // Calculate new balance
      const newBalance = action === 'add' 
        ? currentCredits + amount 
        : Math.max(0, currentCredits - amount);
      
      // Update credits
      await db.execute(sql`
        UPDATE page_credits 
        SET pages_remaining = ${newBalance}, updated_at = NOW()
        WHERE device_id = ${deviceId}
      `);
      
      // Log in audit_logs
      await db.execute(sql`
        INSERT INTO audit_logs (actor_type, actor_id, action, target_type, target_id, metadata, ip_address, created_at)
        VALUES (
          'admin', 
          ${req.admin?.role || 'admin'}, 
          ${action === 'add' ? 'CREDIT_GRANTED' : 'CREDIT_REVOKED'},
          'device',
          ${deviceId},
          ${JSON.stringify({ amount, reason, previousBalance: currentCredits, newBalance, userId })},
          ${req.ip},
          NOW()
        )
      `);
      
      logger.info("Admin adjusted credits", { 
        deviceId: deviceId.substring(0, 8), 
        action, 
        amount, 
        previousBalance: currentCredits, 
        newBalance,
        reason
      });
      
      res.json(apiSuccess({ 
        deviceId,
        previousBalance: currentCredits,
        newBalance,
        action,
        amount
      }));
    } catch (error) {
      logger.error("Failed to adjust credits", { error: (error as Error).message });
      res.status(500).json(apiError("فشل في تعديل الرصيد", "CREDITS_ERROR"));
    }
  });

  // Get device credits history
  app.get("/api/admin/credits/:deviceId", adminLimiter, requireAdminAuth('devices.read'), async (req: AdminRequest, res: Response) => {
    try {
      const { deviceId } = req.params;
      
      const [creditsResult, transactionsResult, auditResult] = await Promise.all([
        db.execute(sql`
          SELECT * FROM page_credits WHERE device_id = ${deviceId}
        `),
        db.execute(sql`
          SELECT * FROM transactions 
          WHERE device_id = ${deviceId}
          ORDER BY created_at DESC 
          LIMIT 10
        `),
        db.execute(sql`
          SELECT * FROM audit_logs 
          WHERE target_id = ${deviceId} AND target_type = 'device'
          ORDER BY created_at DESC 
          LIMIT 10
        `)
      ]);
      
      if (creditsResult.rows.length === 0) {
        return res.status(404).json(apiError("الجهاز غير موجود", "NOT_FOUND"));
      }
      
      res.json(apiSuccess({
        credits: creditsResult.rows[0],
        transactions: transactionsResult.rows,
        auditLog: auditResult.rows
      }));
    } catch (error) {
      logger.error("Failed to get device credits", { error: (error as Error).message });
      res.status(500).json(apiError("فشل في جلب بيانات الرصيد", "FETCH_ERROR"));
    }
  });

  // === Audit Log API [Admin Dashboard v2.0] ===
  app.get("/api/admin/audit-log", adminLimiter, requireAdminAuth('stats.read'), async (req: AdminRequest, res: Response) => {
    try {
      const actionType = req.query.action as string;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      
      let result;
      if (actionType && actionType !== 'all') {
        result = await db.execute(sql`
          SELECT * FROM audit_logs 
          WHERE action = ${actionType}
          ORDER BY created_at DESC 
          LIMIT ${limit} OFFSET ${offset}
        `);
      } else {
        result = await db.execute(sql`
          SELECT * FROM audit_logs 
          ORDER BY created_at DESC 
          LIMIT ${limit} OFFSET ${offset}
        `);
      }
      
      // Get distinct action types for filter
      const actionsResult = await db.execute(sql`
        SELECT DISTINCT action FROM audit_logs ORDER BY action
      `);
      
      res.json(apiSuccess({
        logs: result.rows,
        actions: actionsResult.rows.map(r => r.action),
        limit,
        offset
      }));
    } catch (error) {
      logger.error("Failed to get audit log", { error: (error as Error).message });
      res.status(500).json(apiError("فشل في جلب سجل العمليات", "AUDIT_ERROR"));
    }
  });

  // === Enhanced Stats with Active Users [Admin Dashboard v2.0] ===
  app.get("/api/admin/stats/enhanced", adminLimiter, requireAdminAuth('stats.read'), async (_req: AdminRequest, res: Response) => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      const [
        basicStats,
        activeUsersResult,
        totalCreditsResult,
        completedQuizzesResult
      ] = await Promise.all([
        // Basic stats
        db.execute(sql`
          SELECT
            (SELECT COUNT(*) FROM users) as total_users,
            (SELECT COUNT(*) FROM page_credits) as total_devices,
            (SELECT COUNT(*) FROM transactions) as total_transactions,
            (SELECT COALESCE(SUM(amount), 0) FROM transactions) as total_revenue,
            (SELECT COALESCE(SUM(pages_remaining), 0) FROM page_credits) as total_credits_remaining
        `),
        // Active users in last 7 days
        db.execute(sql`
          SELECT COUNT(DISTINCT device_id) as count 
          FROM quiz_sessions 
          WHERE created_at > ${sevenDaysAgo.toISOString()}
        `),
        // Total credits distributed
        db.execute(sql`
          SELECT COALESCE(SUM(pages_remaining + total_pages_used), 0) as total 
          FROM page_credits
        `),
        // Completed quizzes
        db.execute(sql`
          SELECT COUNT(*) as count FROM quiz_sessions WHERE status = 'ready'
        `)
      ]);
      
      const stats = basicStats.rows[0];
      
      res.json(apiSuccess({
        totalUsers: Number(stats.total_users),
        totalDevices: Number(stats.total_devices),
        activeUsers7Days: Number(activeUsersResult.rows[0]?.count || 0),
        totalTransactions: Number(stats.total_transactions),
        totalRevenue: Number(stats.total_revenue) / 100,
        totalCreditsDistributed: Number(totalCreditsResult.rows[0]?.total || 0),
        totalCreditsRemaining: Number(stats.total_credits_remaining),
        completedQuizzes: Number(completedQuizzesResult.rows[0]?.count || 0)
      }));
    } catch (error) {
      logger.error("Failed to get enhanced stats", { error: (error as Error).message });
      res.status(500).json(apiError("فشل في جلب الإحصائيات", "STATS_ERROR"));
    }
  });

  logger.info("Admin routes registered");
}
