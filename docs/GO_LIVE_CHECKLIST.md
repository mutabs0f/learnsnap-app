# Go-Live Checklist

> **Version**: LearnSnap PROD_READY  
> **Last Updated**: January 9, 2026

## Pre-Deployment Checklist

### 0. Manual Steps (Before Deploying)

Run these commands locally before pushing to production:

```bash
# Update package.json version to match release
npm version 3.0.3 --no-git-tag-version

# Commit and push
git add package.json
git commit -m "chore: bump version to 3.0.3"
git push origin main
```

### 1. Environment Variables (Railway)

Set these in Railway dashboard → Service → Variables:

#### Required (Server Will Not Start Without These)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string | `postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require` |
| `SESSION_SECRET` | Random 32+ char string for CSRF/sessions | `your-random-32-char-string-here` |
| `FRONTEND_URL` | Production domain | `https://learnsnap.app` |
| `DEVICE_TOKEN_SECRET` | Random 32+ char string | `another-random-32-char-string` |

#### AI Providers (At Least One Required)

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key (primary) |
| `OPENAI_API_KEY` | OpenAI API key (fallback) |
| `ANTHROPIC_API_KEY` | Anthropic API key (final fallback) |

#### Google OAuth

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret |

**Important**: Add callback URL to Google Console:
```
https://YOUR_DOMAIN/api/auth/google/callback
```

#### Payment (Paylink)

| Variable | Description |
|----------|-------------|
| `PAYLINK_API_ID` | Paylink API ID |
| `PAYLINK_SECRET_KEY` | Paylink secret key |
| `PAYLINK_WEBHOOK_SECRET` | Webhook signature secret (REQUIRED in production) |
| `PAYLINK_ENVIRONMENT` | `production` or `testing` |

**Important**: Configure webhook URL in Paylink dashboard:
```
https://YOUR_DOMAIN/api/webhooks/paylink
```

#### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection (enables async queue) | Falls back to sync processing |
| `RESEND_API_KEY` | Resend email API key | Email disabled |
| `ADMIN_PASSWORD` | Admin dashboard password | Admin disabled |
| `ENABLE_ADMIN` | Enable admin routes | `false` |
| `SENTRY_DSN` | Error tracking | Disabled |
| `QUIZ_DAILY_LIMIT` | Max quizzes per device/day | `60` |
| `CSP_REPORT_ONLY` | CSP in report-only mode | `false` |

---

## Railway Setup Steps

### Step 1: Create Project

1. Go to [Railway](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Connect your LearnSnap repository

### Step 2: Add Environment Variables

1. Click on the service
2. Go to "Variables" tab
3. Add all required variables from the table above
4. Use "Raw Editor" for bulk paste:

```bash
DATABASE_URL=your-neon-url
SESSION_SECRET=your-32-char-secret
FRONTEND_URL=https://your-domain.railway.app
DEVICE_TOKEN_SECRET=your-32-char-secret
GEMINI_API_KEY=your-gemini-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret
PAYLINK_API_ID=your-paylink-id
PAYLINK_SECRET_KEY=your-paylink-secret
PAYLINK_WEBHOOK_SECRET=your-webhook-secret
NODE_ENV=production
```

### Step 3: Add Redis Service (Optional but Recommended)

1. Click "New Service" → "Database" → "Redis"
2. Railway auto-adds `REDIS_URL` to your main service
3. Benefits: Async quiz processing, better reliability

### Step 4: Configure Domain

1. Go to "Settings" → "Networking"
2. Generate Railway domain or add custom domain
3. Update `FRONTEND_URL` variable to match
4. Update Google OAuth callback URL

### Step 5: Deploy

1. Railway auto-deploys on git push to main
2. Or click "Deploy" button manually
3. Watch build logs for errors

---

## Smoke Test After Deployment

### Essential Checks

```bash
# 1. Health check
curl https://YOUR_DOMAIN/health
# Expected: {"status":"healthy","timestamp":"..."}

# 2. Liveness check
curl https://YOUR_DOMAIN/health/live
# Expected: {"alive":true}

# 3. CSRF token endpoint
curl https://YOUR_DOMAIN/api/csrf-token
# Expected: {"token":"..."}

# 4. Homepage loads
curl -I https://YOUR_DOMAIN/
# Expected: 200 OK with HTML content
```

### Manual Verification

- [ ] Homepage loads correctly
- [ ] RTL Arabic text displays properly
- [ ] Login with Google works
- [ ] Guest can see 2 free pages
- [ ] Image upload works
- [ ] Quiz generation completes
- [ ] Payment flow redirects to Paylink

---

## First Week Monitoring

### What to Watch

1. **Webhooks**: Check `webhook_events` table for incoming payments
2. **Credits**: Monitor `page_credits` for anomalies
3. **AI Errors**: Check logs for Gemini/OpenAI failures
4. **Rate Limiting**: Watch for 429 errors in logs

### Log Queries

```bash
# Railway logs
railway logs --follow

# Filter errors
railway logs | grep -i error
```

### Database Queries

```sql
-- Recent transactions
SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10;

-- Failed webhooks
SELECT * FROM webhook_events WHERE processed = false;

-- Credit anomalies (unusually high balances)
SELECT * FROM page_credits WHERE pages_remaining > 100;
```

---

## Rollback Plan

### Option 1: Railway Rollback

1. Go to Railway → Deployments
2. Find last working deployment
3. Click "Redeploy"

### Option 2: Git Revert

```bash
git revert HEAD
git push origin main
```

### Option 3: Database Rollback

If data corruption:
1. Contact Neon support for point-in-time recovery
2. Or restore from backup (if configured)

---

## Emergency Procedures

### Disable Payments

```bash
# Set PAYLINK_API_ID to invalid value
# Redeploy
```

### Disable AI

```bash
# Remove all AI keys
# Users will see "service unavailable"
```

### Rate Limit Attack

1. Check request patterns in logs
2. Temporarily increase rate limits or
3. Add IP blocks at CDN level

---

## Security Reminders

**DO NOT:**
- Log secrets or API keys
- Commit .env files
- Share ADMIN_PASSWORD
- Disable CSRF in production
- Skip webhook signature verification

**DO:**
- Use unique SESSION_SECRET per environment
- Rotate API keys periodically
- Monitor error logs daily first week
- Keep ADMIN_PASSWORD secure

---

## Support Contacts

- **Admin**: BasemAlmutairi1989@gmail.com
- **Railway**: https://railway.app/help
- **Neon**: https://neon.tech/docs/introduction/support
- **Paylink**: Contact via dashboard
