# Security Patch Report: v2.9.32

**Date**: January 9, 2026  
**Severity**: CRITICAL  
**Affected Components**: Frontend + Backend

## Executive Summary

This patch addresses 8 security vulnerabilities identified in the LearnSnap application. All fixes follow a "fail-closed" security model - missing security configuration causes safe failures rather than insecure operation.

## Vulnerabilities Fixed

### P0-A: XSS via AI-Generated Diagrams (CRITICAL)

**Risk**: Script injection via malicious diagram content
**Fix**: 
- Server-side validation: Only SVG content type allowed, script/event handlers stripped
- Client-side rendering: Diagrams rendered as `<img>` with data URL, never raw HTML
- Invalid diagrams are silently dropped

**Files Changed**:
- `server/ai-service.ts`: Added `validateSvgContent()` function
- `client/src/pages/quiz.tsx`: Replaced `dangerouslySetInnerHTML` with safe `<img>` rendering

### P0-B: Webhook Signature Not Required in Production (CRITICAL)

**Risk**: Attacker could forge payment webhooks and gain free credits
**Fix**:
- In production: `PAYLINK_WEBHOOK_SECRET` is required
- Missing signature in production = 401 rejection with CRITICAL log
- Webhook only trusts pending_payments DB records, not webhook metadata

**Files Changed**:
- `server/paylink-routes.ts`: Added production checks

### P0-C: Admin Dashboard Open by Default (CRITICAL)

**Risk**: Admin access with weak or guessable password
**Fix**:
- In production: Admin routes disabled by default
- Requires both `ENABLE_ADMIN=true` AND `ADMIN_PASSWORD` set
- Routes not registered at all when disabled (404 instead of 401)

**Files Changed**:
- `server/routes.ts`: Added production checks

### P0-D: OAuth Token in Query String (HIGH)

**Risk**: Token visible in server logs, referrer header, browser history
**Fix**:
- Token passed in URL fragment (`#token=...`) not query string
- Fragment never sent to server
- Client cleans up URL after reading token

**Files Changed**:
- `server/auth-routes.ts`: Changed redirect to use fragment
- `client/src/pages/auth-callback.tsx`: Read from fragment, clean URL

### P1-E: OAuth State Parameter Disabled (MEDIUM)

**Risk**: CSRF attacks on OAuth flow
**Fix**: OAuth state parameter now enabled for CSRF protection

**Files Changed**:
- `server/auth-routes.ts`: Removed `state: false` from Google strategy

### P1-F: CSRF Secret Falls Back to Insecure Default (MEDIUM)

**Risk**: CSRF protection bypassable if SESSION_SECRET not set
**Fix**:
- In production: Missing `SESSION_SECRET` causes server exit with FATAL error
- `SESSION_SECRET` is checked **explicitly and separately** from DEVICE_TOKEN_SECRET
- Clear error message guides operators to fix configuration

**Files Changed**:
- `server/index.ts`: Added explicit SESSION_SECRET fail-closed check

### P1-G: x-device-id Header Bypasses Token Verification (MEDIUM)

**Risk**: Attacker could access quiz by guessing device ID
**Fix**:
- `device_token` cookie is required (cryptographic proof)
- `x-device-id` is additional check only, not a bypass

**Files Changed**:
- `server/routes.ts`: Removed x-device-id fallback

### P2-H: Security Headers Not Active (LOW)

**Risk**: Missing protections against clickjacking, XSS, etc.
**Fix**: 
- Helmet middleware activated for security headers
- CSP, HSTS, X-Frame-Options, etc. now active

**Files Changed**:
- `server/index.ts`: Added `setupSecurityMiddleware(app)` call

## Production Configuration Requirements

After this patch, production deployments MUST have:

| Variable | Required | Behavior if Missing |
|----------|----------|---------------------|
| `SESSION_SECRET` | Yes | Server exits |
| `FRONTEND_URL` | Yes | Server exits |
| `DEVICE_TOKEN_SECRET` or `SESSION_SECRET` | Yes | Server exits |
| `PAYLINK_WEBHOOK_SECRET` | Yes | Webhooks rejected |
| `ENABLE_ADMIN` + `ADMIN_PASSWORD` | Optional | Admin disabled (default) |

## Testing Checklist

- [ ] SEC-1: Upload image with `<script>` in filename, verify no XSS
- [ ] SEC-2: Send webhook without signature in production, verify 401
- [ ] SEC-3: Complete OAuth login, verify token in fragment not query
- [ ] SEC-4: Start in production without ENABLE_ADMIN, verify /api/admin/stats returns 404
- [ ] SEC-5: Start in production without SESSION_SECRET, verify server exits
- [ ] SEC-6: Access quiz without device_token cookie, verify 401

## Rollback Procedure

If issues arise:
1. Revert to previous version via Replit Checkpoint
2. Ensure all required env vars are set before redeploying

## Documentation Updated

- `docs/API_CONTRACT.md`: Added Security Expectations section
- `docs/RUNBOOK.md`: Added Production Environment Variables section
- `docs/TEST_PLAN.md`: Added Security Test Cases
- `docs/SCOPE_LOCK.md`: Added Security Constraints section
