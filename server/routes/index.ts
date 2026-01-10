/**
 * Routes Index - Main entry point for all routes
 * 
 * This file coordinates the registration of all route modules.
 * Extracted from the monolithic routes.ts for better maintainability.
 * 
 * @version 3.2.1
 */

import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { storage } from "../storage";
import logger from "../logger";
import { apiVersionMiddleware, checkDeprecatedVersion } from "../api-versioning";
import { createCsrfProtection, csrfErrorHandler, generateToken } from "../security";
import { registerAuthRoutes } from "../auth-routes";
import paylinkRoutes from "../paylink-routes";
import supportRoutes from "../support-routes";

import { sanitizeInput } from "./shared";
import { registerHealthRoutes } from "./health.routes";
import { registerCreditsRoutes } from "./credits.routes";
import { registerQuizRoutes } from "./quiz.routes";
import { registerAdminRoutes } from "./admin.routes";
import { registerAnalyticsRoutes } from "./analytics.routes";

export async function registerRoutes(httpServer: Server, app: Express): Promise<void> {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).id = randomUUID();
    next();
  });

  app.use('/api', apiVersionMiddleware);
  app.use('/api', checkDeprecatedVersion);

  app.use('/api', (req: Request, _res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeInput(req.body);
    }
    next();
  });

  const csrfProtection = createCsrfProtection();
  
  app.get('/api/csrf-token', (req: Request, res: Response) => {
    const token = generateToken(req, res);
    res.json({ csrfToken: token });
  });
  
  app.use('/api/quiz/create', csrfProtection);
  app.use('/api/billing', csrfProtection);
  
  app.use(csrfErrorHandler);

  registerAuthRoutes(app);
  
  app.use("/api", paylinkRoutes);
  
  app.use("/api/admin/support", supportRoutes);

  registerHealthRoutes(app);
  registerCreditsRoutes(app);
  registerQuizRoutes(app);
  registerAdminRoutes(app);
  registerAnalyticsRoutes(app);
  
  logger.info("All routes registered successfully (v3.2.1 modular)");
}

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
  }, 60 * 60 * 1000);
}

export async function downloadZipRoute(app: any) {
  app.get("/download-zip", (_req: any, res: any) => {
    const filePath = path.resolve(process.cwd(), "LearnSnap_v3.2.1_20260110.zip");
    if (fs.existsSync(filePath)) {
      res.download(filePath, "LearnSnap_v3.2.1_20260110.zip");
    } else {
      res.status(404).send("File not found");
    }
  });
}
