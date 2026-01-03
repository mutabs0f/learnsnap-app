# LearnSnap - Arabic Quiz Generator

## Overview
LearnSnap is a mobile-first Arabic quiz generation app designed to transform textbook pages into interactive quizzes instantly. Users can upload photos of textbook pages, and the AI generates diverse quiz questions. The app operates on a pay-per-page model with robust user authentication, email verification, and a focus on preventing AI hallucinations. The business vision is to provide an accessible and engaging learning tool for Arabic students, leveraging AI to simplify content creation and enhance study efficiency.

## User Preferences
- Arabic RTL interface (Cairo font)
- Mobile-first responsive design
- No emojis in UI (use Lucide React icons)
- Clean, simple gradients for visual appeal

## System Architecture

### UI/UX Decisions
The application features a Duolingo-inspired design system with a focus on gamification. This includes a primary Nunito font, distinct button variants (`duoPrimary`, `duoBlue`, `duoOrange`) with 3D shadows and press effects, rounded corners, and button sound effects. Gamified components like `ProgressBar`, `ProgressRing`, `StreakCounter`, and `XPBadge` are integrated. The UI provides responsive design across iPhone, iPad, and other devices. Interactive lesson steps include practice questions and encouraging feedback messages in Arabic.

### Technical Implementations
LearnSnap is built with a React + Vite frontend, an Express.js backend, and a PostgreSQL database utilizing Drizzle ORM. Styling is managed with Tailwind CSS and shadcn/ui components. The application uses a 6-layer validation system to prevent AI hallucination, incorporating text extraction, evidence micro-checks, dual-validator grounding (GPT-4o-mini + Claude Haiku), adaptive vision spot-checks, selective question regeneration, and user-friendly error messages for re-capture. Security features include CSRF protection, API versioning, request ID tracking, enhanced logging, and server-side payment configuration.

### Feature Specifications
- **User Authentication**: Email/password registration, Google OAuth, email verification via Resend, 30-day session duration, password reset.
- **Quiz Generation**: AI-powered generation of 10 diverse questions (MCQ, True/False, Fill-in-blank, Matching) from uploaded images. AI models act as certified professional teachers using formal Arabic (`فصحى`).
- **Payment System**: Integration with Paylink payment gateway for pay-per-page transactions, including webhook idempotency, server-side package configuration, and refund handling. Supports mada, Visa, Mastercard, STC Pay, Apple Pay. New users receive 2 free pages, with a bonus for early adopters.
- **Reliability**: Database performance indexes, robust error handling with Arabic messages, request validation with Zod, rate limiting, AI retry logic with exponential backoff, concurrent AI request limiting, and structured logging.
- **Gamification**: XP and streak display, 3-burst confetti for correct answers, and interactive lesson steps with encouraging feedback.

### System Design Choices
The system employs a micro-check and adaptive validation pipeline for AI-generated content, ensuring grounding in source material. Data is stored in PostgreSQL with Drizzle ORM, with a focus on efficient indexing for performance. Authentication uses session-based JWT tokens. Payments are managed server-side to prevent client-side manipulation. The system also includes graceful shutdown handling and comprehensive health checks.

### v2.8 Queue-based Processing
- **Bull/Redis Queue**: Quiz generation can be processed via a dedicated worker for improved reliability and scalability.
- **Worker Entrypoint**: `server/worker.ts` - run separately with `npx tsx server/worker.ts`.
- **Idempotency Cache**: SHA-256 hash of deviceId:sessionId:requestId, 30min TTL, prevents duplicate requests.
- **Extraction Cache**: Pipeline-versioned (v2.8), 14-day TTL, caches Vision/OCR results per image hash.
- **New Endpoints**: `/api/quiz/job/:jobId/status` and `/api/quiz/job/:jobId/result`.
- **Upload Limits**: MAX 20 images, 8MB binary per image (~220MB total request including Base64 encoding).
- **Security**: ENCRYPTION_KEY now required in production (throws error if missing).
- **Graceful Fallback**: If Redis unavailable, processes in-process (existing behavior).

### v2.9 GO - Production Launch
- **GO-1 Credit Fairness**: Credits charged ONLY on successful quiz generation.
  - Worker and fallback processQuizAsync charge credits via `storage.usePageCredits()` on completion.
  - Client no longer deducts credits locally on upload; instead fetches from server when quiz is ready.
  - Metrics track `notChargedValidationUnavailable`, `notChargedServiceError`, `notChargedRaceCondition`.
- **GO-2 Progress Tracking**: Real-time progress visible in quiz.tsx during processing.
  - 8 stages: تهيئة الطلب, تحسين الصور, قراءة النص, توليد الأسئلة, التحقق من الإجابات, التحقق من الجودة, حفظ النتائج, اكتمل.
  - ETA calculated from `metrics.averageProcessingTime` or fallback 12s/image.
  - Session-to-job mapping via `setSessionJobId/getSessionJobId`.
  - Progress stored via `setJobProgress/getJobProgress` for polling.
- **Credit Flow**: Upload → reserve (validate) → process → success? charge : refund not needed (never charged).

### v2.9.2 Security Hardening (CURRENT)
- **P0 FIX #1 - Remove Public ZIP Leak**: Deleted leaked source code ZIPs from `client/public/`
  - Removed: `learnsnap-paylink.zip`, `learnsnap-railway-final.zip`
  - Removed: `/download/learnsnap-paylink.zip` endpoint
- **P0 FIX #2 - BOLA Prevention**: Added device token verification to quiz session endpoints
  - Protected: `GET /api/quiz/:sessionId`, `POST /api/quiz/:sessionId/submit`, `GET /api/quiz/:sessionId/result`
  - Protected: `GET /api/quiz/job/:jobId/result`
  - New helper: `verifySessionDeviceToken()` for consistent enforcement
  - Validates both `x-device-id` header (direct comparison) and `x-device-token` (cryptographic)
- **P0 FIX #3 - Protected Metrics**: Removed public `/api/metrics` endpoint (use `/api/admin/metrics` with auth)
- **P0 FIX #4 - NOT NULL Constraints**: Added `.notNull()` to `quiz_sessions.device_id` and `transactions.device_id`
- **P1 FIX #1 - Foreign Key**: Added FK `page_credits.user_id → users.id` with ON DELETE SET NULL
- **P1 FIX #2 - Comprehensive Cleanup**: Expanded cleanup job to handle all expired data
  - Cleans: quiz_sessions, user_sessions, email_verification_tokens, pending_payments
  - Uses PostgreSQL advisory lock for multi-instance safety (Railway)
  - New method: `storage.cleanupAllExpiredData()`
- **P2 FIX - Performance Indexes**: Added indexes for cleanup and FK lookups
- **Migration Script**: `script/database-migration-v3.2.sql` - comprehensive security migration
- **Files Modified**: `server/routes.ts`, `shared/schema.ts`, `server/storage.ts`, `script/database-migration-v3.2.sql`

### v2.9.1 Payment Verification Fix
- **CRITICAL FIX - Frontend Not Calling Verify**: Fixed issue where frontend showed error instead of calling verify endpoint
  - Root cause: payment-success.tsx was checking for transactionNo first, and if missing, showed error without trying orderNumber lookup
  - Solution: Now calls /api/payment/verify with orderNumber even when transactionNo is missing
  - Backend looks up transactionNo from pending_payments table using orderNumber
- **Enhanced Logging**: Added detailed logging for pending payment lookup and verification failures
- **Files Modified**: `client/src/pages/payment-success.tsx`, `server/paylink-routes.ts`

### v2.9.0 Paylink Payment Credit Fix
- **CRITICAL FIX - Credits Not Added After Payment**: Fixed issue where credits weren't added after successful Paylink payment
  - Root cause: transactionNo stored in localStorage was lost when Apple Pay redirected via different browser context (WebView)
  - Solution: Added `pending_payments` table to store orderNumber → transactionNo mapping server-side
  - Verify endpoint now looks up transactionNo from database if not provided in request
- **New Database Table**: `pending_payments` - stores orderNumber, transactionNo, deviceId, pages, amount
- **New Storage Methods**: `createPendingPayment()`, `getPendingPaymentByOrderNumber()`, `updatePendingPaymentStatus()`
- **Payment Flow Now**: Create invoice → Save pending payment → Redirect → Return → Look up transactionNo → Verify → Add credits
- **Files Modified**: `shared/schema.ts`, `server/storage.ts`, `server/paylink-routes.ts`, `server/db.ts`

### v4.7 Critical Production Fixes
- **Fix #1 - Free Pages Not Showing**: Enhanced `initializeDeviceCredits()` to check early adopter status
  - Uses `countEarlyAdopters()` to determine free pages (50 vs 2)
  - Also fixed `usePageCredits()` to initialize with correct free pages
  - Added debug logging for credit initialization
- **Fix #2 - 6 Questions Instead of 20**: Added `generatePaddingQuestions()` function
  - Auto-generates filler questions when AI returns less than 20
  - Padding questions are based on lesson summary content
  - Ensures exactly 20 questions per quiz
- **Fix #3 - Upload Fails for 5+ Images**: Improved image compression and timeout
  - Reduced MAX_DIMENSION from 2048 to 1200 pixels
  - Added adaptive quality reduction (0.7 → 0.3) to target 200KB per image
  - Added 5-minute timeout for quiz creation endpoint
- **Files Modified**: `server/storage.ts`, `server/ai-service.ts`, `client/src/pages/upload.tsx`, `server/index.ts`

### v4.6 Credit Sync & 20 Questions Fix
- **CRITICAL FIX - Credits Not Showing**: Enhanced sync-credits to give free pages if user has 0
  - If device has no credits, automatically assigns free pages (50 for early adopters, 2 for others)
  - Uses `countEarlyAdopters()` to check eligibility
  - Uses `createOrUpdatePageCredits()` and `grantEarlyAdopterBonus()` for proper credit initialization
- **Frontend Credit Events**: Added `creditsUpdated` CustomEvent for real-time UI updates
  - auth.tsx and auth-callback.tsx dispatch event after sync
  - upload.tsx listens for event and updates pagesRemaining state
- **20 Questions Enforcement**: Enhanced AI prompts to generate exactly 20 questions
  - Clear breakdown: 8 MCQ, 6 True/False, 4 Fill-blank, 2 Matching
  - Warning messages in Arabic: "أقل من 20 سؤال = فشل!"
- **Navigation**: After login, users go directly to /upload instead of /
- **Files Modified**: `server/auth-routes.ts`, `client/src/pages/auth.tsx`, `client/src/pages/auth-callback.tsx`, `client/src/pages/upload.tsx`, `server/ai-service.ts`

### v4.5 Credit Sync Fix
- **CRITICAL FIX - Credits Not Showing**: Fixed bug where new users received 0 pages after login
  - Root cause: Credits were stored on temp deviceId (`google_{userId}`), but frontend used browser's deviceId
  - Solution: Added `sync-credits` endpoint that transfers credits from temp device to browser's device
- **New Storage Methods**: `getPageCreditsByUserId()`, `transferCreditsToDevice()`
- **New Endpoint**: `POST /api/auth/sync-credits` - Syncs credits after login
- **Frontend Updates**: auth-callback.tsx and auth.tsx now call sync-credits after successful login
- **Files Modified**: `server/storage.ts`, `server/auth-routes.ts`, `client/src/pages/auth-callback.tsx`, `client/src/pages/auth.tsx`

### v4.4 Production Fixes
- **Fix #1 - Payload Size**: Increased from 10mb to 50mb for JSON/urlencoded, 85mb for quiz create (11+ images)
- **Fix #2 - Grammar Validation**: Added `validateQuestionGrammar()` and `filterValidQuestions()` in ai-service.ts for word order questions
- **Fix #3 - Text Direction**: Added `getTextDirection()` function for auto RTL/LTR based on content
- **Fix #4 - Early Adopter**: EARLY_ADOPTER_LIMIT=30, EARLY_ADOPTER_FREE_PAGES=50, DEFAULT_FREE_PAGES=2
  - First 30 users get 50 free pages
  - All other users get 2 free pages
- **Fix #5 - Question Formatting**: Added `formatQuestionText()` helper to clean numbering and fix punctuation
- **Grammar Rules in system-prompts.ts**: 8 rules for question/answer quality
- **20 Questions Enforcement**: Explicit requirement in system prompts
- **Files Modified**: `server/index.ts`, `server/auth-routes.ts`, `server/storage.ts`, `server/prompts/system-prompts.ts`, `server/ai-service.ts`, `client/src/pages/quiz.tsx`

### v4.3 Smart Question Generation
- **Subject Detection**: Auto-detects English, Math, Science, Arabic content from extracted text
- **English Skills Focus**: For English content, generates grammar/vocabulary skill questions, not content recall
- **Anti-Story Pattern**: Filters out story-based questions with fictional character names
- **Bloom's Taxonomy**: Proper distribution (Remember 20%, Understand 30%, Apply 25%, Analyze 15%, Evaluate 10%)
- **Security Hardening (v4.2)**: JWT enforcement, CSP hardening, input sanitization, rate limiting, password validation
- **Files Added**: `server/subject-detector.ts`, `server/prompts/system-prompts.ts`
- **Validation Pipeline**: Subject detection → Smart prompts → Anti-pattern filtering → Confidence scoring

## External Dependencies

- **AI Services**: Gemini Flash (primary), GPT-4o mini (fallback), Claude Sonnet (final fallback) for quiz generation and validation.
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Email Service**: Resend (for email verification and communication).
- **Authentication**: Google OAuth 2.0.
- **Payment Gateway**: Paylink (Saudi payment gateway supporting mada, Visa, Mastercard, Apple Pay, STC Pay).
- **Monitoring**: Sentry (optional, for error tracking).
- **Testing**: Playwright (for end-to-end testing).