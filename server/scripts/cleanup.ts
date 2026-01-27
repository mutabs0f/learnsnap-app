#!/usr/bin/env tsx
import { db } from "../db";
import { sql } from "drizzle-orm";

const DATA_RETENTION_DAYS = parseInt(process.env.DATA_RETENTION_DAYS || '90', 10);

async function cleanup() {
  console.log(`Starting data cleanup (retention: ${DATA_RETENTION_DAYS} days)...`);
  
  try {
    // 1. Delete expired quiz sessions
    const expiredSessions = await db.execute(sql`
      DELETE FROM quiz_sessions 
      WHERE expires_at < NOW() 
      OR created_at < NOW() - INTERVAL '${sql.raw(String(DATA_RETENTION_DAYS))} days'
      RETURNING id
    `);
    console.log(`Deleted ${expiredSessions.rowCount || 0} expired quiz sessions`);
    
    // 2. Delete expired user sessions
    const expiredUserSessions = await db.execute(sql`
      DELETE FROM user_sessions 
      WHERE expires_at < NOW()
      RETURNING id
    `);
    console.log(`Deleted ${expiredUserSessions.rowCount || 0} expired user sessions`);
    
    // 3. Delete expired email verification tokens
    const expiredTokens = await db.execute(sql`
      DELETE FROM email_verification_tokens 
      WHERE expires_at < NOW()
      RETURNING id
    `);
    console.log(`Deleted ${expiredTokens.rowCount || 0} expired verification tokens`);
    
    // 4. Delete old audit logs (keep last 90 days)
    const oldAuditLogs = await db.execute(sql`
      DELETE FROM audit_logs 
      WHERE created_at < NOW() - INTERVAL '${sql.raw(String(DATA_RETENTION_DAYS))} days'
      RETURNING id
    `);
    console.log(`Deleted ${oldAuditLogs.rowCount || 0} old audit logs`);
    
    // 5. Delete old quota counters (keep last 7 days)
    const oldQuotaCounters = await db.execute(sql`
      DELETE FROM quota_counters 
      WHERE day < CURRENT_DATE - INTERVAL '7 days'
      RETURNING id
    `);
    console.log(`Deleted ${oldQuotaCounters.rowCount || 0} old quota counters`);
    
    // 6. Delete completed pending payments older than 30 days
    const oldPendingPayments = await db.execute(sql`
      DELETE FROM pending_payments 
      WHERE created_at < NOW() - INTERVAL '30 days' 
      AND status != 'pending'
      RETURNING id
    `);
    console.log(`Deleted ${oldPendingPayments.rowCount || 0} old completed payments`);
    
    // 7. Delete old webhook events (keep last 30 days)
    const oldWebhooks = await db.execute(sql`
      DELETE FROM webhook_events 
      WHERE created_at < NOW() - INTERVAL '30 days'
      RETURNING id
    `);
    console.log(`Deleted ${oldWebhooks.rowCount || 0} old webhook events`);
    
    console.log("Cleanup completed successfully!");
    
  } catch (error) {
    console.error("Cleanup failed:", (error as Error).message);
    process.exit(1);
  }
  
  process.exit(0);
}

cleanup();
