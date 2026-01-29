# API Contract

> **Version**: 3.0.0-enterprise  
> **Last Updated**: January 9, 2026  
> **Base URL**: `/api`

## Authentication

### Session-Based Auth (Enterprise v3.0)

**Primary authentication is via httpOnly cookie; Bearer token is legacy opt-in.**

Most endpoints use session-based authentication:
- Login sets an httpOnly session cookie (primary method)
- Cookie name: `session_token` (dev) or `__Host-session` (production)
- Sessions expire after 30 days
- Legacy: Bearer token in Authorization header (opt-in via `LEGACY_BEARER_AUTH=true`)

### Device Token

Non-authenticated requests use device tokens:
- Stored in `device_token` cookie
- Used to identify guest devices
- Required for credit operations

---

## Auth Endpoints

### POST /api/auth/register

Register a new user with email/password.

**Rate Limited**: Yes (authLimiter)

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "name": "User Name",
  "deviceId": "abc123-..."
}
```

**Response (201):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name"
  },
  "token": "session-token",
  "pagesRemaining": 50,
  "isEarlyAdopter": true
}
```

**Errors:**
- 400: Invalid input
- 409: Email already registered

### POST /api/auth/login

Login with email/password.

**Rate Limited**: Yes (authLimiter)

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "deviceId": "abc123-..."
}
```

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name"
  },
  "token": "session-token",
  "pagesRemaining": 45
}
```

**Errors:**
- 401: Invalid credentials
- 403: Email not verified

### POST /api/auth/logout

Logout current user.

**Auth Required**: Yes

**Response (200):**
```json
{
  "success": true
}
```

### GET /api/auth/me

Get current user info.

**Auth Required**: Yes

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "emailVerified": true
  }
}
```

### POST /api/auth/sync-credits

Sync credits after login, transfer guest excess.

**Auth Required**: Yes

**Request:**
```json
{
  "deviceId": "abc123-..."
}
```

**Response (200):**
```json
{
  "pagesRemaining": 48,
  "transferred": 3
}
```

### GET /api/auth/google

Initiate Google OAuth flow.

**Response**: Redirect to Google

### GET /api/auth/google/callback

Google OAuth callback.

**Response**: Redirect to app with token

### GET /api/auth/providers

Get available auth providers.

**Response (200):**
```json
{
  "providers": {
    "google": true,
    "email": true
  }
}
```

### GET /api/auth/verify-email/:token

Verify email with token.

**Response (200):**
```json
{
  "success": true,
  "message": "تم التحقق من البريد الإلكتروني بنجاح"
}
```

### POST /api/auth/resend-verification

Resend verification email.

**Rate Limited**: Yes

**Request:**
```json
{
  "email": "user@example.com"
}
```

### POST /api/auth/forgot-password

Request password reset.

**Rate Limited**: Yes

**Request:**
```json
{
  "email": "user@example.com"
}
```

### POST /api/auth/reset-password

Reset password with token.

**Request:**
```json
{
  "token": "reset-token",
  "password": "NewPassword123"
}
```

---

## Credits Endpoints

### GET /api/credits/:deviceId

Get credit balance for a device/user.

**Response (200):**
```json
{
  "pagesRemaining": 15,
  "totalPagesUsed": 5,
  "isEarlyAdopter": true
}
```

**Notes:**
- If Authorization header present, returns user_<id> credits
- Otherwise returns deviceId credits

---

## Quiz Endpoints

### POST /api/quiz/create

Create a new quiz from uploaded images.

**Rate Limited**: Yes (quizCreateLimiter)

**Request:**
```json
{
  "images": ["base64...", "base64..."],
  "deviceId": "abc123-..."
}
```

**Response (201):**
```json
{
  "sessionId": "quiz-uuid",
  "status": "processing",
  "imageCount": 5,
  "pagesRemaining": 10
}
```

**Errors:**
- 400: Invalid images
- 402: Insufficient credits
- 429: Rate limited

### GET /api/quiz/:sessionId

Get quiz data.

**Response (200):**
```json
{
  "id": "quiz-uuid",
  "status": "ready",
  "lesson": { "title": "...", "summary": "..." },
  "questions": [
    {
      "type": "multiple_choice",
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "correct": "A"
    }
  ],
  "warnings": []
}
```

**Notes:**
- Poll while `status: "processing"`
- `status: "ready"` means questions available

### POST /api/quiz/:sessionId/submit

Submit quiz answers.

**Request:**
```json
{
  "answers": ["A", true, "answer", [0, 1, 2, 3]]
}
```

**Response (200):**
```json
{
  "score": 18,
  "total": 20,
  "results": [
    { "correct": true },
    { "correct": false, "correctAnswer": "B" }
  ]
}
```

### GET /api/quiz/:sessionId/result

Get quiz results.

**Response (200):**
```json
{
  "score": 18,
  "total": 20,
  "percentage": 90
}
```

### POST /api/quiz/:sessionId/report-question

Report a problematic question.

**Rate Limited**: Yes (reportLimiter)

**Request:**
```json
{
  "questionIndex": 5,
  "reason": "الإجابة خاطئة"
}
```

### GET /api/quiz/job/:jobId/status

Get async job status (when Redis enabled).

### GET /api/quiz/job/:jobId/result

Get async job result (when Redis enabled).

---

## Payment Endpoints

### GET /api/billing/packs

Get available credit packages.

**Response (200):**
```json
{
  "packages": [
    {
      "id": "pack_10",
      "pages": 10,
      "price": 9.99,
      "currency": "SAR"
    }
  ]
}
```

### POST /api/device/issue

Issue a device token.

**Rate Limited**: Yes (deviceIssueLimiter)

**Response (200):**
```json
{
  "deviceId": "uuid",
  "token": "device-token"
}
```

### POST /api/payment/create

Create a payment checkout.

**Rate Limited**: Yes (checkoutLimiter)

**Request:**
```json
{
  "packageId": "pack_10",
  "deviceId": "abc123-..."
}
```

**Response (200):**
```json
{
  "checkoutUrl": "https://paylink.sa/...",
  "orderNumber": "LS-12345",
  "transactionNo": "abc123"
}
```

### POST /api/payment/verify

Verify payment status.

**Request:**
```json
{
  "transactionNo": "abc123",
  "orderNumber": "LS-12345"
}
```

**Response (200):**
```json
{
  "status": "paid",
  "pages": 10
}
```

### POST /api/webhooks/paylink

Paylink webhook endpoint.

**Signature**: Verified via x-paylink-signature header

---

## Admin Endpoints

All admin endpoints require `ADMIN_PASSWORD` authentication.

### GET /api/admin/stats

Get system statistics.

### GET /api/admin/devices

List devices with credits.

### GET /api/admin/transactions

List payment transactions.

### GET /api/admin/metrics

Get system metrics.

### GET /api/admin/question-reports

List question reports.

### GET /api/admin/question-reports/stats

Get report statistics.

### PATCH /api/admin/question-reports/:reportId

Update report status.

---

## Health Endpoints

### GET /health

Basic health check.

**Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-07T..."
}
```

### GET /health/ready

Readiness check (includes DB).

### GET /health/live

Liveness check.

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message in Arabic",
  "code": "ERROR_CODE"
}
```

**Common Error Codes:**
- 400: BAD_REQUEST - Invalid input
- 401: UNAUTHORIZED - Not authenticated
- 402: INSUFFICIENT_CREDITS - Need more pages
- 403: FORBIDDEN - Not allowed
- 404: NOT_FOUND - Resource not found
- 409: CONFLICT - Duplicate resource
- 429: RATE_LIMITED - Too many requests
- 500: SERVER_ERROR - Internal error

---

## Security Expectations (v2.9.32)

### Diagram Rendering
- Diagrams from AI are validated server-side (SVG only, no scripts/events)
- Client renders diagrams as `<img>` with data URL - no raw HTML injection
- Invalid/dangerous diagrams are dropped silently

### Webhook Verification
- In production: `PAYLINK_WEBHOOK_SECRET` is **required**
- Webhooks without valid signature are rejected with 401
- Credits are only added based on pending_payments DB records, not webhook metadata

### OAuth Token Security
- OAuth tokens are passed in URL fragment (`#token=...`), not query string
- Fragment is not sent to server, protecting token from logs/referrer
- Client cleans up URL immediately after reading token

### Admin Dashboard
- In production: Admin routes are **disabled by default**
- Requires both `ENABLE_ADMIN=true` AND `ADMIN_PASSWORD` set
- In development: Admin routes enabled unless explicitly disabled
