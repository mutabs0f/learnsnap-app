# Operations Runbook

> **Version**: 3.2.0  
> **Last Updated**: January 10, 2026

## Local Development

### Prerequisites

- Node.js 20+
- PostgreSQL (or Neon account)
- npm

### Environment Setup

1. Copy environment template:
```bash
cp .env.example .env
```

2. Configure required variables:
```bash
# Database
DATABASE_URL=postgresql://user:pass@host/db
# OR
NEON_DATABASE_URL=postgresql://user:pass@host/db

# Auth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-secret
SESSION_SECRET=random-32-char-string

# AI (at least one required)
GEMINI_API_KEY=your-key
OPENAI_API_KEY=your-key  # Fallback
ANTHROPIC_API_KEY=your-key  # Final fallback
```

## Production Environment Variables (v2.9.32b)

### Required in Production (Fail-Closed)

| Variable | Description | Behavior if Missing |
|----------|-------------|---------------------|
| `SESSION_SECRET` | 32+ char random string for CSRF | **Server exits** |
| `FRONTEND_URL` | Production domain for CORS | **Server exits** |
| `DEVICE_TOKEN_SECRET` or `SESSION_SECRET` | Device auth secret | **Server exits** |
| `PAYLINK_WEBHOOK_SECRET` | Webhook signature verification | **Webhooks rejected** |

### Optional in Production

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_ADMIN` | Enable admin dashboard | `false` (disabled) |
| `ADMIN_PASSWORD` | Admin auth password | N/A (required if ENABLE_ADMIN=true) |
| `LEGACY_TOKEN_REDIRECT` | OAuth returns token in URL fragment | `false` |
| `LEGACY_BEARER_AUTH` | Enable legacy Bearer token auth in frontend | `false` |
| `CSP_REPORT_ONLY` | CSP violations reported not blocked | `false` |
| `QUIZ_DAILY_LIMIT` | Max quizzes per device per day | `60` |
| `DATA_RETENTION_DAYS` | Days to retain quiz sessions/audit logs | `90` |

### Admin Dashboard Security

In production:
- Admin routes are **disabled by default**
- To enable: set `ENABLE_ADMIN=true` AND `ADMIN_PASSWORD`
- If `ENABLE_ADMIN=true` but no `ADMIN_PASSWORD`: routes remain disabled

### Trust Proxy (v2.9.32b)

In production, `app.set('trust proxy', 1)` is automatically enabled to:
- Get correct client IP (`req.ip`) behind Railway/Nginx/Cloudflare proxies
- Ensure rate limiting works correctly with real client IPs
- Enable secure cookies with proper HTTPS detection

3. Install dependencies:
```bash
npm install
```

4. Start development server:
```bash
npm run dev
```

Server runs on `http://localhost:5000`

### Common Local Issues

#### Database Connection Failed

**Symptom**: "Cannot connect to database"

**Solution**:
- Check DATABASE_URL format
- Ensure Neon project is active
- Check IP whitelist in Neon dashboard

#### Google OAuth Redirect Error

**Symptom**: "redirect_uri_mismatch"

**Solution**:
- Add `http://localhost:5000/api/auth/google/callback` to Google Console
- Check GOOGLE_CLIENT_ID matches

#### AI Service Unavailable

**Symptom**: Quiz generation fails

**Solution**:
- Check API key validity
- Verify API quota/billing
- Check fallback providers are configured

---

## Railway Deployment

### Build Configuration

Build uses Nixpacks with:
- Node.js 20
- npm install
- npm run build

Build command in `package.json`:
```json
{
  "build": "tsx script/build.ts"
}
```

This runs:
1. Vite build for frontend
2. esbuild bundle for backend
3. Output to `dist/`

### Start Command

```json
{
  "start": "NODE_ENV=production node dist/index.cjs"
}
```

### Required Environment Variables

Set these in Railway dashboard:

| Variable | Required | Notes |
|----------|----------|-------|
| DATABASE_URL | Yes | Neon connection string |
| GOOGLE_CLIENT_ID | Yes | OAuth |
| GOOGLE_CLIENT_SECRET | Yes | OAuth |
| SESSION_SECRET | Yes | 32+ chars |
| GEMINI_API_KEY | Yes | Primary AI |
| OPENAI_API_KEY | Recommended | Fallback |
| ANTHROPIC_API_KEY | Recommended | Final fallback |
| PAYLINK_API_KEY | Yes | Payments |
| PAYLINK_SECRET | Yes | Payments |

### Health Checks

Railway uses health checks to verify deployment:

- **Endpoint**: `GET /health`
- **Expected**: 200 OK
- **Timeout**: Configure in Railway

### Manual Deployment

```bash
# Push to main triggers deploy
git push origin main

# Or use Railway CLI
railway up
```

---

## Troubleshooting

### Frontend Not Rendering (Production)

**Symptom**: Blank page, missing styles

**Causes**:
1. Static files not built
2. Base path misconfigured
3. Asset hashing issues

**Solutions**:
```bash
# Rebuild
npm run build

# Check dist/public exists
ls -la dist/public/

# Verify index.html has correct asset paths
cat dist/public/index.html
```

### RangeNotSatisfiableError

**Symptom**: 416 error on static files

**Cause**: Range request for file that doesn't support it

**Solution**:
- Already handled in static.ts
- If persists, check file serving middleware

### Credits Mismatch / 402 Issues

**Symptom**: User has pages but gets 402

**Debug Steps**:

1. Check what owner ID is being used:
```sql
-- If logged in, should be user_<id>
SELECT * FROM page_credits 
WHERE device_id LIKE 'user_%' 
ORDER BY updated_at DESC LIMIT 10;
```

2. Check Authorization header in request:
```
# In browser dev tools, Network tab
# Look for Authorization: Bearer <token>
```

3. Verify session is valid:
```sql
SELECT * FROM user_sessions 
WHERE token = '<token>' 
AND expires_at > NOW();
```

4. Check if credits exist for user:
```sql
SELECT * FROM page_credits 
WHERE device_id = 'user_<USER_ID>';
```

### Quiz Generation Fails

**Symptom**: Quiz stuck in "processing"

**Debug Steps**:

1. Check server logs:
```bash
# Railway logs
railway logs

# Or Winston logs
tail -f logs/combined-*.log
```

2. Look for AI errors:
```bash
grep -i "error" logs/combined-*.log | tail -20
```

3. Check quiz session:
```sql
SELECT id, status, created_at, warnings 
FROM quiz_sessions 
WHERE id = '<SESSION_ID>';
```

4. Verify AI keys are valid:
- Test Gemini API directly
- Check OpenAI dashboard for usage

### Payment Not Reflecting

**Symptom**: Payment succeeded but no credits

**Debug Steps**:

1. Check pending payment:
```sql
SELECT * FROM pending_payments 
WHERE order_number = '<ORDER>';
```

2. Check webhook received:
```sql
SELECT * FROM webhook_events 
WHERE event_id LIKE '%<TRANSACTION_NO>%';
```

3. Check transaction created:
```sql
SELECT * FROM transactions 
WHERE stripe_payment_id LIKE '%<TRANSACTION_NO>%';
```

4. Manually verify with Paylink:
- Check Paylink dashboard for payment status
- Retry webhook from dashboard

---

## Log Locations

### Development

```
logs/
  combined-YYYY-MM-DD.log   # All logs
  error-YYYY-MM-DD.log      # Errors only
  http-YYYY-MM-DD.log       # HTTP requests
```

### Production (Railway)

Access via Railway CLI:
```bash
railway logs
railway logs --tail
```

Or Railway dashboard → Deployments → Logs

---

## Recommended Logging Additions

If debugging frequently, consider adding:

1. **Credit operations**: Log before/after balances
2. **Payment flow**: Log each step with order_number
3. **AI requests**: Log provider used and response time
4. **Auth flow**: Log session creation/validation

Example pattern:
```typescript
logger.info("Operation description", {
  operation: "operation_name",
  ownerId: ownerId.substring(0, 12) + "...",
  detail: value
});
```

---

## Database Maintenance

### Cleanup Expired Sessions

```sql
DELETE FROM user_sessions WHERE expires_at < NOW();
DELETE FROM email_verification_tokens WHERE expires_at < NOW();
DELETE FROM quiz_sessions WHERE expires_at < NOW();
```

### [Enterprise v3.0] Data Retention Cleanup

Run these periodically to maintain database performance:

```sql
-- Delete audit logs older than 90 days
DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';

-- Delete quota counters older than 7 days (daily reset)
DELETE FROM quota_counters WHERE day < CURRENT_DATE - INTERVAL '7 days';

-- Delete completed pending payments older than 30 days
DELETE FROM pending_payments 
WHERE created_at < NOW() - INTERVAL '30 days' 
AND status != 'pending';

-- Verify table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;
```

Recommended schedule:
- Sessions: Daily
- Audit logs: Weekly
- Quota counters: Weekly

### Cleanup Script (Enterprise v3.0)

Run the cleanup script to delete expired data:

```bash
# Set retention period (default: 90 days)
export DATA_RETENTION_DAYS=90

# Run cleanup script
npx tsx server/scripts/cleanup.ts
```

The script deletes:
- Expired quiz sessions
- Expired user sessions
- Expired email verification tokens
- Audit logs older than DATA_RETENTION_DAYS
- Quota counters older than 7 days
- Completed pending payments older than 30 days
- Webhook events older than 30 days

Recommended: Run daily via cron or scheduled task.

### Check for Orphaned Records

```sql
-- Credits with no recent activity
SELECT * FROM page_credits 
WHERE updated_at < NOW() - INTERVAL '90 days'
AND pages_remaining > 0;
```

### Backup Before Changes

```bash
# Use pg_dump
pg_dump $DATABASE_URL > backup.sql
```

---

## Emergency Procedures

### Rollback Deployment

1. Railway dashboard → Deployments
2. Find last working deployment
3. Click "Redeploy"

---

## Monitoring Dashboard Setup (v3.2.0)

### Recommended Metrics to Track

1. **Application Health**
   - `/health` response time
   - Error rate (5xx responses)
   - Request latency (p50, p95, p99)

2. **Business Metrics**
   - Quiz generations per hour
   - Payment success rate
   - Credits consumption rate

3. **Infrastructure**
   - Memory usage
   - CPU usage
   - Database connection pool

### Sentry Setup

1. Create project at sentry.io
2. Get DSN from Project Settings → Client Keys
3. Add to Railway: `SENTRY_DSN=https://xxx@sentry.io/xxx`
4. Verify: Check Sentry dashboard for test error

The code is already configured in `server/index.ts`:
```typescript
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}
```

### Log Analysis

```bash
# Railway logs
railway logs --follow

# Filter errors
railway logs | grep -i error

# Filter by endpoint
railway logs | grep "/api/quiz/create"
```

### Test Commands (v3.2.0)

```bash
# Run all backend tests (54 tests)
npx vitest run server/__tests__

# Run with coverage
npx vitest run server/__tests__ --coverage

# Run E2E smoke tests
npm run test:e2e

# Type check
npx tsc --noEmit

# Build check
npm run build

# Verify no duplicate folders
node scripts/check-no-duplicate.cjs
```

### Disable Payments

If payment issues:
1. Set `PAYLINK_API_KEY` to invalid value
2. Redeploy
3. Users will see payment unavailable

### Rate Limit Emergency

If under attack:
1. Increase rate limits in code
2. Or temporarily disable affected endpoints
3. Redeploy

### Database Emergency

If database issues:
1. Check Neon dashboard for status
2. Consider failover to backup
3. Contact Neon support

---

## Failure Mode Documentation (v3.0.3)

### Redis Down

**Symptom**: Redis connection errors in logs

**Behavior**:
- System automatically falls back to in-memory idempotency cache
- Cache is capped at 10,000 entries to prevent memory exhaustion
- Oldest entries evicted when limit reached

**Impact**: 
- Idempotency still works but not shared across server restarts
- Quiz queue falls back to synchronous processing

**Recovery**:
1. Check Redis connection string
2. Verify Redis service is running
3. System auto-recovers when Redis available

### AI Providers Down

**Symptom**: Quiz generation fails with AI errors

**Behavior**:
- Automatic fallback chain: Gemini → OpenAI → Claude
- Circuit breaker opens after repeated failures
- Exponential backoff on retries (1s → 10s max)

**Impact**:
- If all providers fail, quiz creation returns error
- Existing quizzes continue to work

**Recovery**:
1. Check AI provider status pages
2. Verify API keys are valid
3. Check API quota/billing
4. Circuit breaker auto-resets after cooldown

### Paylink Down

**Symptom**: Payment creation fails

**Behavior**:
- Payment endpoints return 503 Service Unavailable
- No credits charged during outage
- Webhook processing queued for retry

**Impact**:
- New purchases unavailable
- Existing credits work normally

**Recovery**:
1. Check Paylink status page
2. Verify API credentials
3. Process queued webhooks after recovery

### Memory Pressure (Redis Fallback)

**Symptom**: High memory usage when Redis unavailable

**Mitigation (v3.0.3)**:
- In-memory cache capped at 10,000 entries
- TTL: 30 minutes
- FIFO eviction (oldest-first by `createdAt`) when limit exceeded
- Note: FIFO is appropriate for idempotency cache as entries are written once and checked once

**Monitoring**:
```bash
# Check process memory
ps aux | grep node

# In logs, look for cache cleanup
grep "cache" logs/combined-*.log
```
