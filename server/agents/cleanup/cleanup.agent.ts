import { db } from "../../db";
import { sql } from "drizzle-orm";
import logger from "../../logger";

const DATA_RETENTION_DAYS = 30;

export interface CleanupResult {
  expiredSessions: number;
  expiredUserSessions: number;
  expiredTokens: number;
  expiredWebhooks: number;
  timestamp: string;
}

export async function runCleanup(): Promise<CleanupResult> {
  const result: CleanupResult = {
    expiredSessions: 0,
    expiredUserSessions: 0,
    expiredTokens: 0,
    expiredWebhooks: 0,
    timestamp: new Date().toISOString()
  };

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DATA_RETENTION_DAYS);
  const cutoff = cutoffDate.toISOString();

  try {
    const sessionsResult = await db.execute(sql`
      DELETE FROM quiz_sessions 
      WHERE expires_at < NOW() OR created_at < ${cutoff}
    `);
    result.expiredSessions = sessionsResult.rowCount || 0;
  } catch (error) {
    logger.warn("Cleanup: Failed to delete quiz_sessions", { error: (error as Error).message });
  }

  try {
    const userSessionsResult = await db.execute(sql`
      DELETE FROM user_sessions 
      WHERE expires_at < NOW()
    `);
    result.expiredUserSessions = userSessionsResult.rowCount || 0;
  } catch (error) {
    logger.warn("Cleanup: Failed to delete user_sessions", { error: (error as Error).message });
  }

  try {
    const tokensResult = await db.execute(sql`
      DELETE FROM verification_tokens 
      WHERE expires_at < NOW()
    `);
    result.expiredTokens = tokensResult.rowCount || 0;
  } catch (error) {
    logger.warn("Cleanup: Failed to delete verification_tokens", { error: (error as Error).message });
  }

  try {
    const webhooksResult = await db.execute(sql`
      DELETE FROM webhook_events 
      WHERE processed_at < ${cutoff}
    `);
    result.expiredWebhooks = webhooksResult.rowCount || 0;
  } catch (error) {
    logger.warn("Cleanup: Failed to delete webhook_events", { error: (error as Error).message });
  }

  logger.info("Cleanup completed", result);
  return result;
}
