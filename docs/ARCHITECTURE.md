# System Architecture

> **Version**: 3.3.0  
> **Last Updated**: January 10, 2026

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  CLIENTS                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   Mobile Web     │  │   Desktop Web    │  │   Tablet Web     │          │
│  │   (Primary)      │  │                  │  │                  │          │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘          │
└───────────┼─────────────────────┼─────────────────────┼─────────────────────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  │ HTTPS
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RAILWAY HOSTING                                    │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Node.js Server                                 │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │   Express   │  │   Vite      │  │   Static    │  │   API       │  │  │
│  │  │   Router    │  │   Dev SSR   │  │   Serving   │  │   Routes    │  │  │
│  │  └──────┬──────┘  └─────────────┘  └─────────────┘  └──────┬──────┘  │  │
│  │         │                                                   │         │  │
│  │         ▼                                                   ▼         │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │  │                      Service Layer                               │ │  │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────────┐   │ │  │
│  │  │  │ Storage   │ │ AI        │ │ Payment   │ │ Auth          │   │ │  │
│  │  │  │ (Drizzle) │ │ Service   │ │ (Paylink) │ │ (Passport)    │   │ │  │
│  │  │  └─────┬─────┘ └─────┬─────┘ └───────────┘ └───────────────┘   │ │  │
│  │  └────────┼─────────────┼─────────────────────────────────────────┘ │  │
│  └───────────┼─────────────┼───────────────────────────────────────────┘  │
└──────────────┼─────────────┼──────────────────────────────────────────────┘
               │             │
               ▼             ▼
┌──────────────────────┐  ┌─────────────────────────────────────────────────┐
│   NEON POSTGRES      │  │               AI PROVIDERS                       │
│  ┌────────────────┐  │  │  ┌───────────┐ ┌───────────┐ ┌───────────────┐  │
│  │ users          │  │  │  │ Gemini    │ │ OpenAI    │ │ Anthropic     │  │
│  │ page_credits   │  │  │  │ Flash     │ │ GPT-4o    │ │ Claude        │  │
│  │ transactions   │  │  │  │ (Primary) │ │ (Fallback)│ │ (Final)       │  │
│  │ quiz_sessions  │  │  │  └───────────┘ └───────────┘ └───────────────┘  │
│  │ webhook_events │  │  └─────────────────────────────────────────────────┘
│  │ ...            │  │
│  └────────────────┘  │
└──────────────────────┘
```

## Component Details

### Frontend (Client)

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | React 18 | UI rendering |
| Routing | Wouter | Client-side navigation |
| State | TanStack Query | Server state management |
| Styling | Tailwind CSS + shadcn/ui | UI components |
| Forms | react-hook-form + Zod | Form handling |
| Build | Vite | Development and production builds |

### Backend (Server)

| Component | Technology | Purpose |
|-----------|------------|---------|
| Runtime | Node.js 20 | JavaScript runtime |
| Framework | Express.js | HTTP server |
| Language | TypeScript | Type safety |
| ORM | Drizzle | Database queries |
| Validation | Zod | Request/response validation |
| Auth | Passport.js | Authentication strategies |
| Logging | Winston | Structured logging |

### Database

| Component | Technology | Purpose |
|-----------|------------|---------|
| Provider | Neon | Serverless Postgres |
| Driver | @neondatabase/serverless | WebSocket connection |
| Migrations | Drizzle Kit | Schema management |

### External Services

| Service | Purpose | Integration |
|---------|---------|-------------|
| Google OAuth | Social login | Passport.js strategy |
| Paylink | Payment gateway | REST API + Webhooks |
| Gemini | Primary AI | @google/genai SDK |
| OpenAI | Fallback AI | openai SDK |
| Anthropic | Final fallback AI | @anthropic-ai/sdk |
| Resend | Email delivery | Optional |

## Environment Variables

### Required

```bash
# Database
DATABASE_URL           # Neon Postgres connection string
NEON_DATABASE_URL     # Alternative DB URL

# Authentication
GOOGLE_CLIENT_ID      # Google OAuth client ID
GOOGLE_CLIENT_SECRET  # Google OAuth secret
SESSION_SECRET        # Express session secret

# AI Providers
GEMINI_API_KEY        # Google Gemini API key
OPENAI_API_KEY        # OpenAI API key (fallback)
ANTHROPIC_API_KEY     # Anthropic API key (fallback)

# Payments
PAYLINK_API_KEY       # Paylink API key
PAYLINK_SECRET        # Paylink secret
```

### Optional

```bash
# Email (if enabled)
RESEND_API_KEY        # Resend email API key

# Admin
ADMIN_PASSWORD        # Admin panel password

# Payments (additional)
STRIPE_SECRET_KEY     # Stripe key (legacy)
LEMONSQUEEZY_API_KEY  # LemonSqueezy key (alternative)

# Caching
REDIS_URL             # Redis for caching/queuing

# Monitoring
SENTRY_DSN            # Sentry error tracking
```

## Deployment (Railway)

### Build Command

```bash
npm run build
```

This runs `tsx script/build.ts` which:
1. Builds frontend with Vite
2. Bundles backend with esbuild
3. Outputs to `dist/` directory

### Start Command

```bash
npm run start
```

This runs `NODE_ENV=production node dist/index.cjs`

### Railway Configuration

See `railway.json` and `railway.toml` for:
- Build settings
- Health check configuration
- Environment variable setup

### Static File Serving

In production, the server:
1. Serves built frontend from `dist/public/`
2. Handles SPA routing (fallback to index.html)
3. Uses proper caching headers for assets

## Request Flow

### Quiz Generation Flow

```
1. Client uploads images → POST /api/quiz/create
2. Server validates request, checks credits
3. Deducts credits from owner (user_<id> or deviceId)
4. Creates quiz session with status="processing"
5. Calls AI service (Gemini → OpenAI → Claude fallback)
6. AI extracts text, generates questions
7. 6-layer validation pipeline runs
8. Updates session with questions, status="ready"
9. Client polls GET /api/quiz/:sessionId until ready
10. Client displays quiz to user
```

### Payment Flow

```
1. Client requests checkout → POST /api/payment/create
2. Server creates Paylink invoice
3. Server stores pending payment record
4. Client redirected to Paylink hosted checkout
5. User completes payment
6. Paylink sends webhook → POST /api/webhooks/paylink
7. Server verifies payment, adds credits
8. OR: Client polls → POST /api/payment/verify
9. Credits added to targetOwnerId
```

## Security Considerations

1. **CORS**: Configured for allowed origins
2. **CSRF**: Token-based protection (see CSRF Coverage section)
3. **Rate Limiting**: On auth, quiz, payment endpoints
4. **Input Validation**: Zod schemas on all inputs
5. **SQL Injection**: Prevented by Drizzle ORM
6. **Secrets**: Environment variables, never in code
7. **Session**: HTTP-only cookies, 30-day expiry

### CSRF Coverage (v3.2.0+)

**Protected Endpoints** (via csrfProtection middleware):
- `POST /api/quiz/create` - Quiz creation
- `POST /api/billing/*` - Billing operations
- `POST /api/payment/create` - Payment creation (added in v3.2.0)

**All mutating endpoints are now CSRF protected.**

The frontend uses `secureFetch` from `@/lib/api` for all protected endpoints.

### XSS Surface Documentation (v3.0.3)

**Known dangerouslySetInnerHTML Usage**:

| File | Component | Purpose | Risk Level |
|------|-----------|---------|------------|
| `client/src/components/ui/chart.tsx` | ChartStyle | Inject CSS for chart theming | Low |

**ChartStyle Mitigation**:
- `id` parameter is sanitized: `id.replace(/[^a-zA-Z0-9_-]/g, '')`
- Theme config comes from constants (not user input)
- Color values from controlled ChartConfig

**Policy**: 
- Do NOT expand `dangerouslySetInnerHTML` usage
- Any new usage requires security review
- Always sanitize any interpolated values
