-- [P1.4] Add tokenType column to email_verification_tokens
-- Safe migration that adds column if it doesn't exist

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_verification_tokens' AND column_name = 'token_type'
  ) THEN
    ALTER TABLE email_verification_tokens ADD COLUMN token_type text DEFAULT 'verify';
    RAISE NOTICE 'Added token_type column';
  ELSE
    RAISE NOTICE 'token_type column already exists';
  END IF;
END $$;
