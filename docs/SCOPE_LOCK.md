# Scope Lock Document

> **Purpose**: Define what changes are allowed vs. forbidden to maintain system stability  
> **Last Updated**: January 9, 2026 (v2.9.32 Security Patch)

## Critical Warning

The credits system and ownership model are **fragile**. Changes without proper documentation and testing have caused production issues including:

- Credits appearing/disappearing unexpectedly
- Users seeing 402 errors while UI shows they have pages
- Credits "bleeding" between accounts on shared devices
- Purchased credits not reflecting immediately

## Allowed Changes

These changes are permitted with proper review:

| Area | Allowed | Requirements |
|------|---------|--------------|
| UI/UX | New components, styling | Follow design_guidelines.md |
| New API Endpoints | Adding new routes | Document in API_CONTRACT.md |
| Bug Fixes | Fixing existing behavior | Add test case to TEST_PLAN.md |
| Performance | Query optimization | No behavior changes |
| Logging | Adding structured logs | Use existing logger pattern |
| New Features | Scoped additions | PRD update required |

## Forbidden Changes

These changes require explicit approval and documentation update:

### 1. Credits Ownership Model (HIGH RISK)

**Forbidden without approval:**
- Changing `getCreditOwnerId()` logic
- Modifying how `user_<id>` vs `deviceId` is determined
- Changing guest-to-user credit transfer logic
- Modifying early adopter bonus granting
- Changing when/how credits are deducted

**If change is approved:**
1. Update DATA_MODEL.md
2. Update CREDITS_AND_BILLING.md
3. Add migration path for existing users
4. Create rollback plan
5. Test on staging with real data patterns

### 2. Database Schema (MEDIUM RISK)

**Forbidden without approval:**
- Changing primary key types
- Dropping columns
- Changing column types
- Removing NOT NULL constraints

**If change is approved:**
1. Update DATABASE_SCHEMA.md
2. Create migration script
3. Test migration on copy of production data
4. Plan for downtime if needed

### 3. Payment Integration (HIGH RISK)

**Forbidden without approval:**
- Changing webhook signature verification
- Modifying idempotency checks
- Changing how credits are added after payment
- Modifying the targetOwnerId calculation

**If change is approved:**
1. Update PAYMENTS.md
2. Test with sandbox payments
3. Monitor webhooks for 24h post-deploy

### 4. Authentication Flow (MEDIUM RISK)

**Forbidden without approval:**
- Changing session token format
- Modifying Google OAuth flow
- Changing how userId is extracted from auth

**If change is approved:**
1. Update AUTH section in API_CONTRACT.md
2. Test all auth flows end-to-end

## Change Control Checklist

Before merging any PR, verify:

### For API Changes
- [ ] Updated API_CONTRACT.md with new/modified endpoints
- [ ] Updated request/response examples
- [ ] Added error codes documentation

### For Database Changes
- [ ] Updated DATABASE_SCHEMA.md
- [ ] Created migration file in `script/`
- [ ] Tested migration on dev database
- [ ] No destructive changes to existing data

### For Credits Logic Changes
- [ ] Updated DATA_MODEL.md invariants
- [ ] Updated CREDITS_AND_BILLING.md rules
- [ ] Added debug queries for new scenarios
- [ ] Tested: guest, logged-in, purchase, transfer flows
- [ ] Tested: same device, different accounts

### For Payment Changes
- [ ] Updated PAYMENTS.md
- [ ] Tested with Paylink sandbox
- [ ] Verified webhook idempotency
- [ ] Tested: success, failure, retry scenarios

### For All Changes
- [ ] Updated CHANGELOG.md
- [ ] No secrets in code
- [ ] Structured logging added
- [ ] Error messages in Arabic where user-facing

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.9.23 | 2026-01-07 | Initial scope lock document |

## Security Constraints (v2.9.32)

The following security invariants must be maintained:

1. **No raw HTML injection from AI outputs**
   - All AI-generated diagrams must be validated as safe SVG
   - No use of `dangerouslySetInnerHTML` for AI content
   
2. **Webhooks must be cryptographically verified in production**
   - `PAYLINK_WEBHOOK_SECRET` is required in production
   - Missing signature = request rejected

3. **OAuth tokens protected from leakage**
   - Tokens passed via URL fragment, not query string
   - Fragment cleaned up after reading

4. **Fail-closed security model**
   - Missing `SESSION_SECRET` in production = server exit
   - Missing `FRONTEND_URL` in production = server exit
   - Admin without password in production = admin disabled

## Approval Authority

Changes to forbidden areas require approval from:
- Product Owner (for scope changes)
- Tech Lead (for architecture changes)
- Admin: BasemAlmutairi1989@gmail.com
