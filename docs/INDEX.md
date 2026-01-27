# LearnSnap Documentation Index

> **Version**: 3.2.0  
> **Last Updated**: January 10, 2026

## Quick Start

For new team members, read the documents in this order:

1. [PRD.md](./PRD.md) - Understand what we're building and why
2. [ARCHITECTURE.md](./ARCHITECTURE.md) - System overview and components
3. [DATA_MODEL.md](./DATA_MODEL.md) - Credits ownership model (critical)
4. [CREDITS_AND_BILLING.md](./CREDITS_AND_BILLING.md) - Billing rules and edge cases
5. [API_CONTRACT.md](./API_CONTRACT.md) - All API endpoints
6. [RUNBOOK.md](./RUNBOOK.md) - How to run and deploy

## Document Overview

| Document | Purpose | Audience |
|----------|---------|----------|
| [PRD.md](./PRD.md) | Product requirements, user flows, success metrics | PM, Engineering |
| [SCOPE_LOCK.md](./SCOPE_LOCK.md) | Change control rules, forbidden changes | Engineering |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, components, env vars | Engineering, DevOps |
| [DATA_MODEL.md](./DATA_MODEL.md) | Credits ownership model, invariants | Engineering |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | All database tables and columns | Engineering, DBA |
| [API_CONTRACT.md](./API_CONTRACT.md) | Complete API reference | Engineering, Frontend |
| [CREDITS_AND_BILLING.md](./CREDITS_AND_BILLING.md) | Credits rules, failure modes, debug queries | Engineering, Support |
| [PAYMENTS.md](./PAYMENTS.md) | Paylink integration, webhooks | Engineering |
| [RUNBOOK.md](./RUNBOOK.md) | Local setup, deployment, troubleshooting | Engineering, DevOps |
| [TEST_PLAN.md](./TEST_PLAN.md) | E2E test scenarios (Given/When/Then) | QA, Engineering |
| [DECISIONS.md](./DECISIONS.md) | Architecture Decision Records (ADRs) | Engineering |

## Critical Documents

These documents contain information about fragile systems. Read carefully before making changes:

- **DATA_MODEL.md** - Credits ownership is complex; changes can cause account bleed
- **CREDITS_AND_BILLING.md** - Contains invariants that must never be violated
- **SCOPE_LOCK.md** - Lists forbidden changes that require approval

## Patch Reports

Release notes for each version:

| Version | Date | Type | Description |
|---------|------|------|-------------|
| [v3.2.0](./PATCH_REPORT_v3.2.0-production-readiness.md) | Jan 10, 2026 | Production Readiness | Code consolidation, test coverage, CSRF for payments |
| [v3.1.1](./PATCH_REPORT_v3.1.1-maintainability.md) | Jan 10, 2026 | Maintainability | Duplicate folder cleanup, CI guardrail |
| [v3.1.0](./PATCH_REPORT_v3.1.0-support-console.md) | Jan 9, 2026 | Feature | Support Console for admin customer service |
| [v3.0.3](./PATCH_REPORT_v3.0.3-quality.md) | Jan 9, 2026 | Quality | Chart sanitization, cache cap, CI tests |
| [v3.0.0](./PATCH_REPORT_v3.0.0-enterprise.md) | Jan 9, 2026 | Enterprise | Dual-mode auth, audit logging, daily quotas |
| [v2.9.32b](./PATCH_REPORT_v2.9.32b.md) | Jan 9, 2026 | Security | Webhook credits, logging hygiene |
| [v2.9.32](./PATCH_REPORT_v2.9.32.md) | Jan 9, 2026 | Security | 8 critical fixes (XSS, CSRF, headers) |

## Updating Documentation

When making changes to the codebase:

1. **API changes** -> Update [API_CONTRACT.md](./API_CONTRACT.md)
2. **Database changes** -> Update [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
3. **Credits logic changes** -> Update [DATA_MODEL.md](./DATA_MODEL.md) AND [CREDITS_AND_BILLING.md](./CREDITS_AND_BILLING.md)
4. **New architecture decisions** -> Add entry to [DECISIONS.md](./DECISIONS.md)
5. **Deployment changes** -> Update [RUNBOOK.md](./RUNBOOK.md)
6. **New releases** -> Create [PATCH_REPORT_vX.X.X-name.md](./)
