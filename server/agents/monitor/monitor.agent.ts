/**
 * LearnSnap Monitor Agent
 * Checks system health every 5 minutes
 * @version 1.0.0
 */

import { db } from "../../db";
import { sql } from "drizzle-orm";
import logger from "../../logger";

export async function runHealthCheck(): Promise<{ healthy: boolean; issues: string[] }> {
  const issues: string[] = [];

  // 1. Database check
  try {
    await db.execute(sql`SELECT 1`);
  } catch (error) {
    issues.push("Database لا يستجيب");
    logger.error("Monitor: Database check failed", { error: (error as Error).message });
  }

  // 2. Check errors in last hour
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM support_messages 
      WHERE category = 'error' 
      AND created_at > NOW() - INTERVAL '1 hour'
    `);
    const errorCount = Number((result.rows[0] as any)?.count || 0);
    if (errorCount > 10) {
      issues.push(`${errorCount} خطأ في آخر ساعة`);
    }
  } catch {
    // Ignore if table doesn't exist
  }

  // 3. Check failed payments in last hour
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM pending_payments 
      WHERE status = 'failed' 
      AND created_at > NOW() - INTERVAL '1 hour'
    `);
    const failedCount = Number((result.rows[0] as any)?.count || 0);
    if (failedCount > 0) {
      issues.push(`${failedCount} دفعة فاشلة في آخر ساعة`);
    }
  } catch {
    // Ignore
  }

  // 4. Check stuck payments (pending > 30 minutes)
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM pending_payments 
      WHERE status = 'pending' 
      AND created_at < NOW() - INTERVAL '30 minutes'
    `);
    const stuckCount = Number((result.rows[0] as any)?.count || 0);
    if (stuckCount > 0) {
      issues.push(`${stuckCount} دفعة معلقة أكثر من 30 دقيقة`);
    }
  } catch {
    // Ignore
  }

  return {
    healthy: issues.length === 0,
    issues
  };
}
