-- v2.9.16 Credit Owner System Migration
-- This migration supports the new Credit Owner ID system where:
-- - Guests use deviceId as their owner ID
-- - Logged-in users use 'user_<USER_ID>' as their owner ID
-- 
-- IMPORTANT: This is a NON-DESTRUCTIVE migration. Run only once.
-- No data is deleted; new records are created for user ownership.

-- Ensure credit_transactions table exists for tracking transfers
CREATE TABLE IF NOT EXISTS credit_transactions (
    id SERIAL PRIMARY KEY,
    transaction_id VARCHAR(255) UNIQUE NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    transaction_type VARCHAR(50) NOT NULL, -- 'guest_transfer', 'early_adopter', 'registration_bonus', 'purchase', 'usage'
    pages_amount INTEGER NOT NULL DEFAULT 0,
    pages_before INTEGER NOT NULL DEFAULT 0,
    pages_after INTEGER NOT NULL DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_credit_transactions_device_user ON credit_transactions(device_id, user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON credit_transactions(user_id);

-- This migration DOES NOT automatically create user_<id> records.
-- They will be created on-demand when users log in and sync their credits.
-- This ensures no data corruption during migration.

-- Optional: View to debug credit ownership
-- SELECT 
--   pc.device_id,
--   pc.user_id,
--   pc.pages_remaining,
--   CASE 
--     WHEN pc.device_id LIKE 'user_%' THEN 'user_owner'
--     ELSE 'device_owner'
--   END as owner_type
-- FROM page_credits pc
-- ORDER BY pc.updated_at DESC;

COMMENT ON TABLE credit_transactions IS 'Tracks all credit-related transactions for idempotency and audit';
