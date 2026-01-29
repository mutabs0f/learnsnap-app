# LearnSnap v3.5.3 - Project Structure

## File Naming Convention
```
learnsnap-v{VERSION}-{TYPE}-{DATE}.zip
```
- **VERSION**: Semantic versioning (3.5.3)
- **TYPE**: production, staging, dev
- **DATE**: YYYYMMDD format

## Standard Directory Structure

```
learnsnap/
├── .github/
│   └── workflows/
│       ├── ci.yml              # Main CI pipeline
│       └── e2e-tests.yml       # E2E test suite
│
├── client/                     # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/         # UI components
│   │   │   ├── ui/            # shadcn/ui base components
│   │   │   └── admin/         # Admin-specific components
│   │   ├── pages/             # Page components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── lib/               # Utilities
│   │   └── types/             # TypeScript types
│   └── index.html
│
├── server/                     # Backend (Express.js)
│   ├── routes/                # Modular API routes
│   │   ├── index.ts           # Route orchestrator
│   │   ├── health.routes.ts
│   │   ├── credits.routes.ts
│   │   ├── quiz.routes.ts
│   │   ├── admin.routes.ts
│   │   └── analytics.routes.ts
│   ├── ai/                    # AI service modules
│   │   ├── providers/         # AI provider implementations
│   │   ├── generator.ts       # Quiz generation
│   │   ├── validators.ts      # Grounding validation
│   │   └── circuit-breaker.ts
│   ├── utils/                 # Server utilities
│   ├── migrations/            # Database migrations
│   ├── __tests__/             # Backend tests
│   ├── db.ts                  # Database connection
│   ├── storage.ts             # Data access layer
│   ├── auth.ts                # Authentication
│   ├── logger.ts              # Structured logging
│   ├── metrics.ts             # Prometheus metrics
│   └── index.ts               # Server entry point
│
├── shared/                     # Shared code
│   └── schema.ts              # Database schema + types
│
├── e2e/                        # End-to-end tests
│   └── specs/
│       ├── smoke.spec.ts
│       ├── critical-flows.spec.ts
│       ├── accessibility.spec.ts
│       └── payment-quiz-flow.spec.ts
│
├── docs/                       # Documentation
│   ├── ARCHITECTURE.md
│   ├── API_CONTRACT.md
│   ├── SECURITY_AUDIT_v3.3.3.md
│   ├── SRE_PRODUCTION_READINESS.md
│   ├── DEVOPS_READINESS_REVIEW.md
│   ├── DATABASE_BACKUP_POLICY.md
│   └── ...
│
├── scripts/                    # Build & utility scripts
│
├── Dockerfile                  # Container definition
├── .dockerignore              # Docker build exclusions
├── .gitignore                 # Git exclusions
├── package.json               # Dependencies
├── package-lock.json          # Lock file
├── tsconfig.json              # TypeScript config
├── vite.config.ts             # Vite bundler config
├── tailwind.config.ts         # Tailwind CSS config
├── drizzle.config.ts          # ORM config
├── railway.json               # Railway deployment
├── railway.toml               # Railway config
├── playwright.config.ts       # E2E test config
├── vitest.config.ts           # Unit test config
├── README.md                  # Project documentation
├── CONTRIBUTING.md            # Contribution guide
├── SECURITY.md                # Security policy
└── LICENSE                    # MIT License
```

## Deployment

### GitHub
```bash
# Extract and push
unzip learnsnap-v3.5.3-production-20260110.zip -d learnsnap
cd learnsnap
git init
git add .
git commit -m "LearnSnap v3.5.3 - Production Ready"
git remote add origin https://github.com/YOUR_USERNAME/learnsnap.git
git push -u origin main
```

### Railway
1. Connect GitHub repo to Railway
2. Set environment variables (see docs/RUNBOOK.md)
3. Deploy automatically on push

## Required Environment Variables
```
# Database
NEON_DATABASE_URL=postgresql://...

# Authentication
SESSION_SECRET=min-32-characters
DEVICE_TOKEN_SECRET=min-32-characters
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# AI Services
GEMINI_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...

# Payments (optional)
PAYLINK_API_KEY=...
PAYLINK_SECRET=...

# Email (optional)
RESEND_API_KEY=...
```

## Version History
- v3.5.3 (2026-01-10): Database hardening, DevOps improvements
- v3.5.2: Google L7 compliance, circuit breakers
- v3.5.1: Test suite expansion (183 tests)
- v3.5.0: SRE production readiness, Prometheus metrics
