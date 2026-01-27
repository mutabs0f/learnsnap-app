import { db } from "./db";
import { sql } from "drizzle-orm";
import logger from "./logger";
import { maskId, sanitizeMetadata } from "./utils/helpers";

export type AuditAction =
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAIL'
  | 'AUTH_REGISTER'
  | 'AUTH_LOGOUT'
  | 'GOOGLE_OAUTH_CALLBACK_SUCCESS'
  | 'GOOGLE_OAUTH_CALLBACK_FAIL'
  | 'PAYMENT_CREATE'
  | 'PAYMENT_VERIFY'
  | 'WEBHOOK_RECEIVED'
  | 'WEBHOOK_REJECTED'
  | 'CREDITS_CONSUMED'
  | 'CREDITS_ADDED'
  | 'ADMIN_ACCESS'
  | 'ADMIN_SESSION_CREATE'
  | 'ADMIN_LOGIN_FAILED'
  | 'ADMIN_ACCESS_DENIED'
  | 'QUIZ_CREATE'
  | 'QUOTA_EXCEEDED';

export type ActorType = 'user' | 'device' | 'admin' | 'system';

export interface AuditLogEntry {
  actorType: ActorType;
  actorId: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export async function auditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const maskedActorId = maskId(entry.actorId);
    const maskedTargetId = maskId(entry.targetId);
    const sanitizedMetadata = sanitizeMetadata(entry.metadata);
    
    await db.execute(
      sql`INSERT INTO audit_logs (
        actor_type, actor_id, action, target_type, target_id, 
        ip, user_agent, metadata_json, created_at
      ) VALUES (
        ${entry.actorType},
        ${maskedActorId},
        ${entry.action},
        ${entry.targetType || null},
        ${maskedTargetId},
        ${entry.ip || null},
        ${entry.userAgent?.substring(0, 255) || null},
        ${JSON.stringify(sanitizedMetadata)},
        NOW()
      )`
    );
    
    logger.debug("Audit log recorded", { 
      action: entry.action, 
      actorType: entry.actorType,
      actorId: maskedActorId,
    });
  } catch (error) {
    logger.warn("Failed to write audit log", { 
      action: entry.action, 
      error: (error as Error).message 
    });
  }
}

export async function initAuditLogsTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        actor_type VARCHAR(20) NOT NULL,
        actor_id VARCHAR(64) NOT NULL,
        action VARCHAR(50) NOT NULL,
        target_type VARCHAR(50),
        target_id VARCHAR(64),
        ip VARCHAR(45),
        user_agent VARCHAR(255),
        metadata_json JSONB DEFAULT '{}'
      )
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_type, actor_id)
    `);
    
    logger.info("Audit logs table created/verified");
  } catch (error) {
    logger.warn("Could not create audit_logs table", { error: (error as Error).message });
  }
}

export async function initQuotaCountersTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS quota_counters (
        id SERIAL PRIMARY KEY,
        key VARCHAR(128) NOT NULL,
        day DATE NOT NULL DEFAULT CURRENT_DATE,
        count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(key, day)
      )
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_quota_counters_key_day ON quota_counters(key, day)
    `);
    
    logger.info("Quota counters table created/verified");
  } catch (error) {
    logger.warn("Could not create quota_counters table", { error: (error as Error).message });
  }
}

export async function checkAndIncrementQuota(
  key: string, 
  dailyLimit: number
): Promise<{ allowed: boolean; currentCount: number }> {
  try {
    // [FIX] Use full key for storage - masking is only for audit logs, not enforcement
    // This ensures per-device quotas don't collide due to shared prefixes
    const result = await db.execute(sql`
      INSERT INTO quota_counters (key, day, count, updated_at)
      VALUES (${key}, CURRENT_DATE, 1, NOW())
      ON CONFLICT (key, day) 
      DO UPDATE SET 
        count = quota_counters.count + 1,
        updated_at = NOW()
      RETURNING count
    `);
    
    const currentCount = (result.rows[0] as any)?.count || 1;
    const allowed = currentCount <= dailyLimit;
    
    if (!allowed) {
      // Mask key only in audit log output, not in enforcement
      await auditLog({
        actorType: 'device',
        actorId: key, // maskSensitiveId will be applied in auditLog
        action: 'QUOTA_EXCEEDED',
        metadata: { dailyLimit, currentCount },
      });
    }
    
    return { allowed, currentCount };
  } catch (error) {
    // [FIX] Mask key in log for privacy, but quota was already using full key
    logger.warn("Quota check failed, allowing request", { 
      key: maskId(key), 
      error: (error as Error).message 
    });
    return { allowed: true, currentCount: 0 };
  }
}

export async function getQuotaCount(key: string): Promise<number> {
  try {
    const result = await db.execute(sql`
      SELECT count FROM quota_counters 
      WHERE key = ${key} AND day = CURRENT_DATE
    `);
    return (result.rows[0] as any)?.count || 0;
  } catch {
    return 0;
  }
}
