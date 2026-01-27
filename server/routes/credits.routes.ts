/**
 * Credits management endpoints
 * Extracted from routes.ts
 * 
 * Endpoints:
 * - GET /api/credits/:deviceId
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import logger from "../logger";
import { getDeviceTokenSecret } from "../env-helpers";
import { verifyDeviceToken } from "../paylink-routes";
import { sendError, isProduction } from "./shared";

export function registerCreditsRoutes(app: Express): void {
  app.get("/api/credits/:deviceId", async (req: Request, res: Response) => {
    const tokenSecret = getDeviceTokenSecret();
    const isProd = process.env.NODE_ENV === 'production';
    const devBypass = !isProd && process.env.ENABLE_DEV_DEVICE_BYPASS === 'true';
    
    try {
      const deviceId = req.params.deviceId;
      
      if (!deviceId || deviceId.length > 100) {
        return res.status(400).json({
          error: "معرف الجهاز غير صحيح",
          code: "INVALID_DEVICE_ID",
        });
      }

      if (isProduction && !tokenSecret) {
        logger.error("CRITICAL: No token secret configured in production");
        return res.status(500).json({ error: "Server configuration error", code: "CONFIG_ERROR" });
      }
      
      if (tokenSecret && !devBypass) {
        const token = req.cookies?.device_token || req.headers["x-device-token"];
        if (!token) {
          return res.status(401).json({ error: "معرف الجهاز غير صالح", code: "MISSING_DEVICE_TOKEN" });
        }
        if (!verifyDeviceToken(deviceId, token as string, tokenSecret)) {
          return res.status(401).json({ error: "معرف الجهاز غير صالح", code: "INVALID_DEVICE_TOKEN" });
        }
      }

      // [FIX v3.6.3] Check BOTH session cookie AND Bearer token
      // Session cookie name matches auth-routes.ts
      const SESSION_COOKIE_NAME = process.env.NODE_ENV === 'production' ? '__Host-session' : 'session_token';
      
      let userId: string | null = null;
      
      // [Priority 1] Check session cookie first (Google OAuth / session-based login)
      const sessionCookie = req.cookies?.[SESSION_COOKIE_NAME];
      if (sessionCookie) {
        try {
          const session = await storage.getUserSession(sessionCookie);
          if (session && new Date(session.expiresAt) > new Date()) {
            userId = session.userId;
            logger.info("[Credits] User authenticated via session cookie", {
              userId: userId.substring(0, 8),
              deviceId: deviceId.substring(0, 8),
            });
          }
        } catch (e) {
          logger.warn("[Credits] Error checking session cookie", { error: (e as Error).message });
        }
      }
      
      // [Priority 2] Check Bearer token if no session cookie
      if (!userId) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          const sessionToken = authHeader.substring(7);
          try {
            const session = await storage.getUserSession(sessionToken);
            if (!session) {
              logger.warn("Credits request with invalid session token", {
                deviceId: deviceId.substring(0, 8),
                hasAuthHeader: true,
              });
              // Don't return error - just treat as guest
            } else if (new Date(session.expiresAt) < new Date()) {
              await storage.deleteUserSession(sessionToken);
              logger.warn("Credits request with expired session token", {
                deviceId: deviceId.substring(0, 8),
                userId: session.userId.substring(0, 8),
              });
              // Don't return error - just treat as guest
            } else {
              userId = session.userId;
            }
          } catch (e) {
            logger.error("Session validation error", { error: (e as Error).message });
            // Don't return error - just treat as guest
          }
        }
      }
      
      let credits = await (storage as any).getCreditsForOwner(deviceId, userId);
      
      if (!credits) {
        if (userId) {
          const userOwnerId = `user_${userId}`;
          credits = await storage.createOrUpdatePageCredits(userOwnerId, 0);
        } else {
          credits = await storage.initializeDeviceCredits(deviceId);
        }
      }
      
      logger.info(`[credits v2.9.16] Returning credits`, {
        deviceId: deviceId.substring(0, 8),
        userId: userId?.substring(0, 8) || 'guest',
        ownerId: userId ? `user_${userId.substring(0,8)}...` : deviceId.substring(0, 8),
        pagesRemaining: credits?.pagesRemaining || 0,
      });

      res.json({ 
        pagesRemaining: credits?.pagesRemaining || 0,
        isEarlyAdopter: (credits as any)?.isEarlyAdopter || false,
        status: (credits as any)?.status || 'active'
      });
    } catch (error) {
      sendError(res, error as Error);
    }
  });
}
