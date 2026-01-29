-- Migration 003: Soft Delete Columns
-- Created: 2026-01-24
-- Purpose: Add soft delete capability to key tables

-- Users Table
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(is_deleted) WHERE is_deleted = TRUE;

-- Quiz Sessions Table (soft delete for audit trail)
ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_deleted ON quiz_sessions(is_deleted) WHERE is_deleted = TRUE;

-- Transactions Table (never hard delete for audit compliance)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- Question Reports Table
ALTER TABLE question_reports ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE question_reports ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- Support Tickets Table
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- Create views for non-deleted records (optional, for convenience)
-- These views exclude soft-deleted records

-- View: active_users
CREATE OR REPLACE VIEW active_users AS
SELECT * FROM users WHERE is_deleted = FALSE OR is_deleted IS NULL;

-- View: active_quiz_sessions
CREATE OR REPLACE VIEW active_quiz_sessions AS
SELECT * FROM quiz_sessions WHERE is_deleted = FALSE OR is_deleted IS NULL;
