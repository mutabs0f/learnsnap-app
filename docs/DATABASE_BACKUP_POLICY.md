# Database Backup & Recovery Policy

## LearnSnap v3.5.3 - Production Database Operations

---

## 1. Overview

This document defines the backup, recovery, and disaster recovery procedures for LearnSnap's PostgreSQL database hosted on Neon.

### Database Details
- **Provider**: Neon (Serverless PostgreSQL)
- **Engine**: PostgreSQL 15+
- **Hosting**: Neon Cloud (multi-region)
- **Connection**: WebSocket pooling (development), HTTP driver (serverless)

---

## 2. Backup Strategy

### 2.1 Automated Backups (Neon-Managed)

Neon provides automatic continuous backups with point-in-time recovery (PITR):

| Feature | Value |
|---------|-------|
| Backup Type | Continuous WAL archiving |
| Retention | 7 days (Free), 30 days (Pro) |
| PITR Granularity | 1 second |
| Location | Neon Cloud (multi-AZ) |

### 2.2 Application-Level Backups

Additional backup script for critical data export:

```bash
# Run daily via cron or CI/CD
npm run backup:database

# Or manually
npx tsx scripts/backup-database.ts
```

**Backup Contents**:
- Users table (anonymized emails)
- Page credits balances
- Transaction history
- Quiz session metadata (no images)
- Support action audit log

### 2.3 Backup Schedule

| Type | Frequency | Retention | Storage |
|------|-----------|-----------|---------|
| Neon PITR | Continuous | 7-30 days | Neon Cloud |
| Logical Export | Daily 3:00 AM UTC | 30 days | S3/GCS bucket |
| Schema Backup | On deploy | Forever | Git (migrations/) |

---

## 3. Recovery Procedures

### 3.1 Point-in-Time Recovery (PITR)

For accidental data deletion or corruption:

1. **Neon Console**: Navigate to Project > Branches
2. **Create Recovery Branch**: Click "Create Branch from Point in Time"
3. **Select Timestamp**: Choose timestamp before the incident
4. **Verify Data**: Connect to recovery branch and verify data
5. **Promote or Merge**: Either promote as new main or merge data

```bash
# After recovery branch is created, verify:
psql $RECOVERY_DATABASE_URL -c "SELECT COUNT(*) FROM users;"
psql $RECOVERY_DATABASE_URL -c "SELECT SUM(pages_remaining) FROM page_credits;"
```

### 3.2 Logical Restore

For full database restore from export:

```bash
# Restore from SQL dump
psql $DATABASE_URL < backups/learnsnap_backup_20260110.sql

# Verify integrity
npm run db:verify
```

### 3.3 Table-Level Recovery

For recovering specific tables:

```bash
# Export from backup
pg_dump $BACKUP_DB -t page_credits > page_credits_backup.sql

# Restore to production (after verification)
psql $DATABASE_URL < page_credits_backup.sql
```

---

## 4. Disaster Recovery

### 4.1 Recovery Point Objective (RPO)

| Scenario | Maximum Data Loss |
|----------|-------------------|
| Neon PITR available | < 1 second |
| Daily backup only | < 24 hours |

### 4.2 Recovery Time Objective (RTO)

| Scenario | Target Recovery Time |
|----------|---------------------|
| PITR branch creation | 5 minutes |
| Full restore from dump | 30 minutes |
| New environment setup | 2 hours |

### 4.3 Disaster Recovery Runbook

**Level 1: Data Corruption (< 24h old)**
1. Pause application (set MAINTENANCE_MODE=true)
2. Create PITR branch in Neon console
3. Verify recovered data
4. Update DATABASE_URL to recovery branch
5. Resume application

**Level 2: Neon Region Outage**
1. Wait for Neon status page update
2. If > 1 hour, provision new Neon project
3. Restore from latest logical backup
4. Update DNS/secrets for new database
5. Resume application

**Level 3: Complete Data Loss**
1. Provision new Neon project
2. Run migrations: `npm run db:push`
3. Restore from logical backup
4. Verify all tables
5. Resume with reduced functionality

---

## 5. Data Retention Policy

### 5.1 Active Data

| Data Type | Retention | Reason |
|-----------|-----------|--------|
| User accounts | Indefinite | User choice |
| Page credits | Indefinite | Purchased asset |
| Transactions | 7 years | Financial records |
| Quiz sessions | 24 hours | Temporary data |

### 5.2 Automatic Cleanup

The application runs daily cleanup for:
- Expired quiz sessions (> 24h)
- Expired verification tokens (> 24h)
- Expired user sessions (> 30 days)
- Expired pending payments (> 24h)

### 5.3 GDPR/Privacy Compliance

On user deletion request:
1. Anonymize user email: `deleted_{uuid}@deleted.local`
2. Nullify password hash
3. Delete user sessions
4. Keep transaction records (legal requirement)
5. Keep page credits (transferable)

---

## 6. Monitoring & Alerts

### 6.1 Health Checks

- `/health` - Basic database connectivity
- `/health/db` - Full database health with pool metrics

### 6.2 Metrics to Monitor

| Metric | Warning | Critical |
|--------|---------|----------|
| Pool utilization | > 80% | > 95% |
| Query latency (P95) | > 500ms | > 2000ms |
| Failed connections | > 5/min | > 20/min |
| Waiting clients | > 0 | > 5 |

### 6.3 Alerting

Configure alerts in your monitoring system:

```yaml
# Example Prometheus alerts
- alert: DatabasePoolExhausted
  expr: db_pool_waiting > 0
  for: 5m
  annotations:
    summary: "Database connection starvation"

- alert: DatabaseHighLatency
  expr: db_query_duration_p95 > 2
  for: 5m
  annotations:
    summary: "Database queries are slow"
```

---

## 7. Verification Checklist

Run monthly verification:

- [ ] Verify Neon backup status in console
- [ ] Test PITR recovery on staging branch
- [ ] Verify logical backup file integrity
- [ ] Test restore procedure on staging
- [ ] Review retention policy compliance
- [ ] Update this document if needed

---

## 8. Emergency Contacts

| Role | Contact |
|------|---------|
| Database Admin | [Your admin] |
| Neon Support | support@neon.tech |
| On-call Engineer | [Your on-call] |

---

**Last Updated**: January 10, 2026
**Version**: 3.5.3
**Owner**: LearnSnap Engineering Team
