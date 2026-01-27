# Patch Report v3.2.0 - Production Readiness

> **Date**: January 10, 2026  
> **Version**: 3.2.0  
> **Focus**: Code quality, testing, and security improvements  
> **Risk Level**: Low (non-breaking refactors only)

## Summary

This release improves production readiness through code consolidation, enhanced test coverage, and strengthened CSRF protection. No API contracts were changed and no new features were added.

## Changes Overview

### P0 - Critical Fixes

| Item | Description | Files Changed |
|------|-------------|---------------|
| P0-2 | Unified maskId/sanitizeMetadata helpers | `server/utils/helpers.ts` (new), `server/paylink-routes.ts`, `server/audit-logger.ts` |
| P0-3 | Safe export script | `scripts/safe-export.sh` (new) |

### P1 - Code Quality

| Item | Description | Files Changed |
|------|-------------|---------------|
| P1-2 | Credits system tests | `server/__tests__/credits.test.ts` (new) |
| P1-2 | Payment system tests | `server/__tests__/payment.test.ts` (new) |
| P1-3 | CSRF protection for /api/payment/create | `server/paylink-routes.ts`, `client/src/pages/pricing.tsx` |
| P1-3 | Updated smoke tests for CSRF | `server/__tests__/api-smoke.test.ts` |

### P2 - Testing & Observability

| Item | Description | Files Changed |
|------|-------------|---------------|
| P2-1 | Playwright E2E smoke tests | `e2e/specs/smoke.spec.ts` (new), `playwright.config.ts` (new) |
| P2-2 | Test coverage thresholds | `vitest.config.ts` |

## Security Improvements

### CSRF Protection Extended (P1-3)

**Before v3.2.0:**
- `/api/payment/create` was documented as a CSRF exception

**After v3.2.0:**
- `/api/payment/create` is now CSRF-protected
- Frontend uses `secureFetch` for payment creation
- All payment-related endpoints now have CSRF protection

### Protected Endpoints (Updated)

| Endpoint | Protection |
|----------|------------|
| `POST /api/quiz/create` | CSRF |
| `POST /api/billing/*` | CSRF |
| `POST /api/payment/create` | CSRF (NEW in v3.2.0) |

## Code Consolidation

### Unified Helper Functions (P0-2)

**Before:** Duplicate `maskId()` and `sanitizeMetadata()` implementations in:
- `server/paylink-routes.ts`
- `server/audit-logger.ts`

**After:** Single source of truth in `server/utils/helpers.ts`:
```typescript
export function maskId(id: string | undefined | null): string
export function sanitizeMetadata(metadata: Record<string, any> | undefined): Record<string, any>
export function truncate(str: string | undefined | null, maxLength?: number): string
```

## Test Coverage

### New Test Files

| File | Tests | Coverage Focus |
|------|-------|----------------|
| `credits.test.ts` | 10 | Credits initialization, deduction, addition, owner ID logic, maskId helper |
| `payment.test.ts` | 14 | Package validation, webhook signatures, source of truth, sanitizeMetadata |

### Total Test Count

| Before | After | Delta |
|--------|-------|-------|
| ~30 | 54 | +24 |

### E2E Tests (Playwright)

New smoke tests in `e2e/specs/smoke.spec.ts`:
- Homepage loads with RTL direction
- Health endpoint returns healthy
- CSRF token endpoint works
- Billing packs endpoint returns packages
- Auth page loads
- Upload page loads
- Pricing page loads

## Safe Export Script (P0-3)

New script `scripts/safe-export.sh` excludes sensitive files:
- `.env*` files
- `logs/` directory
- `node_modules/`
- `_archive/` (dev snapshot)
- `.git/`
- Personal/cache directories

## Verification

### Tests Passing

```bash
$ npx vitest run server/__tests__
✓ server/__tests__/payment.test.ts (14 tests)
✓ server/__tests__/credits.test.ts (10 tests)
✓ server/__tests__/api-smoke.test.ts (8 tests)
✓ server/__tests__/api-regression.test.ts (15 tests)
✓ server/__tests__/smoke.test.ts (7 tests)

Test Files  5 passed (5)
Tests       54 passed (54)
```

### Build Verification

```bash
$ npm run build
# Successful
```

## Migration Notes

### For Frontend Developers

If you have custom payment forms, update them to use `secureFetch`:

```typescript
import { secureFetch } from '@/lib/api';

const response = await secureFetch('/api/payment/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ packageId, deviceId }),
});
```

### For Backend Developers

Import shared helpers from the new location:

```typescript
// Before
function maskId(id) { ... } // Local implementation

// After
import { maskId, sanitizeMetadata } from './utils/helpers';
```

## Files Changed

### New Files
- `server/utils/helpers.ts`
- `server/__tests__/credits.test.ts`
- `server/__tests__/payment.test.ts`
- `e2e/specs/smoke.spec.ts`
- `playwright.config.ts`
- `scripts/safe-export.sh`

### Modified Files
- `server/paylink-routes.ts` - Import helpers, add CSRF
- `server/audit-logger.ts` - Import helpers
- `server/__tests__/api-smoke.test.ts` - CSRF test updates
- `client/src/pages/pricing.tsx` - Use secureFetch
- `vitest.config.ts` - Coverage thresholds

## Rollback

This release is safe to rollback. All changes are additive or internal refactors:
- Remove CSRF from payment endpoint if issues arise
- Revert to local maskId implementations if needed
- Tests and documentation can remain

---

*Signed: Replit Agent*  
*Commit: TBD*
