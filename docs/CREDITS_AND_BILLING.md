# Credits and Billing System

> **Version**: 2.9.32b  
> **Last Updated**: January 9, 2026  
> **Status**: CRITICAL - Single source of truth for credits rules

## Security Notes (v2.9.32b)

### Webhook Security
- **PAYLINK_WEBHOOK_SECRET** is required in production for webhook signature verification
- Webhooks without valid signature are rejected with 401

### Credits Source of Truth
- Credits are granted **ONLY** when a matching `pending_payments` record exists
- Webhook metadata (body.note) is used for logging/mismatch detection only, never for credit decisions
- If no `pending_payments` record found, webhook returns `{received: true, ignored: true}` - no credits granted

### Idempotent Processing
- `webhook_events` table prevents duplicate processing
- `transactions` table's unique `paymentId` prevents duplicate credit grants
- Safe to receive the same webhook multiple times

## Constants

```typescript
const FREE_PAGES_GUEST = 2;        // Free pages for guest devices
const DEFAULT_FREE_PAGES = 2;       // Free pages for registered users
const EARLY_ADOPTER_FREE_PAGES = 50; // Bonus for first 30 users
const EARLY_ADOPTER_LIMIT = 30;     // First N users get bonus
```

## Credit Rules

### Rule 1: Guest Free Pages

Every new device gets **2 free pages**.

- Triggered on first visit or first credit check
- Stored in `page_credits` with `device_id` = device UUID
- No registration required

### Rule 2: Registered User Pages

New registered users get:
- **50 pages** if they're among the first 30 users (early adopter)
- **2 pages** otherwise

Stored in `page_credits` with `device_id` = `user_<userId>`

### Rule 3: Early Adopter Bonus

- First 30 registered users get 50 page bonus
- Counted by `countEarlyAdopters()` query
- Tracked via `is_early_adopter` flag
- One-time grant, tracked in `credit_transactions`

### Rule 4: Guest-to-User Transfer

When a user logs in on a device with guest credits:

1. Check guest credits on device
2. Calculate excess: `guestPages - FREE_PAGES_GUEST`
3. If excess > 0, add to `user_<userId>` balance
4. Transfer is **idempotent** (once per device)

**Example:**
```
Guest device: 7 pages
User logs in
Excess: 7 - 2 = 5 pages transferred
Device keeps: 2 pages
User gains: 5 pages
```

### Rule 5: Purchase Credits

Purchased credits go to:
- `user_<userId>` if logged in
- `deviceId` if guest

Payment flow:
1. Create Paylink invoice with `targetOwnerId` in metadata
2. On success, add pages to `targetOwnerId`
3. Transaction recorded with unique `paymentId`

### Rule 6: Credit Deduction

When generating a quiz:
1. Calculate pages needed (= image count)
2. Lock row with `FOR UPDATE`
3. Check `pages_remaining >= needed`
4. Deduct atomically
5. Increment `total_pages_used`

**Deduction happens once per quiz, before generation starts.**

## Idempotency Rules

### Registration Bonus
- Uses `pg_advisory_xact_lock` to prevent race conditions
- Tracked in `credit_transactions` table
- Safe to retry registration

### Guest Transfer
- Tracked in `credit_transactions` with type='sync'
- One transfer per (device, user) pair
- Safe to call sync-credits multiple times

### Payment Credits
- `transactions.stripe_payment_id` is UNIQUE
- Duplicate payment attempts fail gracefully
- Webhook and verify both check for existing transaction

## Common Failure Modes

### 1. Credits Drifting Between Accounts

**Symptom**: User A sees credits that belong to User B

**Cause**: 
- Same device, different accounts
- UI showing cached/stale credits
- Logout not clearing localStorage

**Prevention**:
- Always use `user_<id>` for logged-in users
- Clear localStorage on logout
- Fetch fresh credits on login

### 2. Purchase Not Reflected

**Symptom**: Payment succeeded but pages not added

**Cause**:
- Webhook failed to process
- Wrong `targetOwnerId` calculated
- User logged out during checkout

**Prevention**:
- Poll verify endpoint after payment
- Store `targetOwnerId` in pending_payments
- Parse metadata from Paylink note field

### 3. Owner Mismatch (402 While UI Shows Pages)

**Symptom**: User sees pages in UI but gets 402 on quiz

**Cause**:
- UI showing stale localStorage
- API using different owner ID than UI expects
- Authorization header missing or expired (FIXED in v2.9.27)

**Prevention**:
- Send auth header with all API calls
- Invalidate credit cache after operations
- Log owner ID in API responses

**P0.1 Fix (v2.9.28 - Complete)**:
- If `Authorization` header exists but token is invalid/expired → API returns 401
- Previously: silently fell back to guest mode, causing account mixing
- Applied to all credit-sensitive endpoints:
  - `GET /api/credits/:deviceId`
  - `POST /api/quiz/create`
  - `POST /api/payment/create`
- Frontend must handle 401 by prompting re-login, not retrying as guest

### 4. Double Deduction

**Symptom**: Credits deducted twice for one quiz

**Cause**:
- Race condition in deduction
- Retry logic without idempotency

**Prevention**:
- `FOR UPDATE` row lock
- Check quiz session status before deducting
- Never deduct in retry path

### 5. Guest Credits Vanish After Login

**Symptom**: Guest had 10 pages, after login only has 2

**Cause**:
- Transfer logic incorrectly calculating excess
- Transfer to wrong user ID
- Transfer already happened to different user

**Prevention**:
- Verify transfer logic: `excess = max(0, guest - FREE_PAGES_GUEST)`
- Track transfers in credit_transactions
- Log all transfer operations

## Debug Checklist

### Check User's Credit Balance

```sql
-- Get credits for a logged-in user
SELECT * FROM page_credits 
WHERE device_id = 'user_<USER_ID>';

-- Get credits for a device
SELECT * FROM page_credits 
WHERE device_id = '<DEVICE_UUID>';
```

### Check All Credits for a User

```sql
-- Find all related credit records
SELECT * FROM page_credits 
WHERE device_id LIKE 'user_<USER_ID_PREFIX>%'
   OR user_id = '<USER_ID>';
```

### Check Recent Transactions

```sql
SELECT * FROM transactions 
WHERE device_id LIKE '%<PARTIAL_ID>%'
ORDER BY created_at DESC
LIMIT 10;
```

### Check Transfer History

```sql
SELECT * FROM credit_transactions 
WHERE (device_id = '<DEVICE_ID>' OR user_id = '<USER_ID>')
  AND transaction_type = 'sync'
ORDER BY created_at DESC;
```

### Check Payment Processing

```sql
-- Check pending payment
SELECT * FROM pending_payments 
WHERE order_number = '<ORDER_NUMBER>';

-- Check webhook events
SELECT * FROM webhook_events 
WHERE event_id LIKE '%<TRANSACTION_NO>%';

-- Check transaction
SELECT * FROM transactions 
WHERE stripe_payment_id LIKE '%<TRANSACTION_NO>%';
```

### Verify Credit Deduction

```sql
-- Check quiz session
SELECT id, device_id, image_count, status, created_at 
FROM quiz_sessions 
WHERE id = '<SESSION_ID>';

-- Check if credits were deducted
SELECT * FROM page_credits 
WHERE device_id = '<OWNER_ID>'
ORDER BY updated_at DESC;
```

## Package Pricing (Current)

| Package | Pages | Price (SAR) |
|---------|-------|-------------|
| Basic | 10 | TBD |
| Standard | 25 | TBD |
| Premium | 50 | TBD |

*Note: Actual prices defined in `PAYLINK_PACKAGES` constant*

## Audit Trail

All credit operations should log:
- `operation`: Type of operation
- `ownerId`: Truncated owner ID
- `pagesBefore`: Balance before
- `pagesAfter`: Balance after
- `pagesAmount`: Change amount

Logs are written to Winston logger with structured format.
