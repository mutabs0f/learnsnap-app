-- ============================================================
-- LearnSnap Database Hardening Migration v3.5.3
-- Google L7 Compliance: Data Integrity & Performance
-- ============================================================
-- Run with: psql $DATABASE_URL -f server/migrations/001_database_hardening.sql
-- ============================================================

BEGIN;

-- ============================================================
-- 1. CHECK CONSTRAINTS for Status Fields
-- ============================================================

-- page_credits.status: must be 'active' or 'on_hold'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'page_credits_status_check'
  ) THEN
    ALTER TABLE page_credits 
      ADD CONSTRAINT page_credits_status_check 
      CHECK (status IN ('active', 'on_hold'));
    RAISE NOTICE 'Added page_credits_status_check constraint';
  END IF;
END $$;

-- quiz_sessions.status: must be valid status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quiz_sessions_status_check'
  ) THEN
    ALTER TABLE quiz_sessions 
      ADD CONSTRAINT quiz_sessions_status_check 
      CHECK (status IN ('processing', 'ready', 'completed', 'failed', 'expired'));
    RAISE NOTICE 'Added quiz_sessions_status_check constraint';
  END IF;
END $$;

-- pending_payments.status: must be valid status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pending_payments_status_check'
  ) THEN
    ALTER TABLE pending_payments 
      ADD CONSTRAINT pending_payments_status_check 
      CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'processing'));
    RAISE NOTICE 'Added pending_payments_status_check constraint';
  END IF;
END $$;

-- webhook_events.status: must be valid status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'webhook_events_status_check'
  ) THEN
    ALTER TABLE webhook_events 
      ADD CONSTRAINT webhook_events_status_check 
      CHECK (status IN ('processing', 'succeeded', 'failed'));
    RAISE NOTICE 'Added webhook_events_status_check constraint';
  END IF;
END $$;

-- question_reports.status: must be valid status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'question_reports_status_check'
  ) THEN
    ALTER TABLE question_reports 
      ADD CONSTRAINT question_reports_status_check 
      CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed'));
    RAISE NOTICE 'Added question_reports_status_check constraint';
  END IF;
END $$;

-- support_actions.status: must be valid status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_actions_status_check'
  ) THEN
    ALTER TABLE support_actions 
      ADD CONSTRAINT support_actions_status_check 
      CHECK (status IN ('APPLIED', 'FAILED', 'REJECTED'));
    RAISE NOTICE 'Added support_actions_status_check constraint';
  END IF;
END $$;

-- ============================================================
-- 2. CHECK CONSTRAINTS for Numeric Fields
-- ============================================================

-- transactions.amount must be positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_amount_positive'
  ) THEN
    ALTER TABLE transactions 
      ADD CONSTRAINT transactions_amount_positive 
      CHECK (amount >= 0);
    RAISE NOTICE 'Added transactions_amount_positive constraint';
  END IF;
END $$;

-- page_credits.pages_remaining must be non-negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'page_credits_pages_nonnegative'
  ) THEN
    ALTER TABLE page_credits 
      ADD CONSTRAINT page_credits_pages_nonnegative 
      CHECK (pages_remaining >= 0);
    RAISE NOTICE 'Added page_credits_pages_nonnegative constraint';
  END IF;
END $$;

-- ============================================================
-- 3. UNIQUE INDEXES for Idempotency
-- ============================================================

-- Unique index on transactions.payment_id (for payment idempotency)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_payment_id_unique 
  ON transactions(stripe_payment_id) 
  WHERE stripe_payment_id IS NOT NULL;

-- Unique index on pending_payments.transaction_no (for webhook idempotency)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_payments_transaction_no_unique 
  ON pending_payments(transaction_no);

-- Composite index for credit_transactions idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_idempotent 
  ON credit_transactions(device_id, transaction_type, COALESCE(user_id, ''));

-- ============================================================
-- 4. PERFORMANCE INDEXES for Common Queries
-- ============================================================

-- Transactions by device with date ordering
CREATE INDEX IF NOT EXISTS idx_transactions_device_created 
  ON transactions(device_id, created_at DESC);

-- Quiz sessions by creation date (for admin stats)
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_created_desc 
  ON quiz_sessions(created_at DESC);

-- Users by creation date (for admin stats)
CREATE INDEX IF NOT EXISTS idx_users_created_desc 
  ON users(created_at DESC);

-- Page credits by updated_at (for sync queries)
CREATE INDEX IF NOT EXISTS idx_page_credits_updated 
  ON page_credits(updated_at DESC);

-- Credit transactions lookup
CREATE INDEX IF NOT EXISTS idx_credit_transactions_device 
  ON credit_transactions(device_id, created_at DESC);

-- ============================================================
-- 5. FOREIGN KEY CONSTRAINTS
-- ============================================================

-- email_verification_tokens -> users (already in schema, verify exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_verification_tokens_user_id_fkey'
  ) THEN
    ALTER TABLE email_verification_tokens 
      ADD CONSTRAINT email_verification_tokens_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added email_verification_tokens FK';
  END IF;
END $$;

-- user_sessions -> users (already in schema, verify exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_user_id_fkey'
  ) THEN
    ALTER TABLE user_sessions 
      ADD CONSTRAINT user_sessions_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added user_sessions FK';
  END IF;
END $$;

-- page_credits -> users (soft FK with SET NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'page_credits_user_id_fkey'
  ) THEN
    ALTER TABLE page_credits 
      ADD CONSTRAINT page_credits_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added page_credits FK';
  END IF;
END $$;

-- ============================================================
-- 6. AUTO-UPDATE updated_at TRIGGER
-- ============================================================

-- Create trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to users table
DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add trigger to page_credits table  
DROP TRIGGER IF EXISTS page_credits_updated_at ON page_credits;
CREATE TRIGGER page_credits_updated_at
  BEFORE UPDATE ON page_credits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 7. REGISTRATION BONUS TRACKING COLUMN
-- ============================================================

-- Add registration_bonus_granted to prevent double grants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'page_credits' AND column_name = 'registration_bonus_granted'
  ) THEN
    ALTER TABLE page_credits ADD COLUMN registration_bonus_granted BOOLEAN DEFAULT FALSE;
    RAISE NOTICE 'Added registration_bonus_granted column';
  END IF;
END $$;

-- ============================================================
-- 8. ANALYTICS EVENTS TABLE (for durable analytics)
-- ============================================================

CREATE TABLE IF NOT EXISTS analytics_events (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  event_type VARCHAR(50) NOT NULL,
  device_id VARCHAR(255),
  user_id VARCHAR(255),
  session_id VARCHAR(255),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_device ON analytics_events(device_id) WHERE device_id IS NOT NULL;

-- ============================================================
-- 9. ADMIN TOKENS TABLE (for JWT-based admin auth)
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_tokens (
  id SERIAL PRIMARY KEY,
  admin_id VARCHAR(64) NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  last_used_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_tokens_admin ON admin_tokens(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_tokens_expires ON admin_tokens(expires_at);

-- Add CHECK constraint for admin roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_tokens_role_check'
  ) THEN
    ALTER TABLE admin_tokens 
      ADD CONSTRAINT admin_tokens_role_check 
      CHECK (role IN ('super_admin', 'admin', 'support'));
    RAISE NOTICE 'Added admin_tokens_role_check constraint';
  END IF;
END $$;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Show all constraints
SELECT 
  conname as constraint_name,
  conrelid::regclass as table_name,
  contype as type
FROM pg_constraint 
WHERE conname LIKE '%_check' 
   OR conname LIKE '%_fkey'
ORDER BY table_name, constraint_name;

-- Show all indexes
SELECT 
  indexname,
  tablename,
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

COMMIT;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================
DO $$ BEGIN RAISE NOTICE '✅ Database hardening migration completed successfully'; END $$;
