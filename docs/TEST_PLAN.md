# Test Plan

> **Version**: 3.0.1-maintainability  
> **Last Updated**: January 9, 2026  
> **Status**: Partial automation (smoke tests implemented)

## Overview

This document defines end-to-end test scenarios for LearnSnap. Tests focus on critical user flows, especially the fragile credits system.

## Automated Tests (v3.0.1)

### Backend Smoke Tests

Location: `server/__tests__/smoke.test.ts`

**Tests (7 total):**
1. getDeviceTokenSecret returns string or undefined
2. isProduction returns boolean
3. isProduction returns false in test environment
4. Logger imports without crash
5. Config module imports without crash  
6. Schemas import without crash
7. API versioning imports without crash

### API Smoke Tests (Real Routes)

Location: `server/__tests__/api-smoke.test.ts`

**Tests (5 total):**
1. `GET /health/live` returns 200 with alive status
2. `GET /api/csrf-token` returns token in response
3. `POST /api/payment/create` returns 400 for missing fields
4. `GET /api/credits/:deviceId` returns 400 for invalid deviceId
5. `GET /api/credits/:deviceId` returns error for missing device token

### Run Commands

```bash
# Run all tests
npx vitest run server/__tests__

# Run specific file
npx vitest run server/__tests__/api-smoke.test.ts

# Watch mode
npx vitest server/__tests__
```

### CI Integration

Tests run automatically in `.github/workflows/ci.yml` on push/PR to main.

**What's NOT automated yet:**
- Frontend component tests
- E2E tests with Playwright (e2e/specs/ folder not created)

## Security Test Cases (v2.9.32)

### SEC-1: XSS Prevention via Diagram

```gherkin
Given a quiz with a malicious diagram containing <script>alert('xss')</script>
When the user views the question
Then the diagram should NOT execute JavaScript
And the diagram should either be filtered out or rendered safely as an image
```

**Verification:**
- Open browser dev tools Console
- No JavaScript alerts or errors from diagram content
- Diagram rendered as `<img>` with data URL, not raw HTML

### SEC-2: Webhook Signature Verification (Production)

```gherkin
Given NODE_ENV=production and PAYLINK_WEBHOOK_SECRET is set
When a webhook request arrives without x-paylink-signature header
Then the request should be rejected with 401
And no credits should be added
```

```gherkin
Given NODE_ENV=production and PAYLINK_WEBHOOK_SECRET is NOT set
When a webhook request arrives
Then the request should be rejected with 500
And server should log CRITICAL error
```

### SEC-3: OAuth Token Not in URL Query

```gherkin
Given a user completes Google OAuth login
When they are redirected to /auth/callback
Then the URL should contain token in fragment (#token=xxx)
And the URL should NOT contain token in query string (?token=xxx)
And after processing, the URL fragment should be cleaned up
```

### SEC-4: Admin Routes Disabled in Production

```gherkin
Given NODE_ENV=production
And ENABLE_ADMIN is NOT set (or set to 'false')
When a request is made to /api/admin/stats
Then the request should return 404 (route not registered)
```

```gherkin
Given NODE_ENV=production
And ENABLE_ADMIN=true but ADMIN_PASSWORD is NOT set
When the server starts
Then admin routes should NOT be registered
And server should log an error
```

### SEC-5: CSRF Protection in Production

```gherkin
Given NODE_ENV=production
And SESSION_SECRET is NOT set
When the server attempts to start
Then the server should exit with FATAL error
And error message should mention SESSION_SECRET requirement
```

### SEC-6: Device Token Required

```gherkin
Given a quiz session exists for device A
When a request is made to access the quiz without device_token cookie
Then the request should be rejected with 401 MISSING_DEVICE_TOKEN
And even if x-device-id header matches, the request should still fail
```

## Enterprise v3.0 Test Cases

### ENT-1: No authToken in localStorage

```gherkin
Given a user successfully logs in with email/password
When the login completes
Then localStorage should NOT contain 'authToken'
And the session cookie should be set (httpOnly)
And subsequent API calls should work with credentials: "include"
```

**Verification:**
- Open browser dev tools → Application → Local Storage
- Verify no 'authToken' key exists
- Verify API calls succeed (check Network tab for cookie being sent)

### ENT-2: Cookie-Based Auth for /api/auth/me

```gherkin
Given a logged-in user (via httpOnly cookie)
When they call GET /api/auth/me without Authorization header
Then the request should succeed
And return user data
```

**Verification:**
- Clear any Authorization header manually
- Ensure credentials: "include" is set
- Response should return user object with id, email, name

### ENT-3: Daily Quiz Quota Returns 429

```gherkin
Given QUIZ_DAILY_LIMIT=5
And a device has already created 5 quizzes today
When they attempt to create a 6th quiz
Then the response should be HTTP 429
And error code should be "QUOTA_EXCEEDED"
And message should be in Arabic
```

**Verification SQL:**
```sql
SELECT count FROM quota_counters 
WHERE key = 'quiz:<DEVICE_ID>' AND day = CURRENT_DATE;
-- Expected: 5 (or more)
```

### ENT-4: Audit Logs Table Created and Populated

```gherkin
Given the server has started
When a user logs in successfully
Then audit_logs table should exist
And an entry with action='AUTH_LOGIN_SUCCESS' should be created
And actor_id should be masked (first 8 chars only in table)
```

**Verification SQL:**
```sql
SELECT * FROM audit_logs WHERE action = 'AUTH_LOGIN_SUCCESS' ORDER BY created_at DESC LIMIT 1;
-- Expected: Row exists with masked actor_id
```

## Test Scenarios

### Scenario 1: Guest Gets Free Credits

```gherkin
Given a new device that has never visited the app
When the user visits the homepage
And requests their credit balance
Then they should receive 2 free pages
And a page_credits record should exist for their device_id
```

**Verification SQL:**
```sql
SELECT pages_remaining FROM page_credits WHERE device_id = '<DEVICE_ID>';
-- Expected: 2
```

### Scenario 2: Guest Creates Quiz

```gherkin
Given a guest with 2 free pages
When they upload 2 textbook pages
And submit for quiz generation
Then the quiz should be created successfully
And their balance should be 0
And total_pages_used should be 2
```

**Verification SQL:**
```sql
SELECT pages_remaining, total_pages_used FROM page_credits WHERE device_id = '<DEVICE_ID>';
-- Expected: 0, 2
```

### Scenario 3: Guest Insufficient Credits

```gherkin
Given a guest with 1 remaining page
When they try to upload 3 textbook pages
Then they should receive a 402 error
And the error message should be in Arabic
And their balance should remain 1
```

### Scenario 4: Early Adopter Registration

```gherkin
Given fewer than 30 users have registered
When a new user registers with email/password
Then they should receive 50 bonus pages
And is_early_adopter should be true
And a credit_transactions record should exist with type='early_adopter'
```

**Verification SQL:**
```sql
SELECT pages_remaining, is_early_adopter FROM page_credits WHERE device_id = 'user_<USER_ID>';
-- Expected: 50, true
```

### Scenario 5: Normal User Registration

```gherkin
Given 30 or more users have already registered
When a new user registers
Then they should receive 2 free pages
And is_early_adopter should be false
```

### Scenario 6: Guest Credits Transfer on Login

```gherkin
Given a guest device with 7 pages
And the guest is not yet registered
When the user registers and logs in
Then excess credits (7 - 2 = 5) should transfer to user account
And guest device should retain 2 pages
And user_<id> should have base + 5 transferred pages
```

**Verification SQL:**
```sql
-- Guest device
SELECT pages_remaining FROM page_credits WHERE device_id = '<DEVICE_ID>';
-- Expected: 2

-- User account
SELECT pages_remaining FROM page_credits WHERE device_id = 'user_<USER_ID>';
-- Expected: (base pages) + 5
```

### Scenario 7: No Double Transfer

```gherkin
Given a user has already logged in on device A (transfer occurred)
When the user logs out
And logs back in on the same device
Then no additional credits should transfer
And the transfer is idempotent
```

**Verification SQL:**
```sql
SELECT COUNT(*) FROM credit_transactions 
WHERE device_id = '<DEVICE_ID>' 
AND user_id = '<USER_ID>' 
AND transaction_type = 'sync';
-- Expected: 1 (not 2)
```

### Scenario 8: Account Switching (No Credit Bleed)

```gherkin
Given User A is logged in with 10 pages
And User B exists with 5 pages
When User A logs out
And User B logs in on the same device
Then User B should see their 5 pages (not User A's 10)
And User A's credits should be unchanged
```

**Critical Verification:**
```sql
-- User A unchanged
SELECT pages_remaining FROM page_credits WHERE device_id = 'user_<USER_A_ID>';
-- Expected: 10

-- User B sees their own
SELECT pages_remaining FROM page_credits WHERE device_id = 'user_<USER_B_ID>';
-- Expected: 5
```

### Scenario 9: Purchase Adds Credits (Logged In)

```gherkin
Given a logged-in user with 5 pages
When they purchase a 10-page package
And payment succeeds via Paylink
Then their balance should be 15 pages
And a transaction record should exist
And the transaction.device_id should be 'user_<id>'
```

**Verification SQL:**
```sql
SELECT pages_remaining FROM page_credits WHERE device_id = 'user_<USER_ID>';
-- Expected: 15

SELECT * FROM transactions WHERE device_id = 'user_<USER_ID>' ORDER BY created_at DESC LIMIT 1;
-- Should have pages_purchased = 10
```

### Scenario 10: Purchase Adds Credits (Guest)

```gherkin
Given a guest with 2 pages
When they purchase a 10-page package
And payment succeeds
Then their balance should be 12 pages
And transaction.device_id should be the guest device_id
```

### Scenario 11: Quiz Deduction is Exact

```gherkin
Given a user with 20 pages
When they create a quiz with 5 images
Then exactly 5 credits should be deducted
And balance should be 15
And total_pages_used should increase by 5
```

**Verification:**
- Check before/after balance
- Verify no double deduction on retry
- Verify deduction logged

### Scenario 12: No Double Deduction on Retry

```gherkin
Given a user with 10 pages
And a quiz session already created and charged
When the client retries the quiz creation (same session)
Then no additional credits should be deducted
And the original quiz should be returned
```

**Verification:**
- Balance before = balance after retry
- Same sessionId returned

## Test Data Requirements

### Users
- Early adopter user (within first 30)
- Normal user (after first 30)
- Google OAuth user
- Email/password user

### Devices
- Fresh device (no credits)
- Device with guest credits
- Device with excess credits (> 2)
- Device already transferred to user

### Credits
- User with 0 pages
- User with exact pages needed
- User with excess pages
- Guest at limit

## Test Environment

- Separate test database (not production)
- Test Paylink sandbox credentials
- Mock AI responses (or use test prompts)
- Isolated device IDs

## Automation Notes

Tests should be implemented with:
- Playwright for E2E browser tests
- Supertest for API tests
- Direct SQL verification for data checks

Reset between tests:
```sql
-- Clean test data
DELETE FROM quiz_sessions WHERE device_id LIKE 'test_%';
DELETE FROM page_credits WHERE device_id LIKE 'test_%';
DELETE FROM users WHERE email LIKE '%@test.learnsnap.local';
DELETE FROM transactions WHERE device_id LIKE 'test_%';
DELETE FROM credit_transactions WHERE device_id LIKE 'test_%';
```

## Priority Order

1. Scenario 8: Account Switching (Most critical - prevents data breach)
2. Scenario 6: Guest Transfer (Common failure mode)
3. Scenario 12: No Double Deduction (Financial integrity)
4. Scenario 9: Purchase Credits (Revenue path)
5. Scenario 4: Early Adopter (Business logic)
6. Remaining scenarios in order listed
