-- LearnSnap Database Migration v3.0
-- This script adds missing indexes and constraints for production reliability
-- Run this in Neon SQL Editor to apply fixes

-- ============================================
-- 1. Add unique constraint on page_credits.device_id (if not exists)
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'page_credits_device_id_unique'
    ) THEN
        -- First, remove duplicates (keep the one with most pages_remaining)
        DELETE FROM page_credits a
        USING page_credits b
        WHERE a.device_id = b.device_id 
        AND a.id < b.id;
        
        -- Then add unique constraint
        ALTER TABLE page_credits ADD CONSTRAINT page_credits_device_id_unique UNIQUE (device_id);
        RAISE NOTICE 'Added unique constraint on page_credits.device_id';
    ELSE
        RAISE NOTICE 'Unique constraint on page_credits.device_id already exists';
    END IF;
END $$;

-- ============================================
-- 2. Add unique constraint on pending_payments.order_number (if not exists)
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'pending_payments_order_number_unique'
    ) THEN
        ALTER TABLE pending_payments ADD CONSTRAINT pending_payments_order_number_unique UNIQUE (order_number);
        RAISE NOTICE 'Added unique constraint on pending_payments.order_number';
    ELSE
        RAISE NOTICE 'Unique constraint on pending_payments.order_number already exists';
    END IF;
END $$;

-- ============================================
-- 2b. Add unique constraint on pending_payments.transaction_no (if not exists) [SECURITY v2.9.2]
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'pending_payments_transaction_no_unique'
    ) THEN
        ALTER TABLE pending_payments ADD CONSTRAINT pending_payments_transaction_no_unique UNIQUE (transaction_no);
        RAISE NOTICE 'Added unique constraint on pending_payments.transaction_no';
    ELSE
        RAISE NOTICE 'Unique constraint on pending_payments.transaction_no already exists';
    END IF;
END $$;

-- ============================================
-- 3. Add indexes for better performance
-- ============================================

-- Index on email_verification_tokens.user_id
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id 
ON email_verification_tokens(user_id);

-- Index on user_sessions.user_id
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id 
ON user_sessions(user_id);

-- Index on user_sessions.token for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_sessions_token 
ON user_sessions(token);

-- Index on quiz_sessions.device_id
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_device_id 
ON quiz_sessions(device_id);

-- Index on quiz_sessions.status
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_status 
ON quiz_sessions(status);

-- Index on transactions.device_id
CREATE INDEX IF NOT EXISTS idx_transactions_device_id 
ON transactions(device_id);

-- Index on pending_payments.device_id
CREATE INDEX IF NOT EXISTS idx_pending_payments_device_id 
ON pending_payments(device_id);

-- Index on pending_payments.status
CREATE INDEX IF NOT EXISTS idx_pending_payments_status 
ON pending_payments(status);

-- Index on pending_payments.transaction_no
CREATE INDEX IF NOT EXISTS idx_pending_payments_transaction_no 
ON pending_payments(transaction_no);

-- Index on webhook_events.event_id for idempotency checks
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id 
ON webhook_events(event_id);

-- ============================================
-- 4. Clean up expired data (optional)
-- ============================================

-- Delete expired quiz sessions (older than 24 hours)
DELETE FROM quiz_sessions WHERE expires_at < NOW();

-- Delete expired pending payments (older than 24 hours and still pending)
DELETE FROM pending_payments WHERE expires_at < NOW() AND status = 'pending';

-- Delete expired email verification tokens
DELETE FROM email_verification_tokens WHERE expires_at < NOW();

-- Delete expired user sessions
DELETE FROM user_sessions WHERE expires_at < NOW();

-- ============================================
-- 5. Verify migration success
-- ============================================
SELECT 'Migration completed successfully!' as status;

-- Show table counts
SELECT 
    'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'page_credits', COUNT(*) FROM page_credits
UNION ALL
SELECT 'pending_payments', COUNT(*) FROM pending_payments
UNION ALL
SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL
SELECT 'quiz_sessions', COUNT(*) FROM quiz_sessions
UNION ALL
SELECT 'webhook_events', COUNT(*) FROM webhook_events;
