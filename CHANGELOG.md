# Changelog

All notable changes to LearnSnap will be documented in this file.

## [3.5.4] - 2026-01-10

### Security - Production Hardening (P0 Critical)

- **FIX #1 (P0)**: Quiz generation no longer falls back to local in-process async when Redis is down in production
  - Returns 503 with `REDIS_UNAVAILABLE` code instead of risking OOM/latency collapse
  - Dev mode retains local fallback behavior for testing convenience
  - File: `server/routes/quiz.routes.ts`

- **FIX #2 (P0)**: `/health/ready` now returns 503 when Redis is required but unreachable in production
  - Prevents load balancers from routing traffic to unhealthy instances
  - Redis reachability is checked via actual ping, not just URL presence
  - File: `server/routes/health.routes.ts`

### Changed
- Version bumped to 3.5.4 in health endpoints
- Added `isRedisAvailable` import to health routes

### Risk Prevented
- OOM crashes from in-process quiz generation under load
- Traffic routing to degraded instances during Redis outages
- Silent failures in production environment

## [3.0.3] - 2026-01-09

### Security
- **Chart ID Sanitization**: Added regex sanitization for chart IDs in `chart.tsx` to prevent CSS injection
- **XSS Surface Documentation**: Documented all `dangerouslySetInnerHTML` usage with mitigation strategies
- **CSRF Coverage Documentation**: Documented protected vs unprotected endpoints with rationale

### Reliability
- **In-Memory Cache Cap**: Added 10,000 entry limit to Redis fallback cache to prevent memory exhaustion
- **Failure Mode Documentation**: Added runbook sections for Redis/AI/Paylink outages

### Quality
- **Frontend Tests in CI**: Added frontend smoke tests to GitHub Actions workflow
- **Legacy Code Deprecation**: Marked `/learnsnap/` folder as deprecated with clear README

### Documentation
- Updated `docs/ARCHITECTURE.md` with security coverage details
- Updated `docs/RUNBOOK.md` with failure mode documentation
- Created `docs/PATCH_REPORT_v3.0.3-quality.md`

### Notes
- Zero behavior changes - pure quality improvements
- All tests pass (backend + frontend)
- Manual step required: Update `package.json` version to 3.0.3

## [3.0.2] - 2026-01-09

### Added - Maintainability & Regression Tests
- **Backend Regression Tests**: Created `server/__tests__/api-regression.test.ts` with 15 tests
- **Frontend Smoke Tests**: Created `client/src/__tests__/smoke.test.tsx` with 4 component tests
- **Frontend Test Config**: Added `vitest.config.frontend.ts` for jsdom environment

### Testing Coverage
- Credits API isolation (A1-A3)
- Admin gating verification (C1-C4)
- Quota enforcement (D1)
- Webhook signature validation (E1-E3)
- Auth-routes isolation (B1)

### Notes
- Zero behavior changes - tests verify existing code
- All 33 tests pass (29 backend + 4 frontend)

## [3.0.1] - 2026-01-09

### Added - Maintainability & Test Infrastructure
- **Smoke Tests**: Created `server/__tests__/smoke.test.ts` with 7 deterministic tests
- **API Smoke Tests**: Created `server/__tests__/api-smoke.test.ts` with 5 endpoint tests
- **Environment Helper**: `server/env-helpers.ts` centralizes `DEVICE_TOKEN_SECRET` fallback logic

### Changed
- **Test Determinism**: Tests now set `NODE_ENV=test` and required secrets before imports
- **DRY Improvement**: Removed 10+ duplicate secret fallback patterns across routes

### Documentation
- Updated `docs/TEST_PLAN.md` with automated test instructions
- Updated `docs/PATCH_REPORT_v3.0.1-maintainability.md` with all changes

### Notes
- Zero behavior changes - pure maintainability improvements
- All 12 tests pass: `npx vitest run server/__tests__`
- Builds on Enterprise v3.0.0 (audit logging, quotas, cookie auth)

## [2.9.31b] - 2026-01-08

### Fixed - Quiz Score Denominator Bug

- **FIX (P0)**: Quiz results now show correct total questions
  - `updateQuizSessionContent()` now sets `totalQuestions` to actual `questions.length`
  - Previously used default value (10) instead of actual AI-generated count
  - Example: Quiz with 13 questions now shows "X من 13" instead of "X من 20"

### Changed
- `server/storage.ts` - Added `totalQuestions: questions.length` to updateQuizSessionContent

## [2.9.31a] - 2026-01-08

### Fixed - Minimal UX Correctness Patch

- **FIX #1 (P0)**: 402 message now uses TRUE server credits
  - `fetchCreditsFromServer()` now returns the fetched value
  - 402 handler uses returned value directly instead of stale React state
  - Guarantees accurate "لديك X صفحات" message

- **FIX #2 (P1)**: Documentation accuracy
  - Removed inaccurate "No 404 errors" claim
  - Clarified that audio uses WebAudio fallback; if mp3 assets are absent, the app may attempt to fetch them once then falls back gracefully

- **FIX #3 (P1)**: Payment success credits fetch hardening
  - Added `credentials: "include"` to both GET /api/credits calls in payment-success.tsx

### Changed
- `client/src/pages/upload.tsx` - fetchCreditsFromServer returns value, 402 uses it
- `client/src/pages/payment-success.tsx` - credentials:"include" on credits fetches
- `PATCH_REPORT.md` - v2.9.31a section added

## [2.9.31] - 2026-01-08

### Fixed - P0/P1 Bug Fixes

- **P0.1 Credits Mismatch Fix**: 
  - Added `credentials: "include"` to credits fetch
  - Removed localStorage fallback - shows 0 instead of stale cached value
  - 401 handler clears authToken and redirects to /auth with clear message
  - 402 handler fetches fresh credits and shows accurate "رصيد غير كافٍ" message

- **P0.2 Device Token Fix**:
  - Removed reliance on `document.cookie` (HttpOnly cookies not accessible)
  - Added sessionStorage flag to prevent duplicate device/issue calls
  - Ensure deviceId created before any API calls

- **P0.3 Sound Fallback Fix**:
  - Added WebAudio API fallback for missing mp3 files
  - Audio files now load asynchronously with error handling
  - Audio uses WebAudio fallback; if mp3 assets are absent, the app may attempt to fetch them once then falls back gracefully
  - Beep sounds: correct (880Hz), wrong (220Hz), click (440Hz)

- **P1 Cancel/Progress UX**:
  - Added AbortController for cancellable quiz generation
  - Added elapsed time counter (MM:SS) during processing
  - Added "إلغاء" cancel button
  - Retry works immediately after cancel or failure

### Changed
- `client/src/App.tsx` - Device token initialization improvements
- `client/src/pages/upload.tsx` - Credits handling and cancel UX
- `client/src/pages/quiz.tsx` - WebAudio sound fallback

## [2.9.23] - 2026-01-07

### Fixed - Schema Drift & Data Integrity
- 🔴 **Schema Drift Fix**: Added `credit_transactions` table to `shared/schema.ts` to match existing database
- 🔴 **Database Safety Constraints**: Added CHECK constraints to prevent invalid data:
  - `page_credits.pages_remaining >= 0` - Prevents negative page counts
  - `page_credits.total_pages_used >= 0` - Ensures usage tracking is non-negative
  - `transactions.pages_purchased > 0` - Ensures valid purchases
  - `transactions.amount >= 0` - Prevents negative payment amounts

### Improved
- **Structured Logging**: Enhanced credit operations with Winston structured logging
  - `usePageCredits()` now logs: operation, ownerId, pagesUsed, pagesBefore, pagesAfter
  - `createTransactionAndAddCredits()` now logs: operation, ownerId, pagesAdded, paymentId, transactionId
  - All logs use truncated ownerId for security (first 12 chars + "...")
- **Logger Version**: Updated to 2.9.23

### Added
- `script/database-migration-v2.9.23-safety.sql` - Migration file for CHECK constraints

### Verified
- ✅ All code paths use correct ownerId pattern (user_<id> for logged-in, deviceId for guests)
- ✅ routes.ts, auth-routes.ts, worker.ts, paylink-routes.ts all consistent

## [2.9.22] - 2026-01-07

### Fixed - Critical Worker Credits Bug
- 🚨 **Worker Credit Charging**: Worker now uses correct owner ID (`user_<id>` for logged-in users, `deviceId` for guests)
- Previously, worker was charging credits from raw `deviceId` instead of `user_<userId>` for logged-in users
- This caused credits to be deducted from wrong account when using Redis queue

### Changed
- `QuizJobData` interface now includes `userId` field in both `worker.ts` and `queue-service.ts`
- `queueQuizGeneration()` now accepts `userId` parameter (optional)
- Worker calculates `creditOwnerId = userId ? 'user_' + userId : deviceId` before charging
- Added structured logging with `creditOwnerId` and `isLoggedInUser` flags
- `routes.ts` now passes `quizUserId` to queue function

### Technical Details
- This fix completes the v2.9.16 Credit Owner System by ensuring queued jobs use the correct owner
- Fallback in-process mode was already fixed; this fixes the Redis queue path

## [2.9.21] - 2026-01-07

### Fixed - Critical Issues
- 🔴 **Quiz Not Found Fix**: Quiz page now polls while `status: "processing"` instead of showing "Quiz not found"
- Added proper loading UI for quiz generation in progress
- Added error UI for failed quiz generation (timeout, service_error)
- Quiz page now auto-refreshes every 2 seconds while waiting for quiz to be ready

### Changed
- `quiz.tsx` useQuery now uses `refetchInterval` to poll while processing
- Proper handling of all quiz status states: processing, pending, ready, error, timeout

## [2.9.20] - 2026-01-07

### Fixed - Critical Issues
- 🔴 **Account Bleed Fix**: `dashboard.tsx` logout now clears ALL auth data (authToken, userId, userName, pagesRemaining)
- 🔴 **Payment Cookie Fix**: Added `credentials: "include"` to payment/create and payment/verify requests
- 🔴 **Payment Auth Fix**: Added Authorization header to payment verification for logged-in users
- 🔴 **Credits Cookie Fix**: Added `credentials: "include"` to credits fetch in pricing page

### Changed
- `dashboard.tsx` handleLogout now matches `landing.tsx` behavior
- All payment-related fetch calls now include cookies for device_token verification

## [2.9.19] - 2026-01-07

### Fixed - Critical Issues
- 🔴 **Quiz 402 Error**: Added Authorization header to `apiRequest()` and `getQueryFn()` - quiz creation now uses correct user credits (user_<id>)
- Logged-in users now properly send auth token with all API requests

### Changed
- `apiRequest()` now sends Authorization header automatically for logged-in users
- `getQueryFn()` also sends Authorization header for query requests

## [2.9.18] - 2026-01-07

### Fixed - Tailwind CSS Build
- 🔴 **CSS Missing on Production**: Added `client/postcss.config.cjs` for Vite to find Tailwind
- 🔴 **Build Pipeline**: Added `client/tailwind.config.ts` so Vite can process Tailwind directives
- Build time should now be longer (processing all Tailwind classes)

### Added
- `client/postcss.config.cjs` - PostCSS config for Vite
- `client/tailwind.config.ts` - Tailwind config in client root
- `postcss.config.cjs` - Root PostCSS config (backup)

## [2.9.17] - 2026-01-07

### Fixed - Final Credit System Fixes
- 🔴 **52 vs 50 Pages Bug**: Guest transfer now only moves EXCESS credits above free allocation (2 pages)
- 🔴 **Data Pollution**: Disabled `linkDeviceToUser()` - `user_<id>` is now the sole credit owner
- 🔴 **Payment Reliability**: `pendingPayment` now stores `targetOwnerId` instead of raw `deviceId`
- 🔴 **304 Error Fix**: Disabled ETag for API routes + added no-cache headers

### Changed
- `transferGuestCreditsToUserOwner()` now calculates: `transferAmount = max(0, guestPages - FREE_PAGES_GUEST)`
- `linkDeviceToUser()` is now a no-op (disabled)
- API routes return `Cache-Control: no-store` headers
- Client-side fetch now uses `cache: 'no-store'` to prevent 304 errors

### Removed
- Removed legacy device-to-user linking in `page_credits` table

## [2.9.16] - 2026-01-07

### Fixed - CRITICAL Credit Owner System
- 🚨 **Credit Owner ID System**: Complete overhaul of credit ownership to prevent leakage between accounts.
  - Guests use `deviceId` as their credit owner.
  - Logged-in users use `user_<USER_ID>` as their credit owner (separate row in page_credits).
  - Credits are NEVER transferred by modifying `user_id` on deviceId rows.
- 🚨 **One-Time Guest Transfer**: When user logs in, guest credits are transferred ONLY ONCE (idempotent).
- 🚨 **Payment Credits Fix**: Payments now credit to `user_<id>` for logged-in users, ensuring payment reflects immediately.
- 🚨 **Quiz Credit Charging**: Quiz generation now charges from correct owner (user or guest device).

### Added
- `getCreditOwnerId()` - Determines correct ownerId based on userId
- `transferGuestCreditsToUserOwner()` - One-time idempotent guest-to-user credit transfer
- `initializeUserOwnerCredits()` - Grants early adopter bonus to user owner record
- `getCreditsForOwner()`, `useCreditsForOwner()`, `addCreditsForOwner()` - Owner-aware credit operations

### Changed
- `/api/auth/sync-credits` - Now uses owner ID system
- `/api/credits/:deviceId` - Returns credits based on Authorization header
- `/api/payment/create` - Sets targetOwnerId to `user_<id>` for logged-in users
- `processQuizAsync()` - Now accepts userId and charges credits from correct owner

### Migration
- Run `scripts/credits-migration-v2.9.16.sql` to create `credit_transactions` table for idempotency

## [2.9.15] - 2026-01-05

### Fixed - CRITICAL Race Conditions
- 🚨 **Atomic Credit Grant**: Registration bonuses now use `pg_advisory_xact_lock` to prevent race conditions.
- 🚨 **Fixed Double Grant**: Multiple concurrent requests can no longer grant duplicate bonuses.
- 🚨 **Fixed Credit Summing**: `getUserCreditBalance` now returns MAX instead of SUM across devices.
- 🚨 **Idempotent Grants**: All bonus grants are now idempotent - safe to retry.
- Added database constraints to prevent duplicate registration bonuses.

## [2.9.14] - 2026-01-05

### Fixed
- 🚨 **Critical**: Clear `pagesRemaining` from localStorage on logout to prevent stale data.
- 🚨 **Critical**: Upload page now waits for server response before showing credits (no stale localStorage).
- Added loading state while fetching credits.
- Added debug logs for credit sync troubleshooting.

## [2.9.13] - 2026-01-05

### Fixed
- 🚨 **Critical Credit Sync Bug (FINAL FIX)**: Fixed issue where logging into account B after account A would show account A's credits.
- Root cause: `/api/credits/:deviceId` was reading stale `userId` from database instead of current logged-in user.
- Solution: Now checks Authorization header to get CURRENT user's session, not stored userId.
- `upload.tsx` now sends Authorization header with credits request.
- `sync-credits` also fetches user's credits from ALL linked devices.

## [2.9.12] - 2026-01-05

### Fixed
- 🚨 **Critical Fix**: Quiz page now sends `x-device-id` header to server - fixes "لم يتم العثور على الاختبار" error.
- Improved mobile responsiveness for quiz options.
- Better feedback visuals for correct/incorrect answers.

### Added
- 🎨 **Duolingo-style UI/UX**: Complete redesign of the quiz page with animated progress bars, feedback banners, and distinct question cards.
- Duolingo color palette added to `tailwind.config.ts`.

## [2.9.11] - 2026-01-05
- Added comprehensive idempotency protection for credit grants with `credit_transactions` audit table.
- Fixed critical `transferCreditsToDevice` double-counting bug preventing credit leak.
- Created `credit_transactions` table with idempotency tracking for registration bonuses.
- Improved empty question handling with better toast notifications.
### Added
- 🎨 **Duolingo-style UI/UX**: Complete redesign of the quiz page with animated progress bars, feedback banners, and distinct question cards.
- Duolingo color palette added to `tailwind.config.ts`.

### Fixed
- Improved mobile responsiveness for quiz options.
- Better feedback visuals for correct/incorrect answers.

## [2.9.11] - 2026-01-05
### Fixed
- 🚨 **Critical Credit Leak**: Added idempotency protection to prevent duplicate credit grants on registration and sync.
- **Empty Question UI**: Improved handling of incomplete AI-generated questions to prevent quiz blocking.
- Added `credit_transactions` table for audit trail and idempotency.

### Changed
- `sync-credits` now requires a transaction check before granting early adopter or registration bonuses.
- Improved toast notifications for quiz completion when some questions are invalid.

## [2.9.10] - 2026-01-05
### Fixed
- 🚨 **Critical Credit Leak**: Fixed transferCreditsToDevice double-counting browserDevice credits
- Email registration now grants pages to temp device (email_userId) instead of browserDevice directly
- This prevents users from getting 100+ pages instead of 50

### Changed
- transferCreditsToDevice now only transfers from temp devices (google_/email_)
- Added detailed logging for credit transfers

## [2.9.9] - 2026-01-05

### Fixed
- RangeNotSatisfiableError on static files (disabled range requests)
- Double-grant bug in sync-credits endpoint
- Chunk loading error handling with auto-reload
- Guest devices now always get 2 pages (not early adopter bonus)

### Changed
- API responses include no-cache headers to prevent 304 issues
- Credits operations log warnings when replacing values
- Improved error messages in Arabic

### Security
- Added logging for credit balance changes

## [2.9.8] - 2026-01-04

### Fixed
- Initial bug fixes for production deployment
