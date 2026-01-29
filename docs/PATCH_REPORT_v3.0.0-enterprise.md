# Enterprise Hardening Patch Report v3.0.0

**Date**: January 9, 2026  
**Version**: 3.0.0-enterprise  
**Scope**: Security, Audit Logging, Abuse Controls, Cookie-based Auth

## Summary

This patch implements enterprise-grade security features including:
- **No authToken in localStorage** - Frontend no longer stores tokens in localStorage
- **httpOnly cookie sessions** - Primary auth via secure cookies
- **Audit logging** - Tracks auth events with masked IDs
- **Daily quotas** - Prevents abuse with per-device limits
- **Cleanup script** - Data retention automation

---

## Changes Implemented

### A) Auth Enterprise Upgrade (httpOnly Cookie Sessions)

**Files Modified**:
- `server/auth-routes.ts`

**Changes**:
1. **httpOnly Session Cookies** (Primary Auth)
   - Added `setSessionCookie()` and `clearSessionCookie()` helpers
   - Cookie name uses `__Host-` prefix in production for added security
   - SameSite=lax allows OAuth redirects while preventing CSRF
   - 30-day expiry matching session duration

2. **Dual-Mode Auth Middleware**
   - `requireAuth` now checks httpOnly cookie first
   - Falls back to Bearer token for legacy clients
   - Tracks auth method in request for logging

3. **Login Endpoint**
   - Sets httpOnly cookie on successful login
   - Still returns token in JSON for backward compatibility

4. **Logout Endpoint**
   - Clears httpOnly cookie on logout

5. **Google OAuth Callback**
   - Sets httpOnly cookie after successful OAuth
   - `LEGACY_TOKEN_REDIRECT=true` env var enables token in URL fragment (legacy mode)
   - Default: No token in URL (cookie handles auth)

**Configuration**:
```env
# Optional: Enable legacy token redirect for OAuth (default: false)
LEGACY_TOKEN_REDIRECT=true
```

---

### B) CSP Report-Only Mode

**Files Modified**:
- `server/security.ts`

**Changes**:
1. Added `CSP_REPORT_ONLY` environment variable support
2. When enabled, CSP violations are reported but not blocked
3. Added `frameAncestors: 'none'` to prevent clickjacking
4. Added paylink.sa to connectSrc and frameSrc

**Configuration**:
```env
# Enable CSP report-only mode (violations logged but not blocked)
CSP_REPORT_ONLY=true
```

---

### C) Abuse Controls (Daily Quotas)

**Files Modified**:
- `server/routes.ts`
- `server/audit-logger.ts`
- `server/db.ts`

**Changes**:
1. Created `quota_counters` table for tracking daily usage
2. Added `checkAndIncrementQuota()` function
3. Quiz creation now checks daily quota per device
4. Returns 429 with Arabic error when limit exceeded

**Database Schema**:
```sql
CREATE TABLE quota_counters (
  id SERIAL PRIMARY KEY,
  key VARCHAR(128) NOT NULL,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(key, day)
);
CREATE INDEX idx_quota_counters_key_day ON quota_counters(key, day);
```

**Configuration**:
```env
# Daily quiz limit per device (default: 100)
DAILY_QUIZ_LIMIT=100
```

**Security Note**: Quota keys are stored in full (unhashed) for accurate per-device enforcement. Only audit log output masks IDs for privacy. This prevents quota collision attacks where devices with shared prefixes could bypass limits.


---

### D) Audit Logging System

**Files Created**:
- `server/audit-logger.ts`

**Files Modified**:
- `server/db.ts`
- `server/auth-routes.ts`
- `server/routes.ts`

**Features**:
1. **Audit Log Table** with proper indexes
2. **Automatic Masking** of sensitive IDs (first 8 chars only)
3. **Metadata Sanitization** removes tokens/passwords/secrets
4. **Audit Actions**: AUTH_LOGIN_SUCCESS, AUTH_LOGIN_FAIL, GOOGLE_OAUTH_CALLBACK_SUCCESS, PAYMENT_CREATE, WEBHOOK_RECEIVED, QUOTA_EXCEEDED, etc.

**Database Schema**:
```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  actor_type VARCHAR(20) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(50),
  target_id VARCHAR(64),
  ip VARCHAR(45),
  user_agent VARCHAR(255),
  metadata_json JSONB DEFAULT '{}'
);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_type, actor_id);
```

---

### E) Data Retention SQL Scripts

Add to RUNBOOK.md for periodic cleanup:

```sql
-- Delete audit logs older than 90 days
DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';

-- Delete quota counters older than 7 days
DELETE FROM quota_counters WHERE day < CURRENT_DATE - INTERVAL '7 days';

-- Delete expired sessions
DELETE FROM user_sessions WHERE expires_at < NOW();

-- Delete expired email verification tokens
DELETE FROM email_verification_tokens WHERE expires_at < NOW();

-- Delete completed pending payments older than 30 days
DELETE FROM pending_payments WHERE created_at < NOW() - INTERVAL '30 days' AND status != 'pending';
```

---

### F) Config Validation

**Startup Checks in Production**:
- `FRONTEND_URL` - Required for CORS
- `SESSION_SECRET` - Required for CSRF protection
- `DEVICE_TOKEN_SECRET` or `SESSION_SECRET` - Required for device auth

**Recommended Additional Checks** (add to server/index.ts if needed):
```typescript
if (process.env.NODE_ENV === 'production') {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn("WARNING: Google OAuth not configured (GOOGLE_CLIENT_ID/SECRET missing)");
  }
}
```

---

## Migration Guide

### For Existing Deployments

1. **No Breaking Changes**: Bearer token auth continues to work
2. **Gradual Migration**: Clients can adopt cookies when ready
3. **Database Migration**: Tables auto-created on startup

### Environment Variables Summary

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LEGACY_TOKEN_REDIRECT` | No | `false` | OAuth returns token in URL fragment |
| `CSP_REPORT_ONLY` | No | `false` | CSP violations reported not blocked |
| `DAILY_QUIZ_LIMIT` | No | `100` | Max quizzes per device per day |

---

## Security Improvements

1. **XSS Protection**: httpOnly cookies prevent JavaScript access to session tokens
2. **CSRF Protection**: SameSite=lax + existing CSRF tokens
3. **Clickjacking**: frameAncestors: 'none' in CSP
4. **Abuse Prevention**: Daily quotas prevent resource exhaustion
5. **Audit Trail**: All auth and payment events logged with masked IDs

---

## Rollback Procedure

1. Set `LEGACY_TOKEN_REDIRECT=true` if OAuth breaks
2. Audit log and quota tables can be dropped without affecting core functionality
3. Cookie auth is additive - Bearer tokens always work
