-- ============================================
-- LearnSnap Database Migration v3.2
-- Security & Integrity Fixes
-- Run this in Neon SQL Editor
-- ============================================

-- 1. Clean up NULL device_id in quiz_sessions (if any exist)
DELETE FROM quiz_sessions WHERE device_id IS NULL;

-- 2. Add NOT NULL constraint to quiz_sessions.device_id
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quiz_sessions' 
        AND column_name = 'device_id' 
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE quiz_sessions ALTER COLUMN device_id SET NOT NULL;
        RAISE NOTICE 'Added NOT NULL constraint to quiz_sessions.device_id';
    ELSE
        RAISE NOTICE 'quiz_sessions.device_id already NOT NULL';
    END IF;
END $$;

-- 3. Fix NULL device_id in transactions (set to 'legacy-unknown')
UPDATE transactions SET device_id = 'legacy-unknown' WHERE device_id IS NULL;

-- 4. Add NOT NULL constraint to transactions.device_id
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'transactions' 
        AND column_name = 'device_id' 
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE transactions ALTER COLUMN device_id SET NOT NULL;
        RAISE NOTICE 'Added NOT NULL constraint to transactions.device_id';
    ELSE
        RAISE NOTICE 'transactions.device_id already NOT NULL';
    END IF;
END $$;

-- 5. Add FK for page_credits.user_id → users.id (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'page_credits_user_id_fkey'
    ) THEN
        ALTER TABLE page_credits 
        ADD CONSTRAINT page_credits_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added FK constraint page_credits_user_id_fkey';
    ELSE
        RAISE NOTICE 'FK constraint page_credits_user_id_fkey already exists';
    END IF;
END $$;

-- 6. Add unique constraint on pending_payments.transaction_no (if not exists)
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

-- 7. Add performance indexes (CONCURRENTLY for minimal locking)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quiz_sessions_expires_at 
ON quiz_sessions(expires_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_expires_at 
ON user_sessions(expires_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_verification_tokens_expires 
ON email_verification_tokens(expires_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pending_payments_expires_status 
ON pending_payments(expires_at, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_page_credits_user_id 
ON page_credits(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_google_id 
ON users(google_id) WHERE google_id IS NOT NULL;

-- 8. Verify constraints
SELECT 'Constraints Check' as check_type;
SELECT 
    table_name, 
    column_name, 
    is_nullable 
FROM information_schema.columns 
WHERE table_name IN ('quiz_sessions', 'transactions') 
AND column_name = 'device_id';

SELECT 'FK Check' as check_type;
SELECT conname 
FROM pg_constraint 
WHERE conname = 'page_credits_user_id_fkey';

SELECT 'Index Check' as check_type;
SELECT indexname 
FROM pg_indexes 
WHERE tablename IN ('quiz_sessions', 'user_sessions', 'pending_payments', 'page_credits', 'users', 'email_verification_tokens')
AND indexname LIKE 'idx_%';

-- ============================================
-- Migration v3.2 Complete
-- ============================================
