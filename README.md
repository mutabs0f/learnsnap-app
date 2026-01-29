# LearnSnap

> AI-powered quiz generation from textbook images for Arabic students

**Version**: 3.5.2  
**Status**: Production-Ready (Google L7 Compliant)

## Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env with your values (see Required Variables below)

# 3. Push database schema
npm run db:push

# 4. Start development server
npm run dev
# Server runs on http://localhost:5000
```

## Required Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (Neon recommended) |
| `SESSION_SECRET` | Random 32+ character string |
| `GEMINI_API_KEY` | Google Gemini API key (primary AI) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret |

### Optional Variables

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Redis for async queue processing & feature flags |
| `OPENAI_API_KEY` | OpenAI fallback API key |
| `ANTHROPIC_API_KEY` | Anthropic final fallback |
| `RESEND_API_KEY` | Email service |

See `.env.example` for full list with descriptions.

## Production Deployment (Railway)

```bash
# Build for production
npm run build

# Start production server
npm start
```

### Railway Setup

1. Create new Railway project from GitHub
2. Add environment variables (see `docs/GO_LIVE_CHECKLIST.md`)
3. Railway auto-deploys on push to main

### Health Checks

- `GET /health` - Basic health check
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe (includes DB)
- `GET /health/ai` - AI circuit breaker status
- `GET /health/memory` - Memory watchdog status
- `GET /health/features` - Feature flag states

## Project Structure

```
├── client/                 # React 18 frontend (Vite)
│   ├── src/
│   │   ├── components/     # UI components (shadcn/ui)
│   │   │   └── admin/      # Admin dashboard components
│   │   ├── pages/          # Route pages
│   │   ├── hooks/          # Custom hooks
│   │   ├── types/          # TypeScript interfaces
│   │   └── lib/            # Utilities
│   └── public/             # Static assets
├── server/                 # Express.js backend
│   ├── routes/             # Modular API routes (v3.2.1+)
│   │   ├── index.ts        # Route orchestrator
│   │   ├── health.routes.ts
│   │   ├── credits.routes.ts
│   │   ├── quiz.routes.ts
│   │   ├── admin.routes.ts
│   │   ├── analytics.routes.ts
│   │   └── shared.ts       # Shared utilities
│   ├── ai/                 # AI service modules (v3.3.2+)
│   │   ├── providers/      # Gemini, OpenAI, Anthropic
│   │   ├── validators.ts   # Grounding validation
│   │   ├── parsers.ts      # Response parsing
│   │   ├── circuit-breaker.ts # Per-provider circuit breaker
│   │   └── index.ts        # Main exports
│   ├── auth-routes.ts      # Authentication
│   ├── paylink-routes.ts   # Payment integration
│   ├── storage.ts          # Database layer
│   ├── feature-flags.ts    # Runtime feature toggles
│   ├── queue-service.ts    # Bull queue for async jobs
│   ├── worker.ts           # Background job processor
│   └── __tests__/          # Backend tests (169 tests)
├── shared/                 # Shared TypeScript types
│   └── schema.ts           # Drizzle ORM schema
├── e2e/                    # Playwright E2E tests
│   └── specs/              # Test specifications
├── docs/                   # Documentation
│   ├── API_CONTRACT.md     # API reference
│   ├── GO_LIVE_CHECKLIST.md # Deployment guide
│   ├── RUNBOOK.md          # Operations guide
│   └── SRE_PRODUCTION_READINESS.md
└── script/                 # Build and migration scripts
```

## Architecture

### Backend Modules

| Module | Purpose |
|--------|---------|
| `routes/` | Modular API endpoints (refactored from monolithic routes.ts) |
| `ai/` | AI providers with circuit breakers and fallback chain |
| `feature-flags.ts` | Redis-backed runtime toggles |
| `queue-service.ts` | Bull queue for async quiz generation |
| `worker.ts` | Background job processing |

### AI Provider Fallback Chain

```
Gemini Flash 2.5 (Primary)
    ↓ on failure
OpenAI GPT-4o mini (Secondary)
    ↓ on failure
Anthropic Claude Sonnet (Final)
```

Each provider has its own circuit breaker to prevent cascading failures.

## Tech Stack

- **Frontend**: React 18, TypeScript, TailwindCSS, shadcn/ui
- **Backend**: Node.js 20, Express, TypeScript
- **Database**: PostgreSQL (Neon serverless)
- **ORM**: Drizzle
- **Queue**: Bull (Redis-backed)
- **AI**: Google Gemini (primary), OpenAI (fallback), Anthropic (final)
- **Payments**: Paylink (Saudi Arabia)
- **Auth**: Google OAuth 2.0, Email/Password

## Testing

```bash
# Run all backend tests (169 tests)
npx vitest run

# Run with coverage
npx vitest run --coverage

# Run E2E tests
npx playwright test

# Run specific test file
npx vitest run server/__tests__/payment-webhook.test.ts
```

### Test Coverage

| Area | Coverage |
|------|----------|
| Payment webhooks | HMAC validation, idempotency |
| Authentication | JWT lifecycle, session management |
| Credits | Concurrency, race conditions |
| AI Validation | Grounding, parsers, validators |
| Feature Flags | Runtime toggles, Redis persistence |

## Documentation

- [API Contract](docs/API_CONTRACT.md) - Endpoint reference
- [Go-Live Checklist](docs/GO_LIVE_CHECKLIST.md) - Deployment guide
- [Operations Runbook](docs/RUNBOOK.md) - Troubleshooting
- [Architecture](docs/ARCHITECTURE.md) - System design
- [Credits & Billing](docs/CREDITS_AND_BILLING.md) - Payment logic
- [SRE Readiness](docs/SRE_PRODUCTION_READINESS.md) - Monitoring & SLOs

## License

MIT © 2026 LearnSnap
