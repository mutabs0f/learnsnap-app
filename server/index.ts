import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { randomUUID } from "crypto";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import logger from "./logger";
import { config } from "./config";
import { closeDatabase, initDatabase } from "./db";
import { metrics } from "./metrics";
import "./types";
import * as Sentry from "@sentry/node";
import { setupSecurityMiddleware } from "./security";
import { memoryWatchdog } from "./memory-watchdog";
import { isMaintenanceMode } from "./feature-flags";
import { startSLOMonitoring, sliCollector } from "./sli-slo";
import { startMonitorScheduler } from "./agents/monitor";
import { startStatsScheduler } from "./agents/stats";
import { startCleanupScheduler } from "./agents/cleanup";

// Initialize Sentry for error tracking
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    beforeSend(event: Sentry.ErrorEvent) {
      if (process.env.NODE_ENV === "development") {
        return null;
      }
      return event;
    },
  });
  logger.info("Sentry initialized", { environment: process.env.NODE_ENV });
}

// [FIX #3] Require FRONTEND_URL in production for CORS safety
if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
  console.error("FATAL: FRONTEND_URL is required in production for CORS security.");
  console.error("Set FRONTEND_URL to your frontend domain (e.g., https://learnsnap.app)");
  process.exit(1);
}

// [SECURITY FIX v2.9.32] Require SESSION_SECRET in production for CSRF protection
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error("FATAL: SESSION_SECRET is required in production for CSRF protection.");
  console.error("Set SESSION_SECRET to a random 32+ character string.");
  process.exit(1);
}

// [FIX #1] Require token secret in production for device authentication  
// Note: SESSION_SECRET check above ensures this is always met
if (process.env.NODE_ENV === 'production' && !process.env.DEVICE_TOKEN_SECRET && !process.env.SESSION_SECRET) {
  console.error("FATAL: DEVICE_TOKEN_SECRET or SESSION_SECRET is required in production.");
  console.error("Set DEVICE_TOKEN_SECRET to a random 32+ character string.");
  process.exit(1);
}

// [8] Safe startup logging (NO secrets printed)
logger.info("LearnSnap Starting...", {
  nodeVersion: process.version,
  env: process.env.NODE_ENV,
  port: process.env.PORT,
  hasDatabase: !!(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL),
  hasGoogleOAuth: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  hasPayment: !!process.env.PAYLINK_API_ID,
  hasEmail: !!process.env.RESEND_API_KEY,
  frontendUrl: process.env.FRONTEND_URL || "not-set",
});

const app = express();
const httpServer = createServer(app);
let isShuttingDown = false;

// [SECURITY v2.9.32b] Trust proxy in production for correct req.ip and rate limiting
// Required when running behind Railway/Nginx/Cloudflare proxy
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
  logger.info("Trust proxy enabled for production");
}

// [FIX v2.9.17] Disable ETag to prevent 304 errors causing "unexpected error" messages
app.set('etag', false);

// Sentry request handler - MUST be first middleware
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

// Cookie parser
app.use(cookieParser());

// [SECURITY FIX v2.9.32] Enable security headers (helmet, CSP, HSTS, etc.)
setupSecurityMiddleware(app);

// Request ID for tracing (v2.7.0)
app.use((req, res, next) => {
  req.id = randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// [v4.2] API version header
app.use((req, res, next) => {
  res.setHeader('X-API-Version', '4.2.0');
  res.setHeader('X-Powered-By', 'LearnSnap');
  next();
});

// [FIX v2.9.17] Disable caching for all API routes to prevent 304 errors
app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});

// Raw body for webhook signature verification (must be before express.json)
app.use('/api/webhooks', express.raw({ type: 'application/json' }));

// Safe limits for quiz creation: 20 images × 6MB × 1.33 base64 = ~85MB max
app.use('/api/quiz/create', express.json({ limit: '85mb' }));

// [v5.1] Set longer timeout for quiz creation (10 minutes for 10+ images)
app.use('/api/quiz/create', (req: any, res: any, next: any) => {
  req.setTimeout(600000); // 10 minutes
  res.setTimeout(600000);
  next();
});

// [FIX #1] Body parsers with increased limits for large uploads
app.use(express.json({ 
  limit: '50mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  limit: '50mb', 
  extended: true,
  parameterLimit: 50000 
}));

// [FIX #3] CORS configuration - FRONTEND_URL only in production, localhost in dev
app.use((req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const origin = req.headers.origin;
  
  let allowedOrigins: string[];
  if (isProduction) {
    // Production: only FRONTEND_URL and APP_URL
    allowedOrigins = [
      process.env.FRONTEND_URL,
      process.env.APP_URL,
    ].filter(Boolean) as string[];
  } else {
    // Development: localhost origins only
    allowedOrigins = [
      'http://localhost:5000',
      'http://localhost:3000',
      'http://127.0.0.1:5000',
      'http://127.0.0.1:3000',
    ];
    // Also allow Replit dev URLs
    if (origin && (origin.includes('.replit.dev') || origin.includes('.replit.app'))) {
      allowedOrigins.push(origin);
    }
  }
  
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!isProduction && !origin) {
    // Allow same-origin requests in development (no origin header)
    res.header('Access-Control-Allow-Origin', '*');
  }
  // Note: No Access-Control-Allow-Origin header if origin not allowed
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-device-token, x-admin-password');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// [SRE v3.5.0] Maintenance mode middleware - allows health, metrics, static assets, and Vite dev
app.use((req, res, next) => {
  const exemptPaths = ['/health', '/metrics', '/@vite', '/@fs', '/node_modules', '/src/', '/.', '/assets'];
  const isExempt = exemptPaths.some(p => req.path.startsWith(p)) || 
                   req.path.endsWith('.js') || 
                   req.path.endsWith('.css') ||
                   req.path.endsWith('.html') ||
                   req.path.endsWith('.svg') ||
                   req.path.endsWith('.png') ||
                   req.path.endsWith('.ico');
  
  if (isMaintenanceMode() && !isExempt) {
    return res.status(503).json({
      error: 'الخدمة تحت الصيانة',
      code: 'MAINTENANCE_MODE',
      message: 'Service is under maintenance. Please try again later.',
      retryAfter: 300,
    });
  }
  next();
});

// [FIX v2.9.8] Disable caching for API endpoints to prevent 304 issues
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

// [FIX #5] HTTP metrics middleware + request logging + SLI latency tracking
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    
    // Record metrics for API endpoints
    const routeKey = req.route?.path || req.path.replace(/\/[a-f0-9-]{36}/gi, '/:id');
    metrics.recordRequest(routeKey, res.statusCode);
    
    // [SRE v3.5.0] Record latency for SLI tracking
    if (req.path.startsWith("/api")) {
      sliCollector.recordLatency(duration);
      logger.info(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});

(async () => {
  // Initialize database tables
  await initDatabase();
  
  // [ENTERPRISE v3.0] Initialize audit logs table (fail-safe, won't crash if fails)
  try {
    const { initAuditLogsTable, initQuotaCountersTable } = await import("./audit-logger");
    await initAuditLogsTable();
    await initQuotaCountersTable();
    logger.info("Enterprise audit/quota tables initialized");
  } catch (err) {
    logger.warn("Could not initialize audit/quota tables (non-critical)", { 
      error: (err as Error).message 
    });
  }
  
  await registerRoutes(httpServer, app);
  
  // Sentry error handler - MUST be before custom error handler
  if (process.env.SENTRY_DSN) {
    app.use(Sentry.Handlers.errorHandler());
  }

  // [SECURITY FIX v4.2] Production-safe error handler
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const isProduction = process.env.NODE_ENV === 'production';
    
    logger.error("Error:", { 
      status, 
      message: err.message,
      stack: err.stack,
      requestId: req.id,
      path: req.path,
      method: req.method,
    });
    
    const clientMessage = isProduction && status === 500 
      ? 'حدث خطأ في الخادم' 
      : err.message || 'Internal Server Error';
    
    res.status(status).json({
      error: clientMessage,
      code: err.code || 'INTERNAL_ERROR',
      requestId: req.id,
      ...(isProduction ? {} : { stack: err.stack })
    });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    logger.info(`LearnSnap server started on port ${port}`, { 
      environment: config.NODE_ENV,
      port 
    });
    
    // [SRE v3.5.0] Start memory watchdog with graceful shutdown
    memoryWatchdog.start();
    
    // [SRE v3.5.0] Start SLO monitoring (log every 5 minutes)
    if (process.env.NODE_ENV === 'production') {
      startSLOMonitoring(300000);
      startMonitorScheduler();
      startStatsScheduler();
      startCleanupScheduler();
    }
  });
})();

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  
  isShuttingDown = true;
  logger.info(`Received ${signal}, starting graceful shutdown`);
  
  // [SRE v3.5.0] Stop memory watchdog
  memoryWatchdog.stop();
  
  const shutdownTimeout = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
  
  shutdownTimeout.unref();
  
  await new Promise<void>((resolve) => {
    httpServer.close((err) => {
      if (err) {
        logger.error('Error closing HTTP server', { error: err.message });
      }
      resolve();
    });
  });
  
  // Close database connections
  await closeDatabase();
  
  clearTimeout(shutdownTimeout);
  logger.info('Graceful shutdown completed');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { message: error.message, stack: error.stack });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
});
