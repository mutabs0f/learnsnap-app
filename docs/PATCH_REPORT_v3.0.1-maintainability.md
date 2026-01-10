# Maintainability Patch Report v3.0.1

**Date**: January 9, 2026  
**Version**: 3.0.1-maintainability  
**Scope**: Real API/Paylink smoke tests, CI/E2E workflow fixes, version traceability

---

## Summary

| Item | Status | Notes |
|------|--------|-------|
| Tests deterministic | ✅ Done | ENV setup before imports |
| API smoke tests (real routes) | ✅ Done | 7 tests with real endpoints |
| Paylink tests (real routes) | ✅ Done | global.fetch mocked, not router |
| CI workflow fix | ✅ Done | Removed --passWithNoTests |
| E2E workflow fix | ✅ Done | Jobs disabled with `if: false` |
| Version traceability | ⚠️ Manual | See "User Action Required" below |

---

## ⚠️ User Action Required

**package.json cannot be edited by the agent.** Please update manually:

```bash
# In package.json, line 3, change:
"version": "2.9.21",
# To:
"version": "3.0.1",
```

After this change, version traceability will be complete:
- package.json: 3.0.1 ✅
- CHANGELOG.md: 3.0.1 ✅

---

## Changes Implemented

### A) Deterministic Tests

**File**: `server/__tests__/smoke.test.ts`

Added `beforeAll` hook to set required environment variables before any imports:

```typescript
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long-for-security';
  process.env.DEVICE_TOKEN_SECRET = 'test-device-token-secret-32chars';
});
```

---

### B) Real API Smoke Tests

**File**: `server/__tests__/api-smoke.test.ts`

Uses real route registration with mocked dependencies:

```typescript
// Import and register actual routes
const { registerRoutes } = await import('../routes');
await registerRoutes(httpServer, app);
```

**Mocking Strategy** (vi.mock, no new dependencies):
- `../storage` - Full mock with Paylink functions
- `../db` - Mocked to prevent DB connections
- `../auth-routes` - Mocked registerAuthRoutes
- `../audit-logger` - Mocked auditLog, checkAndIncrementQuota
- `../queue-service` - Mocked queueService
- `../email-service` - Mocked sendQuestionReportNotification
- `global.fetch` - Mocked per-test for Paylink API simulation

### C) Real Paylink Tests

**No vi.mock('../paylink-routes')** - routes are real, only `global.fetch` is mocked:

```typescript
// Paylink test credentials (dummy values)
process.env.PAYLINK_API_ID = 'test-api-id';
process.env.PAYLINK_SECRET_KEY = 'test-secret-key';
process.env.APP_URL = 'https://test.learnsnap.app';
process.env.PAYLINK_ENVIRONMENT = 'testing';

// Mock global.fetch for Paylink API
global.fetch = vi.fn()
  .mockResolvedValueOnce({ ok: true, json: () => ({ id_token: 'mock-token' }) })
  .mockResolvedValueOnce({ ok: true, json: () => ({ success: true, url: '...' }) });
```

**Tests (3 Paylink-specific)**:
1. `POST /api/payment/create` → 400 for missing packageId/deviceId
2. `POST /api/payment/create` → 200 with paymentUrl (mocked fetch)
3. `GET /api/billing/packs` → returns package list

**Storage Mocks Extended for Paylink**:
```typescript
createPendingPayment: vi.fn().mockResolvedValue({ id: 'pending-1' }),
updatePendingPaymentStatus: vi.fn().mockResolvedValue(undefined),
getPendingPaymentByOrderNumber: vi.fn().mockResolvedValue(null),
upsertWebhookEventForProcessing: vi.fn().mockResolvedValue({ status: null, canProcess: true }),
updateWebhookEventStatus: vi.fn().mockResolvedValue(undefined),
getTransactionByPaymentId: vi.fn().mockResolvedValue(null),
createTransactionAndAddCredits: vi.fn().mockResolvedValue({ id: 'tx-1' }),
```

---

### D) CI Workflow Fix

**File**: `.github/workflows/ci.yml`

Changed:
```yaml
# Before
run: npx vitest run --passWithNoTests

# After
run: npx vitest run server/__tests__
```

Added `DEVICE_TOKEN_SECRET` to test environment variables.

---

### E) E2E Workflow Fix

**File**: `.github/workflows/e2e-tests.yml`

All jobs disabled with `if: false` and clear comments:

```yaml
e2e-tests:
  if: false  # Disabled: e2e/specs/ folder does not exist
```

Added placeholder job to ensure workflow always has at least one active job.

---

## Test Commands

```bash
# Run all backend tests
npx vitest run server/__tests__

# Run specific test file
npx vitest run server/__tests__/api-smoke.test.ts

# Run with watch mode
npx vitest server/__tests__

# Run with UI
npx vitest --ui
```

---

## Test Results

```
✓ server/__tests__/smoke.test.ts (7 tests) 293ms
✓ server/__tests__/api-smoke.test.ts (7 tests) 1362ms

Test Files  2 passed (2)
     Tests  14 passed (14)
Duration    2.79s
```

---

## Gate Verification

### Gate A - Tests Passing
- [x] All 14 tests pass
- [x] No DB dependency in tests
- [x] Tests work with empty DATABASE_URL
- [x] Paylink tests use real routes (not mocked router)
- [x] global.fetch mocked for network isolation

### Gate B - CI Workflow
- [x] ci.yml runs correct test command
- [x] Required env vars set (SESSION_SECRET, DEVICE_TOKEN_SECRET)
- [x] No --passWithNoTests flag

### Gate C - E2E Workflow
- [x] All jobs disabled with `if: false`
- [x] Clear comments explaining why
- [x] Placeholder job ensures workflow validity

### Gate D - Version Traceability
- [x] CHANGELOG.md = 3.0.1
- [ ] package.json = 3.0.1 ← **User action required**

---

## Files Changed

| File | Change |
|------|--------|
| `server/__tests__/smoke.test.ts` | Deterministic env setup |
| `server/__tests__/api-smoke.test.ts` | Real Paylink routes with mocked fetch |
| `.github/workflows/ci.yml` | Fixed test command |
| `.github/workflows/e2e-tests.yml` | Disabled all jobs |
| `CHANGELOG.md` | Added v3.0.1 entry |
| `docs/PATCH_REPORT_v3.0.1-maintainability.md` | This file |
| `docs/TEST_PLAN.md` | Updated test documentation |

---

## No Behavior Change Guarantee

All changes in this patch are:
1. **Test infrastructure** - New test files and mocks
2. **CI configuration** - Workflow file changes
3. **Documentation** - Changelog and patch report

Production code unchanged. No endpoints modified. No business logic altered.

---

## What Remains (Not Implemented)

- **P0.2**: Zod schema extraction (requires explicit request)
- **P0.3**: routes.ts organization (requires explicit request)
- **E2E test specs**: Require actual test file creation in e2e/specs/
- **package.json version**: User must manually change to 3.0.1
