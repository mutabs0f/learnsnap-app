/**
 * Analytics endpoints (L6 Compliance - PostgreSQL Storage)
 * 
 * @version 3.4.0 - Replaced in-memory with durable PostgreSQL storage
 * 
 * Endpoints:
 * - POST /api/v1/analytics/events - Ingest analytics events
 * - GET /api/v1/analytics/events - Query events (admin only)
 */

import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "../db";
import { sql } from "drizzle-orm";
import logger from "../logger";
import { apiSuccess, apiError } from "../utils/helpers";
import rateLimit from "express-rate-limit";

const analyticsEventSchema = z.object({
  event: z.string().min(1).max(100),
  properties: z.record(z.unknown()).optional(),
  sessionId: z.string().optional(),
});

const eventsArraySchema = z.object({
  events: z.array(analyticsEventSchema).max(100),
});

const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: apiError("Rate limit exceeded", "RATE_LIMIT_EXCEEDED"),
  standardHeaders: true,
  legacyHeaders: false,
});

export function registerAnalyticsRoutes(app: Express): void {
  
  app.post("/api/v1/analytics/events", analyticsLimiter, async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string || randomUUID();
    
    const parseResult = eventsArraySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json(apiError(
        "Invalid events format",
        "VALIDATION_ERROR",
        parseResult.error.errors,
        requestId
      ));
    }
    
    const { events } = parseResult.data;
    const deviceId = req.headers['x-device-id'] as string || null;
    const userAgent = req.headers['user-agent'] || null;
    const ipAddress = req.ip || null;
    
    try {
      const insertPromises = events.map(event => 
        db.execute(sql`
          INSERT INTO analytics_events (event_type, properties, device_id, user_agent, ip_address, session_id)
          VALUES (${event.event}, ${JSON.stringify(event.properties || {})}, ${deviceId}, ${userAgent}, ${ipAddress}, ${event.sessionId || null})
        `)
      );
      
      await Promise.all(insertPromises);
      
      events.forEach(event => {
        if (["quiz_completed", "credits_purchased", "payment_completed"].includes(event.event)) {
          logger.info(`Analytics: ${event.event}`, { 
            deviceId: deviceId?.substring(0, 8) + '...',
            properties: event.properties 
          });
        }
      });
      
      return res.json(apiSuccess({ received: events.length }));
    } catch (error) {
      logger.error("Failed to store analytics events", { 
        error: (error as Error).message,
        requestId 
      });
      return res.status(500).json(apiError(
        "Failed to store events",
        "STORAGE_ERROR",
        undefined,
        requestId
      ));
    }
  });

  app.post("/api/analytics/events", analyticsLimiter, async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string || randomUUID();
    
    const parseResult = eventsArraySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json(apiError(
        "Invalid events format",
        "VALIDATION_ERROR",
        parseResult.error.errors,
        requestId
      ));
    }
    
    const { events } = parseResult.data;
    const deviceId = req.headers['x-device-id'] as string || null;
    const userAgent = req.headers['user-agent'] || null;
    const ipAddress = req.ip || null;
    
    try {
      const insertPromises = events.map(event => 
        db.execute(sql`
          INSERT INTO analytics_events (event_type, properties, device_id, user_agent, ip_address, session_id)
          VALUES (${event.event}, ${JSON.stringify(event.properties || {})}, ${deviceId}, ${userAgent}, ${ipAddress}, ${event.sessionId || null})
        `)
      );
      
      await Promise.all(insertPromises);
      
      return res.json(apiSuccess({ received: events.length }));
    } catch (error) {
      logger.error("Failed to store analytics events", { 
        error: (error as Error).message,
        requestId 
      });
      return res.status(500).json(apiError(
        "Failed to store events",
        "STORAGE_ERROR",
        undefined,
        requestId
      ));
    }
  });
}
