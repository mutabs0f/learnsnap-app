import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { randomUUID } from "crypto";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import logger from "./logger";
import { config } from "./config";
import { closeDatabase, initDatabase } from "./db";
import "./types";
import * as Sentry from "@sentry/node";

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

// [FIX #1] Require token secret in production for device authentication
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
  hasPayment: !!process.env.LEMONSQUEEZY_API_KEY,
  hasEmail: !!process.env.RESEND_API_KEY,
  frontendUrl: process.env.FRONTEND_URL || "not-set",
});

const app = express();
const httpServer = createServer(app);
let isShuttingDown = false;

// Sentry request handler - MUST be first middleware
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

// Cookie parser
app.use(cookieParser());

// Request ID for tracing (v2.7.0)
app.use((req, res, next) => {
  req.id = randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Raw body for webhook signature verification (must be before express.json)
app.use('/api/webhooks', express.raw({ type: 'application/json' }));

// [IMPROVEMENT 2] Larger payload limit for quiz creation (up to 20 images @ 4MB each = 80MB)
app.use('/api/quiz/create', express.json({ limit: '80mb' }));

// Body parsers for other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));

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

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path.startsWith("/api")) {
      logger.info(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});

(async () => {
  // Initialize database tables
  await initDatabase();
  
  await registerRoutes(httpServer, app);

  // Sentry error handler - MUST be before custom error handler
  if (process.env.SENTRY_DSN) {
    app.use(Sentry.Handlers.errorHandler());
  }

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    logger.error("Error:", { 
      status, 
      message, 
      stack: err.stack,
      requestId: req.id,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent']
    });
    
    res.status(status).json({ 
      message,
      requestId: req.id
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
  });
})();

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  
  isShuttingDown = true;
  logger.info(`Received ${signal}, starting graceful shutdown`);
  
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
