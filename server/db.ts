import { neon, Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleServerless } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "../shared/schema.js";
import logger from "./logger.js";

/**
 * [SECURITY FIX] Sanitize database URL for logging - extracts only the host
 * NEVER logs user, password, or query parameters
 */
function sanitizeDbUrl(url: string | undefined): string {
  if (!url) return "unknown";
  try {
    // Extract host only (after @ and before / or :port)
    const match = url.match(/@([^/:]+)/);
    return match ? `host=${match[1]}` : "host=unknown";
  } catch {
    return "host=unknown";
  }
}

// Support both NEON_DATABASE_URL (external) and DATABASE_URL (Replit)
let databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
const urlSource = process.env.NEON_DATABASE_URL ? "NEON_DATABASE_URL" : "DATABASE_URL";

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL or NEON_DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Clean up database URL if it has psql prefix or quotes (common copy-paste issue)
// Handles formats like: psql 'postgresql://...' or "postgresql://..." or 'postgresql://...'
if (databaseUrl.startsWith("psql ")) {
  databaseUrl = databaseUrl.replace(/^psql\s+/, "");
}
// Remove surrounding quotes (single or double)
databaseUrl = databaseUrl.replace(/^['"]|['"]$/g, "");

// Validate URL format - [SECURITY] Never log URL content, only format type
if (!databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) {
  throw new Error(
    `Invalid database URL format. Expected URL starting with postgresql:// or postgres://`,
  );
}

// [SECURITY FIX] Log only source name and sanitized host - never expose credentials
logger.info(`Using database from ${urlSource}`, { 
  urlPrefix: sanitizeDbUrl(databaseUrl) 
});

// Detect if we're in a serverless/edge environment (Vercel)
const isServerless = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME;

let db: ReturnType<typeof drizzleHttp> | ReturnType<typeof drizzleServerless>;
let pool: Pool | null = null;

if (isServerless) {
  // Use HTTP driver for Vercel serverless
  const sql = neon(databaseUrl);
  db = drizzleHttp(sql, { schema });
  logger.info("Database initialized with HTTP driver (serverless mode)");
} else {
  // Use WebSocket driver for local development with connection pooling
  neonConfig.webSocketConstructor = ws;
  
  pool = new Pool({
    connectionString: databaseUrl,
    max: 20, // Maximum 20 connections in pool
    idleTimeoutMillis: 30000, // Close idle connections after 30s
    connectionTimeoutMillis: 5000, // Timeout if can't connect in 5s
  });
  
  // Handle pool errors
  pool.on('error', (err: Error) => {
    logger.error('Unexpected database pool error', { error: err.message });
  });
  
  pool.on('connect', () => {
    logger.debug('New database connection established');
  });
  
  db = drizzleServerless(pool, { schema });
  logger.info("Database initialized with WebSocket driver (pooled mode)", {
    maxConnections: 20,
    idleTimeout: "30s",
  });
}

// Create tables if they don't exist, and migrate existing tables
export async function initDatabase(): Promise<void> {
  try {
    logger.info("🔧 Starting database initialization...");
    
    // Test connection first
    try {
      await db.execute(`SELECT 1 as test`);
      logger.info("✅ Database connection successful");
    } catch (connError: any) {
      // [SECURITY FIX] Never log database URL - only log host and error code
      logger.error("❌ Database connection FAILED", {
        error: connError.message,
        code: connError.code,
        dbHost: sanitizeDbUrl(databaseUrl),
        env: process.env.NODE_ENV,
      });
      throw connError;
    }
    
    // Create users table
    logger.info("Creating users table if not exists...");
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        name TEXT,
        google_id TEXT UNIQUE,
        avatar_url TEXT,
        email_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info("✅ Users table created/verified");
    
    // Verify table exists and check columns
    const tableCheck = await db.execute(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    logger.info("📋 Current users table schema:", {
      columns: (tableCheck.rows as any[]).map((row: any) => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable,
      })),
    });
    
    // Migrate existing users table - add missing columns and fix old schema
    logger.info("Adding missing columns to users table...");
    
    // CRITICAL FIX: Make old 'password' column nullable if it exists (old schema conflict)
    try {
      await db.execute(`ALTER TABLE users ALTER COLUMN password DROP NOT NULL`);
      logger.info("✅ Made 'password' column nullable (fixing old schema)");
    } catch (e: any) {
      // Column doesn't exist or already nullable - that's fine
      logger.info("Password column fix not needed or already applied");
    }
    
    // Also make 'full_name' nullable if it exists (old schema)
    try {
      await db.execute(`ALTER TABLE users ALTER COLUMN full_name DROP NOT NULL`);
      logger.info("✅ Made 'full_name' column nullable (fixing old schema)");
    } catch (e: any) {
      logger.info("Full_name column fix not needed or already applied");
    }
    
    const alterCommands = [
      { sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`, name: 'password_hash' },
      { sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT`, name: 'google_id' },
      { sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`, name: 'avatar_url' },
      { sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE`, name: 'email_verified' },
      { sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT`, name: 'name' },
      { sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`, name: 'updated_at' },
    ];
    
    for (const cmd of alterCommands) {
      try {
        await db.execute(cmd.sql);
        logger.info(`✅ Column '${cmd.name}' verified/added`);
      } catch (alterError: any) {
        logger.error(`❌ Failed to add column '${cmd.name}'`, {
          error: alterError.message,
          code: alterError.code,
        });
      }
    }
    
    // Add unique constraint to google_id if it doesn't exist
    try {
      await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_idx ON users(google_id) WHERE google_id IS NOT NULL`);
      logger.info("✅ Google ID unique index verified");
    } catch (indexError: any) {
      logger.warn("Could not create google_id index", { error: indexError.message });
    }
    
    // Create email_verification_tokens table
    logger.info("Creating email_verification_tokens table...");
    await db.execute(`
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(36) NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info("✅ Email verification tokens table created/verified");
    
    // Create user_sessions table
    logger.info("Creating user_sessions table...");
    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(36) NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info("✅ User sessions table created/verified");
    
    // Add userId column to page_credits for linking devices to users
    try {
      await db.execute(`ALTER TABLE page_credits ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)`);
      logger.info("✅ Added user_id column to page_credits");
    } catch (e: any) {
      logger.info("user_id column in page_credits already exists or not needed");
    }
    
    // Add is_early_adopter and status columns to page_credits
    try {
      await db.execute(`ALTER TABLE page_credits ADD COLUMN IF NOT EXISTS is_early_adopter BOOLEAN DEFAULT FALSE`);
      logger.info("✅ Added is_early_adopter column to page_credits");
    } catch (e: any) {
      logger.info("is_early_adopter column already exists or error: " + e.message);
    }
    
    try {
      await db.execute(`ALTER TABLE page_credits ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`);
      logger.info("✅ Added status column to page_credits");
    } catch (e: any) {
      logger.info("status column already exists or error: " + e.message);
    }
    
    // [IMPROVEMENT 1] Create webhook_events table with status column for proper idempotency
    logger.info("Creating webhook_events table...");
    await db.execute(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        status TEXT DEFAULT 'processing',
        processed BOOLEAN DEFAULT TRUE,
        data JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info("✅ Webhook events table created/verified");
    
    // Add status column if it doesn't exist (migration for existing tables)
    try {
      await db.execute(`ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'processing'`);
      logger.info("✅ Added status column to webhook_events");
    } catch (e: any) {
      logger.info("status column in webhook_events already exists or error: " + e.message);
    }
    
    // Create pending_payments table for Paylink invoice tracking (v2.9.0)
    logger.info("Creating pending_payments table...");
    await db.execute(`
      CREATE TABLE IF NOT EXISTS pending_payments (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number TEXT NOT NULL UNIQUE,
        transaction_no TEXT NOT NULL,
        device_id TEXT NOT NULL,
        pages INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '24 hours'
      )
    `);
    logger.info("✅ Pending payments table created/verified");
    
    // Create question_reports table (v2.9.5)
    logger.info("Creating question_reports table...");
    await db.execute(`
      CREATE TABLE IF NOT EXISTS question_reports (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        question_index INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        report_reason VARCHAR(50) NOT NULL,
        report_details TEXT,
        device_id VARCHAR(255),
        user_id VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending',
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        reviewed_at TIMESTAMP
      )
    `);
    logger.info("✅ Question reports table created/verified");
    
    // Create indexes for question_reports
    try {
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_question_reports_status ON question_reports(status)`);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_question_reports_created_at ON question_reports(created_at DESC)`);
      logger.info("✅ Question reports indexes created/verified");
    } catch (e: any) {
      logger.info("Question reports indexes already exist or error: " + e.message);
    }
    
    // Final verification - test a simple insert/delete to verify schema works
    try {
      const testEmail = `test-${Date.now()}@railway-init-test.com`;
      logger.info("Testing user insert with test email...");
      
      await db.execute(`
        INSERT INTO users (email, password_hash, name, email_verified)
        VALUES ('${testEmail}', 'test-hash', 'Test User', false)
      `);
      
      logger.info("✅ Test insert successful");
      
      // Clean up test user
      await db.execute(`DELETE FROM users WHERE email = '${testEmail}'`);
      logger.info("✅ Test user cleaned up");
    } catch (testError: any) {
      logger.error("❌ Test insert FAILED - This explains registration failures!", {
        error: testError.message,
        code: testError.code,
        detail: testError.detail,
        constraint: testError.constraint,
      });
    }
    
    // ════════════════════════════════════════════════════════════
    // PERFORMANCE INDEXES - Added in v2.7.0 for query optimization
    // ════════════════════════════════════════════════════════════
    logger.info("Creating performance indexes...");
    
    const indexes = [
      {
        name: 'quiz_sessions_device_id_idx',
        sql: 'CREATE INDEX IF NOT EXISTS quiz_sessions_device_id_idx ON quiz_sessions(device_id)'
      },
      {
        name: 'quiz_sessions_status_idx',
        sql: 'CREATE INDEX IF NOT EXISTS quiz_sessions_status_idx ON quiz_sessions(status)'
      },
      {
        name: 'quiz_sessions_expires_at_idx',
        sql: 'CREATE INDEX IF NOT EXISTS quiz_sessions_expires_at_idx ON quiz_sessions(expires_at)'
      },
      {
        name: 'quiz_sessions_created_at_idx',
        sql: 'CREATE INDEX IF NOT EXISTS quiz_sessions_created_at_idx ON quiz_sessions(created_at DESC)'
      },
      {
        name: 'transactions_device_id_idx',
        sql: 'CREATE INDEX IF NOT EXISTS transactions_device_id_idx ON transactions(device_id)'
      },
      {
        name: 'transactions_created_at_idx',
        sql: 'CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON transactions(created_at DESC)'
      },
      {
        name: 'page_credits_device_id_idx',
        sql: 'CREATE INDEX IF NOT EXISTS page_credits_device_id_idx ON page_credits(device_id)'
      },
      {
        name: 'page_credits_user_id_idx',
        sql: 'CREATE INDEX IF NOT EXISTS page_credits_user_id_idx ON page_credits(user_id) WHERE user_id IS NOT NULL'
      },
      {
        name: 'email_verification_tokens_expires_at_idx',
        sql: 'CREATE INDEX IF NOT EXISTS email_verification_tokens_expires_at_idx ON email_verification_tokens(expires_at)'
      },
      {
        name: 'user_sessions_expires_at_idx',
        sql: 'CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx ON user_sessions(expires_at)'
      },
      {
        name: 'user_sessions_user_id_idx',
        sql: 'CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions(user_id)'
      }
    ];
    
    for (const index of indexes) {
      try {
        await db.execute(index.sql);
        logger.info(`✅ Index '${index.name}' created/verified`);
      } catch (indexError: any) {
        logger.warn(`Could not create index '${index.name}'`, { error: indexError.message });
      }
    }
    
    logger.info("✅ Performance indexes setup completed");
    
    // [ENTERPRISE v3.0] Create audit_logs table for enterprise logging
    logger.info("Creating audit_logs table...");
    try {
      await db.execute(`
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
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_type, actor_id)`);
      logger.info("✅ Audit logs table created/verified");
    } catch (auditError: any) {
      logger.warn("Could not create audit_logs table", { error: auditError.message });
    }
    
    // [ENTERPRISE v3.0] Create quota_counters table for abuse controls
    logger.info("Creating quota_counters table...");
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS quota_counters (
          id SERIAL PRIMARY KEY,
          key VARCHAR(128) NOT NULL,
          day DATE NOT NULL DEFAULT CURRENT_DATE,
          count INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE(key, day)
        )
      `);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_quota_counters_key_day ON quota_counters(key, day)`);
      logger.info("✅ Quota counters table created/verified");
    } catch (quotaError: any) {
      logger.warn("Could not create quota_counters table", { error: quotaError.message });
    }
    
    // [v4.0.0] Create support_tickets table for customer support escalations
    logger.info("Creating support_tickets table...");
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS support_tickets (
          id SERIAL PRIMARY KEY,
          session_id VARCHAR(255),
          device_id VARCHAR(255),
          user_id VARCHAR(255),
          customer_name TEXT NOT NULL,
          customer_email TEXT NOT NULL,
          customer_phone TEXT,
          issue_summary TEXT NOT NULL,
          conversation_history JSONB DEFAULT '[]',
          category VARCHAR(50) DEFAULT 'general',
          status VARCHAR(20) DEFAULT 'open',
          priority VARCHAR(20) DEFAULT 'normal',
          admin_notes TEXT,
          assigned_to VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          resolved_at TIMESTAMP
        )
      `);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)`);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC)`);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_support_tickets_email ON support_tickets(customer_email)`);
      logger.info("✅ Support tickets table created/verified");
    } catch (ticketError: any) {
      logger.warn("Could not create support_tickets table", { error: ticketError.message });
    }
    
    logger.info("✅ Database initialization completed successfully");
  } catch (error: any) {
    logger.error("❌ Critical error initializing database", { 
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
    throw error;
  }
}

// Graceful shutdown helper (called from index.ts)
export async function closeDatabase(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
      logger.info("Database pool closed");
    } catch (error) {
      logger.error("Error closing database pool", { error: (error as Error).message });
    }
  }
}

export { db, pool };
