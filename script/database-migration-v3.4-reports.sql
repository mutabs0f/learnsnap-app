-- LearnSnap v2.9.5 - Question Reports Migration
-- Run this in Neon Console SQL Editor

-- Question Reports Table
CREATE TABLE IF NOT EXISTS question_reports (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  question_index INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  report_reason VARCHAR(50) NOT NULL CHECK (report_reason IN ('unclear', 'wrong_answer', 'duplicate', 'inappropriate', 'other')),
  report_details TEXT,
  device_id VARCHAR(255),
  user_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_question_reports_status ON question_reports(status);
CREATE INDEX IF NOT EXISTS idx_question_reports_created_at ON question_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_reports_session ON question_reports(session_id);
