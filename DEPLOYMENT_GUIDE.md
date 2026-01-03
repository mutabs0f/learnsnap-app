# LearnSnap - Railway Deployment Guide

## Prerequisites

1. Railway account
2. All API keys configured
3. Redis add-on (optional but recommended)

## Railway Setup

### 1. Create New Project

```bash
railway login
railway init
railway link
```

### 2. Add Redis Service (Optional - for caching)

```bash
railway add redis
```

This will automatically set REDIS_URL and REDIS_PRIVATE_URL

### 3. Set Environment Variables

Go to Railway dashboard → Settings → Variables:

```
DATABASE_URL=<from-neon>
GEMINI_API_KEY=<your-key>
OPENAI_API_KEY=<your-key>
ANTHROPIC_API_KEY=<your-key>
LEMONSQUEEZY_API_KEY=<your-key>
LEMONSQUEEZY_WEBHOOK_SECRET=<your-key>
RESEND_API_KEY=<your-key>
SESSION_SECRET=<random-string>
ENCRYPTION_KEY=<random-32-char-string>
FRONTEND_URL=https://your-domain.com
NODE_ENV=production
ENABLE_CACHING=true
ENABLE_ASYNC_PROCESSING=true
ENABLE_ENCRYPTION=true
```

### 4. Deploy

```bash
railway up
```

Or push to GitHub and enable auto-deploy.

## Post-Deployment

### 1. Verify Health

```bash
curl https://your-app.railway.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-12-30T...",
  "uptime": 123.45,
  "checks": {
    "database": { "status": true, "latency": 15 },
    "redis": { "status": true },
    "memory": { "used": 150, "total": 512, "percentage": 29 }
  }
}
```

### 2. Test Caching

Create two identical quizzes - the second should be instant!

### 3. Monitor Logs

```bash
railway logs
```

Look for:
- "Redis connected successfully"
- "Quiz result cache hit"
- "Health check passed"

## Estimated Costs (Monthly)

```
Before optimization:
- Railway: $20
- AI calls: $900
- Database: $25
Total: $945/month

After optimization (with Redis):
- Railway: $20
- Redis: $15
- AI calls: $360 (60% cached)
- Database: $25
Total: $420/month

SAVINGS: $525/month (56%)!
```

## Troubleshooting

### Redis Connection Issues

Check environment variables:
```bash
railway variables
```

Verify Redis is running:
```bash
railway run redis-cli ping
```

### High Memory Usage

Check metrics:
```bash
curl https://your-app.railway.app/health
```

If memory > 90%, increase Railway plan.

### Cache Not Working

Check logs for "Redis connected successfully"

If missing, verify REDIS_URL is set.

## Rollback Procedure

```bash
# View deployments
railway deployments

# Rollback to previous
railway rollback <deployment-id>
```

## Monitoring

Set up alerts in Railway dashboard:
- CPU > 80%
- Memory > 85%
- Error rate > 5%

## Support

Issues? Check:
1. /health endpoint
2. Railway logs
3. Redis connection
4. Environment variables
