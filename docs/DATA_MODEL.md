# Data Model: Credits Ownership

> **Version**: 2.9.26  
> **Last Updated**: January 8, 2026  
> **Status**: CRITICAL - Read carefully before making changes

## Overview

LearnSnap uses a unique credits ownership model where credits are stored in the `page_credits` table, keyed by a `device_id` column that can hold either:

1. **Guest device ID**: UUID generated on first visit (e.g., `abc123-def456...`)
2. **User owner ID**: Prefixed user ID (e.g., `user_<UUID>`)

## Ownership Rules

### Rule 1: Owner ID Determination

```typescript
function getCreditOwnerId(deviceId: string, userId?: string | null): string {
  if (userId) {
    return `user_${userId}`;  // Logged-in users
  }
  return deviceId;  // Guests
}
```

### Rule 2: Guest Credits

- Every new device gets **2 free pages** (FREE_PAGES_GUEST = 2)
- Device ID is stored in localStorage and sent via cookie
- Guest credits are tied to the device, not a user

### Rule 3: User Credits

- When a user logs in/registers, their credits are stored under `user_<userId>`
- This is a **separate row** from any device rows
- User credits follow the user across devices

### Rule 4: Credit Transfer (Guest → User)

When a user logs in on a device with guest credits:

1. Check if guest has credits above FREE_PAGES_GUEST (2)
2. Calculate **excess**: `guestPages - FREE_PAGES_GUEST`
3. If excess > 0, add to user's `user_<userId>` record
4. Transfer happens **once per device** (idempotent)
5. Guest device keeps its 2 free pages

**Example:**
- Guest device has 5 pages
- User logs in
- Transfer: 5 - 2 = 3 pages moved to user account
- Device keeps 2 pages, user gains 3

### Rule 5: Early Adopter Bonus

- First 30 registered users get 50 bonus pages
- Awarded to `user_<userId>` record
- One-time grant, tracked via credit_transactions table

## Invariants (Must Always Be True)

1. **Never negative**: `pages_remaining >= 0` (enforced by CHECK constraint)
2. **Never negative usage**: `total_pages_used >= 0` (enforced by CHECK constraint)
3. **One transfer per device**: Guest-to-user transfer is idempotent
4. **User credits separate**: `user_<id>` row is distinct from device rows
5. **No double-deduction**: Quiz generation deducts exactly once per quiz
6. **Payment goes to correct owner**: Purchased credits go to `targetOwnerId`

## State Transitions

### New Guest Device

```
State: No page_credits row
Action: First visit or credit check
Result: Row created with device_id, pages_remaining = 2
```

### Guest Registers (Early Adopter)

```
State: Guest has device credits
Action: User registers (within first 30)
Result: 
  1. New row: user_<id>, pages_remaining = 50
  2. Excess guest credits (> 2) transferred once
```

### Guest Registers (Normal)

```
State: Guest has device credits  
Action: User registers (after first 30)
Result:
  1. New row: user_<id>, pages_remaining = 2
  2. Excess guest credits (> 2) transferred once
```

### User Logs In (New Device)

```
State: User exists, new device with 2 guest credits
Action: Login
Result:
  1. Sync credits to user_<id>
  2. If device has excess (> 2), transfer once
```

### User Purchases Credits

```
State: User logged in
Action: Purchase 10 pages
Result: user_<id>.pages_remaining += 10
```

### Guest Purchases Credits

```
State: Guest (not logged in)
Action: Purchase 10 pages
Result: device_id.pages_remaining += 10
```

### Quiz Generation

```
State: User/guest has credits
Action: Generate quiz (5 pages)
Result: owner.pages_remaining -= 5
        owner.total_pages_used += 5
```

## Race Condition Risks

### Risk 1: Concurrent Credit Deduction

**Scenario**: Two quiz generations start simultaneously
**Mitigation**: `FOR UPDATE` row lock in usePageCredits()

### Risk 2: Concurrent Bonus Grant

**Scenario**: Multiple registration requests for same user
**Mitigation**: `pg_advisory_xact_lock` + credit_transactions idempotency

### Risk 3: Concurrent Transfer

**Scenario**: User logs in on two devices simultaneously
**Mitigation**: Idempotent transfer using credit_transactions table

### Risk 4: Payment Webhook Race

**Scenario**: Webhook and verify endpoint both try to add credits
**Mitigation**: 
- paymentId unique constraint
- webhook_events idempotency table

## Common Failure Modes

### Credits Not Reflecting After Login

**Cause**: Session not properly authenticated, API calls missing auth header
**Debug**: Check Authorization header, verify userId in session

### 402 Error But UI Shows Pages

**Cause**: UI showing stale localStorage, or wrong owner being charged
**Debug**: Compare owner ID being charged vs expected

### Credits Disappeared

**Cause**: Logged into different account, or device ID changed
**Debug**: Check page_credits for all related IDs

## Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     page_credits table                          │
├─────────────────────────────────────────────────────────────────┤
│ device_id (PK)    │ pages_remaining │ total_pages_used │ ...   │
├───────────────────┼─────────────────┼──────────────────┼───────┤
│ abc123-def456...  │ 2               │ 0                │ Guest │
│ xyz789-ghi012...  │ 7               │ 3                │ Guest │
│ user_550e8400... │ 50              │ 10               │ User  │
│ user_6ba7b810... │ 15              │ 5                │ User  │
└───────────────────┴─────────────────┴──────────────────┴───────┘
```

## Open Questions

1. Should we migrate to separate `guest_credits` and `user_credits` tables?
2. How do we handle device ID changes (app reinstall, cleared storage)?
3. Should transfer be reversible if user logs out?
