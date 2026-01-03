# LearnSnap - AI-Powered Quiz Generator

## Overview

LearnSnap is a mobile-first Arabic quiz generation application that transforms textbook photos into interactive quizzes using AI. Users upload photos of textbook pages (up to 20 pages, 6MB each), and the AI generates exactly 20 diverse questions per quiz.

**Live URL**: https://learnsnap.up.railway.app

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite + TypeScript |
| Backend | Express.js + TypeScript |
| Database | PostgreSQL (Neon) + Drizzle ORM |
| AI | OpenAI GPT-4o-mini, Anthropic Claude, Google Gemini |
| Auth | Session-based JWT + Google OAuth 2.0 |
| Payments | LemonSqueezy (merchant of record) |
| Email | Resend API |
| Styling | Tailwind CSS + shadcn/ui |
| Hosting | Railway (recommended) or Vercel |

---

## Project Structure

```
learnsnap/
├── client/                    # React frontend
│   ├── src/
│   │   ├── pages/            # Page components
│   │   │   ├── landing.tsx   # Homepage
│   │   │   ├── auth.tsx      # Login/Register
│   │   │   ├── auth-callback.tsx  # OAuth callback
│   │   │   ├── upload.tsx    # Image upload
│   │   │   ├── quiz.tsx      # Quiz interface
│   │   │   ├── results.tsx   # Quiz results
│   │   │   └── pricing.tsx   # Pricing page
│   │   ├── components/       # Reusable components
│   │   │   └── ui/           # shadcn/ui components
│   │   ├── hooks/            # Custom React hooks
│   │   └── lib/              # Utilities
│   └── index.html
├── server/                    # Express backend
│   ├── index.ts              # Server entry point
│   ├── routes.ts             # API routes
│   ├── auth-routes.ts        # Authentication endpoints
│   ├── storage.ts            # Database operations (Drizzle)
│   ├── ai-service.ts         # AI quiz generation (2700+ lines)
│   ├── subject-detector.ts   # Auto-detect subject from text
│   ├── prompts/
│   │   └── system-prompts.ts # AI prompt templates
│   ├── vite.ts               # Vite dev server integration
│   └── worker.ts             # Background job processor (optional)
├── shared/
│   └── schema.ts             # Drizzle ORM schema + Zod types
├── e2e/                      # Playwright E2E tests
└── drizzle/                  # Database migrations
```

---

## Key Features

### 1. Authentication System
- **Email/Password**: Registration with email verification (Resend API)
- **Google OAuth**: One-click login via Google
- **Session Management**: 30-day JWT sessions with CSRF protection
- **Password Reset**: Email-based password recovery

### 2. Credit System
- **Early Adopters** (first 30 users): 50 free pages
- **Regular Users**: 2 free pages
- **Pay-per-page**: LemonSqueezy integration for purchasing credits
- **Device-based tracking**: Credits linked to deviceId, synced to user account

### 3. Quiz Generation Pipeline
```
Upload Images → Text Extraction (Vision AI) → Subject Detection →
Smart Prompts → Generate Questions → Validate Answers → Filter Quality →
Return 20 Questions
```

**Question Distribution** (exactly 20 total):
- 8 Multiple Choice (MCQ)
- 6 True/False
- 4 Fill-in-the-blank
- 2 Matching

### 4. Anti-Hallucination System
- 6-layer validation pipeline
- Evidence-based grounding (each question linked to source text)
- Dual-validator consensus (GPT-4o-mini + Claude Haiku)
- Grammar validation for word-order questions
- Confidence scoring with thresholds

### 5. Subject Detection
Auto-detects content type:
- **English**: Grammar/vocabulary skill questions (not story recall)
- **Math**: Problem-solving questions
- **Science**: Concept understanding
- **Arabic**: Formal Arabic (فصحى) questions

---

## Database Schema

```typescript
// Main tables (shared/schema.ts)
users: {
  id: varchar (UUID)
  email: varchar (unique)
  passwordHash: text
  name: varchar
  isVerified: boolean
  googleId: varchar (nullable)
  createdAt: timestamp
}

pageCredits: {
  id: serial
  deviceId: varchar (unique)
  userId: varchar (nullable, FK → users.id)
  pagesRemaining: integer (default 0)
  isEarlyAdopter: boolean
  status: varchar
  createdAt/updatedAt: timestamp
}

quizzes: {
  id: serial
  deviceId: varchar
  userId: varchar (nullable)
  title: text
  summary: text
  questions: jsonb (array of Question objects)
  imageCount: integer
  createdAt: timestamp
}

transactions: {
  id: serial
  deviceId: varchar
  userId: varchar (nullable)
  paymentId: varchar (LemonSqueezy)
  amount: integer (cents)
  pages: integer
  status: varchar
  createdAt: timestamp
}
```

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register with email/password |
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/logout` | Logout (clear session) |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/sync-credits` | Sync credits after OAuth login |
| GET | `/api/auth/google` | Initiate Google OAuth |
| GET | `/api/auth/google/callback` | Google OAuth callback |
| POST | `/api/auth/forgot-password` | Send reset email |
| POST | `/api/auth/reset-password` | Reset password with token |
| GET | `/api/auth/verify-email` | Verify email with token |

### Quiz
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/quiz/create` | Generate quiz from images |
| GET | `/api/quiz/:id` | Get quiz by ID |
| GET | `/api/quiz/history` | Get user's quiz history |
| GET | `/api/quiz/job/:jobId/status` | Check async job status |
| GET | `/api/quiz/job/:jobId/result` | Get async job result |

### Credits
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/credits` | Get remaining credits |
| POST | `/api/credits/purchase` | Create LemonSqueezy checkout |
| POST | `/api/webhooks/lemonsqueezy` | LemonSqueezy webhook |

---

## Environment Variables

### Required
```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db
NEON_DATABASE_URL=postgresql://...  # Same as DATABASE_URL for Neon

# Authentication
SESSION_SECRET=your-random-32-char-secret
ENCRYPTION_KEY=your-random-32-char-key  # Required in production

# AI Services (at least one required)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...  # Currently quota exhausted

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# LemonSqueezy Payments
LEMONSQUEEZY_API_KEY=...
LEMONSQUEEZY_WEBHOOK_SECRET=...

# Email
RESEND_API_KEY=re_...

# URLs
FRONTEND_URL=https://your-app.railway.app
```

### Optional
```env
# Sentry Error Tracking
SENTRY_DSN=https://...

# Redis (for Bull queue)
REDIS_URL=redis://...

# Admin
ADMIN_PASSWORD=your-admin-password
```

---

## Deployment (Railway)

### 1. Create Railway Project
```bash
railway login
railway init
```

### 2. Add PostgreSQL
- Add PostgreSQL plugin in Railway dashboard
- Copy `DATABASE_URL` to environment variables

### 3. Set Environment Variables
Copy all required env vars to Railway project settings.

### 4. Deploy
```bash
railway up
```

Or connect GitHub for auto-deploys.

### 5. Run Migrations
```bash
railway run npm run db:push
```

---

## Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Database
```bash
# Create .env with DATABASE_URL
npm run db:push
```

### 3. Start Development Server
```bash
npm run dev
```

Server runs on http://localhost:5000

---

## Key Files Explained

### `server/ai-service.ts` (2700+ lines)
The core AI pipeline:
- `generateQuizFromImages()` - Main entry point
- `generateWithGemini()` / `generateWithOpenAI()` / `generateWithClaude()` - Provider-specific generation
- `validateAnswersWithConsensus()` - Dual-validator answer verification
- `validateQuestionGrammar()` - Grammar checking for Arabic
- `filterValidQuestions()` - Remove low-quality questions
- Circuit breaker pattern for AI provider failover
- Extraction caching (14-day TTL)

### `server/auth-routes.ts`
- JWT session management
- Google OAuth flow
- Credit syncing between devices
- Early adopter detection and bonus granting

### `server/storage.ts`
Drizzle ORM database operations:
- `createUser()`, `getUserByEmail()`, `getUserById()`
- `getPageCredits()`, `createOrUpdatePageCredits()`, `usePageCredits()`
- `countEarlyAdopters()`, `grantEarlyAdopterBonus()`
- `createQuiz()`, `getQuizById()`, `getQuizzesByDevice()`

### `client/src/pages/quiz.tsx`
Interactive quiz UI:
- Question rendering (MCQ, True/False, Fill-blank, Matching)
- Real-time progress tracking
- Confetti on correct answers
- RTL Arabic layout

---

## Important Constants

```typescript
// server/auth-routes.ts
EARLY_ADOPTER_LIMIT = 30        // First 30 users
EARLY_ADOPTER_FREE_PAGES = 50   // Get 50 free pages
DEFAULT_FREE_PAGES = 2          // Others get 2

// server/index.ts
PAYLOAD_LIMIT_QUIZ = "85mb"     // For /api/quiz/create
PAYLOAD_LIMIT_DEFAULT = "50mb"  // For other routes

// Question distribution (exactly 20)
MCQ = 8
TRUE_FALSE = 6
FILL_BLANK = 4
MATCHING = 2
```

---

## Troubleshooting

### "0 pages remaining" after login
- Check `sync-credits` endpoint is being called
- Verify `deviceId` is consistent (stored in localStorage)
- Check early adopter count hasn't exceeded limit

### Quiz generation fails
- Check AI API keys are valid
- Verify image size < 6MB per image
- Check total payload < 85MB
- Look at server logs for specific errors

### Google OAuth not working
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- Check callback URL matches: `{FRONTEND_URL}/api/auth/google/callback`
- Ensure Google Cloud Console has correct redirect URIs

### Database connection errors
- Verify `DATABASE_URL` format
- Check Neon dashboard for connection limits
- Ensure SSL is enabled (`?sslmode=require`)

---

## Version History

| Version | Key Changes |
|---------|-------------|
| v4.6 | Credit sync fix, 20 questions enforcement, navigation improvement |
| v4.5 | Credit sync from temp deviceId to browser deviceId |
| v4.4 | Payload size increase, grammar validation, early adopter system |
| v4.3 | Smart subject detection, anti-story pattern filtering |
| v4.2 | Security hardening (JWT, CSP, input sanitization) |
| v2.9 | Credit fairness (charge only on success) |
| v2.8 | Bull/Redis queue for background processing |

---

## Contact

For technical questions or deployment help, provide this document to your developer.
