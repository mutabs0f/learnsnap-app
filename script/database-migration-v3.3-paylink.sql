-- LearnSnap Database Migration v3.3 - Paylink Payment Fix
-- Run this in Neon Console or via psql
-- This fixes the missing pending_payments table and transactions columns

-- ============================================
-- 1. CREATE pending_payments TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS pending_payments (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_number VARCHAR(255) NOT NULL UNIQUE,
    transaction_no VARCHAR(255) NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    pages INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '1 hour'),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_pending_payments_order_number ON pending_payments(order_number);
CREATE INDEX IF NOT EXISTS idx_pending_payments_transaction_no ON pending_payments(transaction_no);
CREATE INDEX IF NOT EXISTS idx_pending_payments_expires_status ON pending_payments(expires_at, status);

-- ============================================
-- 2. ADD MISSING COLUMNS TO transactions TABLE
-- ============================================
-- Add order_number column
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS order_number VARCHAR(255);

-- Rename stripe_payment_id to payment_id (more generic)
-- First add the new column
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_id VARCHAR(255);

-- Copy data from stripe_payment_id to payment_id
UPDATE transactions SET payment_id = stripe_payment_id WHERE payment_id IS NULL AND stripe_payment_id IS NOT NULL;

-- Add transaction_no column
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_no VARCHAR(255);

-- Add index on payment_id
CREATE INDEX IF NOT EXISTS idx_transactions_payment_id ON transactions(payment_id);

-- ============================================
-- 3. VERIFY CHANGES
-- ============================================
-- After running, verify with these queries:

-- Check pending_payments table exists:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'pending_payments';

-- Check transactions columns:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'transactions';

-- ============================================
-- 4. MANUAL CREDIT FIX FOR USER
-- ============================================
-- If user paid 5 SAR (10 pages) but didn't receive credits:
-- Run this with the correct device_id:

-- UPDATE page_credits 
-- SET pages_remaining = pages_remaining + 10 
-- WHERE device_id = '1c431a08-53a2-433f-a463-18368711dbbe';

-- INSERT INTO transactions (id, device_id, amount, pages_purchased, payment_id, transaction_no, created_at)
-- VALUES (
--     gen_random_uuid()::text,
--     '1c431a08-53a2-433f-a463-18368711dbbe',
--     500,
--     10,
--     'pl_1767464288359',
--     '1767464288359',
--     NOW()
-- );
