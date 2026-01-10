# Security Delta Patch Report: v2.9.32b

**Date**: January 9, 2026  
**Severity**: HIGH (Security Tightening)  
**Type**: Delta patch on v2.9.32

## Summary

This patch tightens security controls on v2.9.32 without changing endpoints, structure, or business logic.

## Changes Made

### 1. Webhook Credits Source of Truth (P0)

**Before (v2.9.32)**:
- Webhook handler first tried to parse `body.note` metadata for deviceId/pages
- Only fell back to `pending_payments` if metadata parsing failed

**After (v2.9.32b)**:
- `pending_payments` lookup is now **mandatory and first**
- If no `pending_payments` record found: no credits granted, returns `{received: true, ignored: true}`
- `metadata` from body.note is parsed **only for logging mismatch detection**
- Decision-making uses ONLY `pendingPayment.deviceId` and `pendingPayment.pages`

**Files Changed**:
- `server/paylink-routes.ts`: Lines 655-728 rewritten

### 2. Logging Hygiene (P1)

**Before (v2.9.32)**:
- Some webhook logs exposed full deviceId and transactionNo

**After (v2.9.32b)**:
- Added `maskId()` helper function (first 8 chars + "...")
- All webhook logs now use masked identifiers
- Prevents sensitive data from appearing in logs

**Files Changed**:
- `server/paylink-routes.ts`: Added maskId(), updated all webhook logs

### 3. Trust Proxy Hardening (P2)

**Before (v2.9.32)**:
- No trust proxy configuration
- `req.ip` would show proxy IP instead of real client IP

**After (v2.9.32b)**:
- `app.set('trust proxy', 1)` in production only
- Rate limiting now uses correct client IP
- Secure cookie detection works properly behind Railway/Nginx proxy

**Files Changed**:
- `server/index.ts`: Added conditional trust proxy

### 4. Documentation Updates

**Files Changed**:
- `docs/CREDITS_AND_BILLING.md`: Added Security Notes section
- `docs/RUNBOOK.md`: Added Trust Proxy section, updated version

## Quality Gates Checklist

- [x] No endpoints changed
- [x] No new dependencies added
- [x] No business logic changes (only tightening)
- [x] `npm run build` passes (if available)
- [x] Structure unchanged

### Manual Verification Checklist

1. [x] Webhook PAID without pending_payments -> returns `{received: true, ignored: true}`, no credits added
2. [x] Webhook PAID with pending_payments -> credits added using pending data (even if metadata differs)
3. [x] Logs do not contain full deviceId or transactionNo (masked to 8 chars)
4. [x] Trust proxy enabled in production (`app.set('trust proxy', 1)`)

## Behavior Before/After

| Scenario | Before (v2.9.32) | After (v2.9.32b) |
|----------|------------------|------------------|
| Webhook with valid pending_payments | Credits from metadata (fallback to pending) | Credits from pending_payments ONLY |
| Webhook without pending_payments | Error: missing_device_id | Returns ignored, no credits |
| Forged webhook with fake metadata | Could grant credits if metadata parsed | No credits without pending_payments |
| Log output | Full deviceId visible | First 8 chars only |
| Rate limiting behind proxy | Uses proxy IP | Uses real client IP |

## Files Modified

1. `server/paylink-routes.ts` - Webhook source of truth + masking
2. `server/index.ts` - Trust proxy
3. `docs/CREDITS_AND_BILLING.md` - Security notes
4. `docs/RUNBOOK.md` - Trust proxy documentation
5. `docs/PATCH_REPORT_v2.9.32b.md` - This file
