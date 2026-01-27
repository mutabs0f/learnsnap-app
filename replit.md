# LearnSnap - Arabic Quiz Generator

## Overview
LearnSnap is a mobile-first Arabic quiz generation application designed to convert textbook pages into interactive quizzes. Its primary purpose is to enhance learning for Arabic students by providing an accessible and engaging tool. The app utilizes AI to generate diverse quiz questions from uploaded images, operates on a pay-per-page model, and incorporates robust user authentication and AI hallucination prevention mechanisms. The business vision is to become a leading educational tool in the Arabic-speaking world, offering a unique blend of AI-powered content generation and gamified learning experiences to make studying more effective and enjoyable.

## User Preferences
- Arabic RTL interface (Cairo font)
- Mobile-first responsive design
- No emojis in UI (use Lucide React icons)
- Clean, simple gradients for visual appeal

## System Architecture

### UI/UX Decisions
The application features a Duolingo-inspired design with gamification elements like XP, streaks, and progress indicators. It uses the Nunito font, custom button variants with 3D effects, rounded corners, and shadow effects. The interface is responsive across various mobile devices and incorporates encouraging feedback messages in Arabic. Accessibility features include `aria-label` for icon-only buttons, `role="status"` for loading states, `role="progressbar"` for progress indicators, and logical `me-*`/`ms-*` for RTL support. Lazy loading is implemented for performance.

### Technical Implementations
LearnSnap is built with a React + Vite frontend, an Express.js backend, and a PostgreSQL database managed with Drizzle ORM. Styling is handled by Tailwind CSS and shadcn/ui. AI-generated content is validated through a 6-layer system, including dual-validator grounding (GPT-4o-mini + Claude Haiku), text extraction, and adaptive vision spot-checks to prevent hallucination. Security features include CSRF protection, API versioning, request ID tracking, device token verification, and a Redis-backed account lockout service. Quiz generation can be processed asynchronously via a Bull/Redis queue. Authentication supports email/password and Google OAuth, with email verification and password resets. Payment processing integrates with Paylink, featuring server-side processing and webhook idempotency. The system includes comprehensive error handling, Zod validation, rate limiting, AI retry logic with exponential backoff, concurrent AI request limiting, and structured logging. Gamification elements like XP and streaks are integrated. An admin support console provides tools for user management and audit logging. The architecture includes Prometheus metrics, memory watchdog, and feature flags for production readiness.

### Feature Specifications
- **User Authentication**: Email/password, Google OAuth, email verification, password reset, 30-day sessions, JWT-based admin authentication with RBAC.
- **Quiz Generation**: AI generates 20 diverse questions (MCQ, True/False, Fill-in-blank, Matching) from uploaded images, with subject detection, smart prompting, and grammar validation. Credit-based charging only on successful generation.
- **Payment System**: Integration with Paylink (mada, Visa, Mastercard, STC Pay, Apple Pay) for pay-per-page transactions, including free pages for new users.
- **Credit Ownership**: Credits are tied to `deviceId` for guests or `user_<USER_ID>` for logged-in users, with one-time guest credit transfer upon login.
- **Reliability**: Database performance indexes, robust error handling, Zod validation, rate limiting, AI retry logic, concurrent AI request limiting, graceful shutdown, health checks, and per-provider AI circuit breakers.
- **Gamification**: XP and streak display, confetti animations, interactive lesson steps.
- **Question Reports**: Users can report problematic questions.
- **Security Hardening**: Device token verification, NOT NULL/foreign key constraints, secure token handling, CSRF token rotation, stricter password reset rate limits, and XSS prevention.
- **Support Console**: Admin tools for user/device/transaction lookup, page granting/reversing, email management, with audit logging.
- **SRE & Observability**: Prometheus metrics, memory watchdog, feature flags, SLI/SLO definitions, enhanced health checks, and maintenance mode.

### System Design Choices
The system employs a micro-check and adaptive validation pipeline for AI-generated content. Data is persistently stored in PostgreSQL. Authentication relies on session-based JWT tokens. Payments are managed server-side. Quiz generation can be queued for asynchronous processing, providing real-time progress tracking to users. API responses are standardized for consistency.

## External Dependencies

- **AI Services**: Gemini Flash, GPT-4o mini, Claude Sonnet.
- **Database**: PostgreSQL.
- **ORM**: Drizzle ORM.
- **Email Service**: Resend.
- **Authentication**: Google OAuth 2.0.
- **Payment Gateway**: Paylink.
- **Monitoring**: Sentry (optional), Prometheus.
- **Testing**: Playwright.