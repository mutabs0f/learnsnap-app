# Database Schema

> **Version**: 2.9.26  
> **Last Updated**: January 8, 2026  
> **Database**: Neon PostgreSQL

## Tables Overview

| Table | Purpose | Critical |
|-------|---------|----------|
| users | User accounts | Yes |
| user_sessions | Auth sessions | Yes |
| email_verification_tokens | Email verification | No |
| page_credits | Credit balances | Yes |
| transactions | Payment records | Yes |
| quiz_sessions | Quiz data | No |
| webhook_events | Idempotency tracking | Yes |
| pending_payments | Payment state | Yes |
| question_reports | User feedback | No |
| credit_transactions | Credit idempotency | Yes |

## Table Definitions

### users

Stores user account information for email/password and Google OAuth users.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | varchar(36) | NO | gen_random_uuid() | PK |
| email | text | NO | - | UNIQUE |
| password_hash | text | YES | - | For email auth |
| password | text | YES | - | Legacy column |
| name | text | YES | - | Display name |
| full_name | text | YES | - | Legacy column |
| google_id | text | YES | - | UNIQUE, OAuth ID |
| avatar_url | text | YES | - | Profile picture |
| email_verified | boolean | YES | false | Email confirmation |
| subscription_tier | text | YES | - | Legacy column |
| subscription_status | text | YES | - | Legacy column |
| stripe_customer_id | text | YES | - | Legacy column |
| stripe_subscription_id | text | YES | - | Legacy column |
| notification_preferences | jsonb | YES | - | Legacy column |
| created_at | timestamp | YES | now() | - |
| updated_at | timestamp | YES | now() | - |

**Indexes:**
- `users_pkey` - Primary key on id
- `users_email_unique` - Unique on email
- `users_google_id_unique` - Unique on google_id

### user_sessions

Stores authentication session tokens.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | varchar(36) | NO | gen_random_uuid() | PK |
| user_id | varchar(36) | NO | - | FK → users.id |
| token | text | NO | - | UNIQUE, session token |
| expires_at | timestamp | NO | - | Session expiry |
| created_at | timestamp | YES | now() | - |

**Indexes:**
- `user_sessions_pkey` - Primary key on id
- `user_sessions_token_unique` - Unique on token
- `user_sessions_user_id_idx` - Index on user_id
- `user_sessions_expires_at_idx` - Index on expires_at

### email_verification_tokens

Stores email verification tokens.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | varchar(36) | NO | gen_random_uuid() | PK |
| user_id | varchar(36) | NO | - | FK → users.id |
| token | text | NO | - | UNIQUE |
| expires_at | timestamp | NO | - | Token expiry |
| created_at | timestamp | YES | now() | - |

**Indexes:**
- `email_verification_tokens_expires_at_idx` - Index on expires_at

### page_credits

Stores credit balances. **CRITICAL TABLE**.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | serial | NO | auto | PK |
| device_id | text | NO | - | UNIQUE, owner ID |
| pages_remaining | integer | YES | 0 | CHECK >= 0 |
| total_pages_used | integer | YES | 0 | CHECK >= 0 |
| user_id | varchar(36) | YES | - | Legacy linking |
| is_early_adopter | boolean | YES | false | Bonus granted |
| status | text | YES | 'active' | active/on_hold |
| created_at | timestamp | YES | now() | - |
| updated_at | timestamp | YES | now() | - |

**Indexes:**
- `page_credits_pkey` - Primary key on id
- `page_credits_device_id_unique` - Unique on device_id
- `page_credits_device_id_idx` - Index on device_id
- `page_credits_user_id_idx` - Index on user_id

**Constraints:**
- `chk_pages_remaining_non_negative` - CHECK (pages_remaining >= 0)
- `chk_total_pages_used_non_negative` - CHECK (total_pages_used >= 0)

### transactions

Stores payment records.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | varchar(36) | NO | gen_random_uuid() | PK |
| device_id | text | NO | - | Owner ID |
| amount | integer | NO | - | In halalas (SAR×100) |
| pages_purchased | integer | NO | - | CHECK > 0 |
| stripe_payment_id | text | YES | - | UNIQUE, payment ref |
| stripe_payment_status | text | YES | - | Legacy column |
| created_at | timestamp | YES | now() | - |

**Indexes:**
- `transactions_pkey` - Primary key on id
- `transactions_payment_id_unique` - Unique on stripe_payment_id
- `transactions_device_id_idx` - Index on device_id
- `transactions_created_at_idx` - Index on created_at

**Constraints:**
- `chk_pages_purchased_positive` - CHECK (pages_purchased > 0)
- `chk_amount_non_negative` - CHECK (amount >= 0)

### quiz_sessions

Stores quiz data temporarily.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | varchar(36) | NO | gen_random_uuid() | PK |
| device_id | text | NO | - | Owner device |
| image_data | text | YES | - | Legacy single image |
| images | jsonb | YES | - | Array of base64 images |
| image_count | integer | YES | 1 | Number of images |
| lesson | jsonb | YES | - | Lesson summary |
| questions | jsonb | YES | - | Generated questions |
| answers | jsonb | YES | - | User answers |
| score | integer | YES | - | Final score |
| total_questions | integer | YES | 10 | Question count |
| status | text | YES | 'processing' | processing/ready/completed |
| warnings | jsonb | YES | - | Processing warnings |
| created_at | timestamp | YES | now() | - |
| expires_at | timestamp | YES | now() + 24h | Auto-expiry |

**Indexes:**
- `quiz_sessions_pkey` - Primary key on id
- `quiz_sessions_device_id_idx` - Index on device_id
- `quiz_sessions_status_idx` - Index on status
- `quiz_sessions_expires_at_idx` - Index on expires_at
- `quiz_sessions_created_at_idx` - Index on created_at

### webhook_events

Stores webhook processing state for idempotency.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | serial | NO | auto | PK |
| event_id | text | NO | - | UNIQUE, event identifier |
| event_type | text | NO | - | Event type |
| processed | boolean | YES | false | Legacy column |
| status | text | YES | 'pending' | pending/processing/succeeded/failed |
| data | jsonb | YES | - | Event payload |
| created_at | timestamp | YES | now() | - |

### pending_payments

Stores payment state during checkout.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | serial | NO | auto | PK |
| order_number | text | NO | - | UNIQUE |
| transaction_no | text | YES | - | Paylink reference |
| device_id | text | NO | - | targetOwnerId |
| pages | integer | NO | - | Pages to add |
| amount | integer | NO | - | Amount in halalas |
| status | text | YES | 'pending' | pending/paid/failed |
| created_at | timestamp | YES | now() | - |

### question_reports

Stores user-reported problematic questions.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | varchar(36) | NO | gen_random_uuid() | PK |
| quiz_session_id | varchar(36) | NO | - | FK → quiz_sessions.id |
| question_index | integer | NO | - | Question number |
| reason | text | NO | - | Report reason |
| device_id | text | YES | - | Reporter device |
| user_id | varchar(36) | YES | - | Reporter user |
| status | text | YES | 'pending' | pending/reviewed/resolved |
| admin_notes | text | YES | - | Admin comments |
| created_at | timestamp | YES | now() | - |

### credit_transactions

Tracks credit operations for idempotency.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | serial | NO | auto | PK |
| device_id | text | NO | - | Owner ID |
| user_id | varchar(36) | YES | - | Associated user |
| transaction_type | text | NO | - | registration_bonus/early_adopter/purchase/sync/use |
| pages_amount | integer | NO | - | Pages affected |
| pages_before | integer | YES | - | Balance before |
| pages_after | integer | YES | - | Balance after |
| metadata | jsonb | YES | - | Additional data |
| created_at | timestamp | YES | now() | - |

**Constraints:**
- UNIQUE (device_id, transaction_type, user_id) - Prevents duplicate operations

## Schema Assumptions

1. All timestamps are UTC
2. UUIDs are generated by PostgreSQL
3. JSONB columns may contain null
4. Legacy columns are kept for backward compatibility
5. CHECK constraints are enforced at DB level

## Open Questions

1. Should we add foreign key from page_credits.device_id to users for user_<id> rows?
2. Should we partition quiz_sessions by created_at for performance?
3. Should legacy columns be dropped in a future migration?
