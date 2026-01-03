# LearnSnap Production Runbook

## Quick Reference

### Starting Services

```bash
# Development server (frontend + backend)
npm run dev

# Worker (queue processing) - separate terminal
npx tsx server/worker.ts

# Run evaluation harness
npx tsx eval/run.ts
```

### Environment Variables Required

```env
# Database (required)
DATABASE_URL=postgresql://...
NEON_DATABASE_URL=postgresql://...  # For Neon

# Redis (required for queue worker)
REDIS_URL=redis://...

# AI Providers (at least one required)
GEMINI_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...

# Security (required in production)
ENCRYPTION_KEY=...              # 32-char hex for encryption
SESSION_SECRET=...              # Session secret
DEVICE_TOKEN_SECRET=...         # Device token signing

# Email (required for auth)
RESEND_API_KEY=...

# Payments (required for purchases)
LEMONSQUEEZY_API_KEY=...
LEMONSQUEEZY_WEBHOOK_SECRET=...

# Optional
FRONTEND_URL=https://...        # For CORS
SENTRY_DSN=...                  # Error tracking
```

---

## Runbook: Common Scenarios

### Scenario 1: Provider Down (Gemini/OpenAI/Claude unavailable)

**Symptoms:**
- High error rate in metrics
- `provider_failures_total` increasing
- Quiz generation failing

**Detection:**
```bash
curl -s https://your-app.com/api/metrics | jq '.abuse.providerFailures'
```

**Actions:**
1. Check circuit breaker status in metrics
2. The system will automatically:
   - Mark provider as degraded after 3 failures
   - Skip degraded providers for 3 minutes
   - Try fallback providers if available
3. If all providers down:
   - Quizzes will REFUSE (fail-closed)
   - User sees: "خدمة التحقق غير متوفرة حالياً"
4. Manual intervention:
   - Check provider status pages
   - Verify API keys are valid
   - Check rate limits

### Scenario 2: High Refusal Rate

**Symptoms:**
- `validation.refuse` metric increasing
- Users complaining about quiz failures

**Detection:**
```bash
curl -s https://your-app.com/api/metrics | jq '.validation'
```

**Actions:**
1. Check if validators are available
2. Check image quality patterns:
   - Are images too blurry?
   - Wrong language content?
   - Non-textbook images?
3. Review recent failed sessions in logs
4. If false positives:
   - Consider adjusting confidence thresholds
   - Review validation prompts

### Scenario 3: Queue Backlog

**Symptoms:**
- Jobs stuck in "processing" state
- Long wait times for quiz generation

**Detection:**
```bash
# Check queue status
curl -s https://your-app.com/api/metrics | jq '.quizzes'
```

**Actions:**
1. Check if worker is running:
   ```bash
   ps aux | grep "worker.ts"
   ```
2. Check Redis connection
3. Restart worker if stuck:
   ```bash
   # Kill existing worker
   pkill -f "worker.ts"
   # Start new worker
   npx tsx server/worker.ts
   ```
4. Check for failed jobs in Bull queue

### Scenario 4: Database Connection Issues

**Symptoms:**
- 500 errors on API calls
- "Connection refused" in logs

**Actions:**
1. Check DATABASE_URL environment variable
2. Verify Neon database status
3. Check connection pool exhaustion
4. Restart application if needed

---

## API Endpoints Reference

### Quiz Creation
```bash
# Create quiz (with requestId for idempotency)
curl -X POST https://your-app.com/api/quiz/create \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "device-uuid",
    "images": ["data:image/jpeg;base64,..."],
    "requestId": "unique-request-uuid",
    "optimizeImages": true,
    "optimizationLevel": "standard"
  }'

# Response:
# {"sessionId":"...", "jobId":"...", "status":"queued", "requestId":"..."}
```

### Job Status
```bash
# Check job status
curl https://your-app.com/api/quiz/job/{jobId}/status

# Response:
# {"status":"processing"} or {"status":"completed"} or {"status":"failed"}
```

### Quiz Result
```bash
# Get quiz result with quality signals
curl https://your-app.com/api/quiz/{sessionId}

# Response includes:
# - qualityScore: 0-100
# - validationSummary: {status, reasons}
# - questions: [...]
```

### Metrics
```bash
# Get all metrics
curl https://your-app.com/api/metrics

# Response:
# {
#   "requests": {...},
#   "quizzes": {...},
#   "ai": {...},
#   "cache": {...},
#   "validation": {...},
#   "abuse": {...}
# }
```

---

## Metrics Glossary

| Metric | Description |
|--------|-------------|
| `validation.accept` | Quizzes that passed validation |
| `validation.refuse` | Quizzes refused by fail-closed |
| `validation.partial` | Quizzes with degraded validation |
| `validation.unavailable` | Validation completely unavailable |
| `abuse.rateLimited` | Requests blocked by rate limit |
| `abuse.providerDegraded` | Circuit breaker activations |
| `cache.idempotencyHits` | Duplicate requests caught |
| `cache.extractionHits` | Cached extractions reused |

---

## Limits and Thresholds

| Limit | Value | Notes |
|-------|-------|-------|
| Max images per request | 10 | Reduced from 20 for cost control |
| Max image size | 6MB | Per image |
| Max payload size | 85MB | Including base64 overhead |
| Rate limit (create) | 10/5min | Per IP/device |
| Rate limit (status) | 60/5min | Per IP |
| Idempotency TTL | 30 minutes | |
| Extraction cache TTL | 14 days | |
| Circuit breaker threshold | 3 failures | Opens after 3 failures |
| Circuit breaker cooldown | 3 minutes | |

---

## Contact

For production issues:
1. Check this runbook
2. Review logs in Railway/Sentry
3. Check metrics endpoint
4. Contact development team
