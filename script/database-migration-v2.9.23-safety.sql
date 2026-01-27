-- v2.9.23 Database Safety Constraints Migration
-- Adds CHECK constraints to prevent data corruption

-- Page Credits: Prevent negative pages
ALTER TABLE page_credits 
ADD CONSTRAINT IF NOT EXISTS chk_pages_remaining_non_negative 
CHECK (pages_remaining >= 0);

ALTER TABLE page_credits 
ADD CONSTRAINT IF NOT EXISTS chk_total_pages_used_non_negative 
CHECK (total_pages_used >= 0);

-- Transactions: Ensure valid payment data
ALTER TABLE transactions 
ADD CONSTRAINT IF NOT EXISTS chk_pages_purchased_positive 
CHECK (pages_purchased > 0);

ALTER TABLE transactions 
ADD CONSTRAINT IF NOT EXISTS chk_amount_non_negative 
CHECK (amount >= 0);

-- Note: credit_transactions table and indexes are created in v2.9.16 migration
-- This file only adds safety constraints that were missing
