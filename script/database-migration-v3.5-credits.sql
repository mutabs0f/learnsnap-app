-- v3.5 Credit System Fix - Idempotency Protection
-- This migration adds transaction tracking to prevent duplicate credit grants

-- Table to track all credit transactions with idempotency
CREATE TABLE IF NOT EXISTS credit_transactions (
  id SERIAL PRIMARY KEY,
  transaction_id VARCHAR(255) UNIQUE NOT NULL,  -- Idempotency key
  device_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255),
  transaction_type VARCHAR(50) NOT NULL,  -- 'registration_bonus', 'early_adopter', 'purchase', 'sync', 'use'
  pages_amount INTEGER NOT NULL,
  pages_before INTEGER DEFAULT 0,
  pages_after INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Index for fast lookups
  CONSTRAINT idx_credit_tx_device UNIQUE (device_id, transaction_type, user_id)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_type ON credit_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_credit_tx_created ON credit_transactions(created_at);

-- Add idempotency column to page_credits if not exists
ALTER TABLE page_credits 
ADD COLUMN IF NOT EXISTS registration_bonus_granted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS early_adopter_granted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP;
