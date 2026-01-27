# Architecture Decision Records (ADRs)

> **Version**: 2.9.26  
> **Last Updated**: January 8, 2026

## Overview

This document records significant architecture and technology decisions for LearnSnap. Each decision follows the ADR format:

- **Status**: Proposed / Accepted / Deprecated / Superseded
- **Context**: Why this decision was needed
- **Decision**: What we decided
- **Consequences**: Trade-offs and implications

---

## ADR-001: Node.js with TypeScript

**Status**: Accepted  
**Date**: 2025-12 (Initial)

### Context
Need a runtime that supports:
- Fast development iteration
- Strong ecosystem for web apps
- AI SDK availability
- Team familiarity

### Decision
Use Node.js 20 with TypeScript for the entire backend and frontend.

### Consequences
- **Positive**: Single language across stack, type safety, excellent tooling
- **Negative**: Not ideal for CPU-intensive work, but AI calls are I/O-bound
- **Mitigation**: Use Bull/Redis for background processing if needed

---

## ADR-002: Neon PostgreSQL

**Status**: Accepted  
**Date**: 2025-12 (Initial)

### Context
Need a database that:
- Scales with serverless workloads
- Has reasonable free tier
- Supports standard PostgreSQL features
- Works well with Railway

### Decision
Use Neon as the managed PostgreSQL provider.

### Consequences
- **Positive**: Serverless scaling, branching for dev, generous free tier
- **Positive**: Native WebSocket driver for serverless compatibility
- **Negative**: Cold start latency on first request
- **Mitigation**: Keep-alive connections, pooling configured

---

## ADR-003: Railway for Hosting

**Status**: Accepted  
**Date**: 2025-12 (Initial)

### Context
Need hosting that:
- Supports Node.js applications
- Has simple deployment from Git
- Provides HTTPS automatically
- Reasonable pricing

### Decision
Deploy to Railway with Nixpacks build.

### Consequences
- **Positive**: Simple git push deployments, auto-scaling, good DX
- **Positive**: Free database add-ons (though we use Neon)
- **Negative**: Less control than self-managed infrastructure
- **Mitigation**: Standard Node.js patterns work fine

---

## ADR-004: Gemini as Primary AI Provider

**Status**: Accepted  
**Date**: 2025-12 (Initial)

### Context
Need AI that:
- Handles Arabic text well
- Supports image understanding
- Has reasonable pricing
- Is reliable for production

### Decision
Use Google Gemini Flash as primary, with OpenAI and Anthropic fallbacks.

### Consequences
- **Positive**: Strong Arabic support, competitive pricing, fast responses
- **Positive**: Multi-provider fallback improves reliability
- **Negative**: Multiple API keys to manage
- **Mitigation**: Structured fallback chain in ai-service.ts

---

## ADR-005: Credits Owner ID System

**Status**: Accepted  
**Date**: 2026-01 (v2.9.16)

### Context
Original system linked credits via `user_id` column in `page_credits`. This caused:
- Credits bleeding between accounts
- Complex merge logic
- Race conditions in transfers

### Decision
Use a single `device_id` column with prefixed owner IDs:
- Guests: raw `device_id` (UUID)
- Users: `user_<userId>`

### Consequences
- **Positive**: Clear ownership, no ambiguity, simpler queries
- **Positive**: Easier idempotency for transfers
- **Negative**: Legacy `user_id` column still exists
- **Negative**: More complex initial implementation
- **Mitigation**: Documented in DATA_MODEL.md, tested extensively

---

## ADR-006: Paylink Payment Gateway

**Status**: Accepted  
**Date**: 2026-01

### Context
Need payment gateway that:
- Supports Saudi payment methods (mada, STC Pay)
- Has Arabic checkout experience
- Works for SAR currency
- Has webhook support

### Decision
Use Paylink as primary payment gateway.

### Consequences
- **Positive**: Native Saudi support, familiar UX for users
- **Positive**: Supports mada, Apple Pay, STC Pay
- **Negative**: Less documentation than Stripe
- **Mitigation**: Thorough error handling, webhook idempotency

---

## ADR-007: Session-Based Authentication

**Status**: Accepted  
**Date**: 2025-12

### Context
Need authentication that:
- Works with both email/password and OAuth
- Has reasonable session duration
- Is simple to implement

### Decision
Use session tokens stored in database with 30-day expiry.

### Consequences
- **Positive**: Simple, stateful sessions, easy to invalidate
- **Positive**: Works with Passport.js strategies
- **Negative**: Database query on every authenticated request
- **Mitigation**: Could add Redis caching if needed

---

## ADR-008: Drizzle ORM

**Status**: Accepted  
**Date**: 2025-12

### Context
Need ORM that:
- Has good TypeScript support
- Generates type-safe queries
- Works with Neon/PostgreSQL
- Is lightweight

### Decision
Use Drizzle ORM with Zod integration.

### Consequences
- **Positive**: Excellent TypeScript inference, lightweight
- **Positive**: drizzle-zod for schema validation
- **Negative**: Newer ecosystem, fewer examples
- **Mitigation**: Straightforward SQL-like API

---

## ADR-009: Winston Structured Logging

**Status**: Accepted  
**Date**: 2026-01

### Context
Need logging that:
- Supports structured data
- Rotates files
- Works in development and production

### Decision
Use Winston with daily file rotation.

### Consequences
- **Positive**: Structured JSON logs, easy parsing
- **Positive**: Configurable levels, file rotation
- **Negative**: Logs stored locally (Railway provides aggregation)
- **Mitigation**: Railway logs accessible via dashboard

---

## ADR-010: Mobile-First Arabic RTL Design

**Status**: Accepted  
**Date**: 2025-12

### Context
Primary users are:
- Arabic-speaking students
- Using mobile devices
- Expecting RTL interface

### Decision
Build mobile-first with RTL support, Cairo font, Duolingo-inspired gamification.

### Consequences
- **Positive**: Native feel for target audience
- **Positive**: Gamification increases engagement
- **Negative**: More complex CSS (RTL considerations)
- **Mitigation**: Tailwind RTL utilities, testing on RTL browsers

---

## ADR-011: Language-Aware Text Direction

**Status**: Accepted  
**Date**: 2026-01-08

### Context
AI-generated quiz content can be in English or Arabic. The app is globally RTL (Arabic), but English content should display LTR for proper readability.

### Decision
Implement dynamic text direction detection using Arabic character regex. Apply `direction` and `text-align` styles per content block.

```typescript
const getTextDirection = (text: string) => {
  const arabicRegex = /[\u0600-\u06FF]/;
  return arabicRegex.test(text) ? 'rtl' : 'ltr';
};
```

### Consequences
- **Positive**: English content reads naturally left-to-right
- **Positive**: Arabic content remains right-to-left
- **Positive**: Applied at content level, not container level
- **Negative**: Slight overhead for direction detection

---

## ADR-012: Webhook Pending Payment Fallback

**Status**: Accepted  
**Date**: 2026-01-08 (v2.9.26)

### Context
Paylink webhook handlers parse `deviceId` from the `note` field in webhook payload. If this parsing fails (corrupted data, Paylink bug, etc.), the webhook would fail with "missing_device_id" error, causing the customer to not receive their credits even though payment succeeded.

### Decision
Add fallback to `pending_payments` table lookup by `transactionNo` when note parsing yields no `deviceId`. The verify endpoint already had this fallback (line 445), but the webhook handler (line 569) did not.

### Consequences
- **Positive**: Payment credits reliably delivered even if note metadata is lost
- **Positive**: Consistent fallback pattern between webhook and verify endpoints
- **Positive**: Uses existing `pending_payments` table with correct owner ID
- **Negative**: Additional database query on fallback (rare case)

---

## Future Decision Slots

### ADR-013: [Reserved]
**Status**: Proposed  
**Topic**: Redis for caching/queuing

### ADR-014: [Reserved]
**Status**: Proposed  
**Topic**: CDN for static assets

### ADR-015: [Reserved]
**Status**: Proposed  
**Topic**: Subscription model addition

---

## Decision Log

| ADR | Date | Status | Summary |
|-----|------|--------|---------|
| 001 | 2025-12 | Accepted | Node.js + TypeScript |
| 002 | 2025-12 | Accepted | Neon PostgreSQL |
| 003 | 2025-12 | Accepted | Railway hosting |
| 004 | 2025-12 | Accepted | Gemini primary AI |
| 005 | 2026-01 | Accepted | Credits owner ID system |
| 006 | 2026-01 | Accepted | Paylink payments |
| 007 | 2025-12 | Accepted | Session-based auth |
| 008 | 2025-12 | Accepted | Drizzle ORM |
| 009 | 2026-01 | Accepted | Winston logging |
| 010 | 2025-12 | Accepted | Mobile-first Arabic RTL |
| 011 | 2026-01 | Accepted | Language-aware text direction |
| 012 | 2026-01 | Accepted | Webhook pending payment fallback |
