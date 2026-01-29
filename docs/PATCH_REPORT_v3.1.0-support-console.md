# Patch Report: v3.1.0 Support Console

**Date**: January 9, 2026  
**Type**: Feature Addition  
**Risk Level**: Low  
**Breaking Changes**: None

## Summary

This patch adds a **Manual Support Console** for admin customer service operations:
- User/device/transaction lookup
- Grant/reverse page credits
- Resend verification emails
- Manual email verification
- Full audit trail with idempotency

## Changes Made

### 1. Database Schema: support_actions Table

**File**: `shared/schema.ts`

```typescript
export const supportActions = pgTable("support_actions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  adminIdentifier: text("admin_identifier").notNull(),
  targetUserId: text("target_user_id"),
  targetDeviceId: text("target_device_id"),
  actionType: text("action_type").notNull(), // GRANT_PAGES | REVERSE_PAGES | RESEND_VERIFICATION | MARK_VERIFIED
  amountPages: integer("amount_pages"),
  reasonCode: text("reason_code").notNull(), // COMPENSATION | PROMO | BUG | FRAUD_REVIEW | OTHER
  referenceId: text("reference_id").notNull(), // ticket/whatsapp/email number
  notes: text("notes"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  beforeSnapshot: jsonb("before_snapshot"),
  afterSnapshot: jsonb("after_snapshot"),
  status: text("status").notNull(), // PENDING | APPLIED | FAILED | REJECTED
  error: text("error"),
});
```

**Indexes Created**:
- `idx_support_actions_target_user_id` - Fast lookup by user
- `idx_support_actions_target_device_id` - Fast lookup by device
- `idx_support_actions_created_at` - Chronological queries
- `idx_support_actions_idempotency_key` - UNIQUE constraint for idempotency

### 2. Backend API Routes

**File**: `server/support-routes.ts`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/support/lookup` | GET | Search by email/userId/deviceId/transactionNo |
| `/api/admin/support/grant-pages` | POST | Add page credits to user/device |
| `/api/admin/support/reverse-pages` | POST | Deduct page credits from user/device |
| `/api/admin/support/resend-verification` | POST | Resend email verification |
| `/api/admin/support/mark-verified` | POST | Manually verify email |
| `/api/admin/support/actions` | GET | List all support actions (audit log) |

**Security**:
- Admin password authentication via `x-admin-password` header
- Rate limiting: 30 requests/minute
- Idempotency via unique keys with DB constraint

**Idempotency Pattern**:
```typescript
// 1. Check if action already exists
const existing = await db.select().from(supportActions)
  .where(eq(supportActions.idempotencyKey, key));

if (existing.length > 0) {
  if (existing[0].status === "APPLIED") return { idempotent: true };
  return { error: "IDEMPOTENCY_CONFLICT" };
}

// 2. Insert with PENDING status first (DB enforces UNIQUE)
const inserted = await db.insert(supportActions).values({
  status: "PENDING",
  idempotencyKey: key,
  beforeSnapshot: { pagesRemaining, totalPagesUsed },
  ...
}).returning();

// 3. Perform action
const result = await storage.addPageCredits(ownerId, amount);

// 4. Update to final status
await db.update(supportActions)
  .set({ status: "APPLIED", afterSnapshot: { ... } })
  .where(eq(supportActions.id, inserted[0].id));
```

### 3. Frontend UI

**File**: `client/src/pages/admin.tsx`

Added "Support Tools" section with:
- Search dropdown (email/userId/deviceId/transactionNo)
- Lookup results display (user info, credits, recent payments, recent actions)
- Action forms:
  - Grant pages (amount + reason + reference)
  - Reverse pages (amount + reason + reference)
  - Resend verification (reason + reference)
  - Mark verified (reason + reference + confirmation)
- Success/error feedback messages in Arabic

### 4. Route Registration

**File**: `server/routes.ts`

```typescript
import supportRoutes from "./support-routes";
// ...
app.use("/api/admin/support", supportRoutes);
```

## Files Changed

| File | Change Type |
|------|-------------|
| `shared/schema.ts` | Modified (added supportActions table) |
| `server/support-routes.ts` | Created (6 endpoints) |
| `server/routes.ts` | Modified (route registration) |
| `client/src/pages/admin.tsx` | Modified (Support Tools UI) |
| `replit.md` | Modified (v3.1.0 notes) |

## Database Migrations

Run automatically via raw SQL on first deployment:
```sql
CREATE TABLE IF NOT EXISTS support_actions (...);
CREATE INDEX IF NOT EXISTS idx_support_actions_target_user_id ON support_actions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_support_actions_target_device_id ON support_actions(target_device_id);
CREATE INDEX IF NOT EXISTS idx_support_actions_created_at ON support_actions(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_support_actions_idempotency_key ON support_actions(idempotency_key);
```

## Testing

- [x] Lookup by email works
- [x] Lookup by deviceId works
- [x] Lookup by transactionNo works
- [x] Grant pages updates credits correctly
- [x] Reverse pages deducts credits correctly
- [x] Idempotency prevents duplicate operations
- [x] Before/after snapshots captured
- [x] Arabic UI displays correctly
- [x] Rate limiting enforced

## Usage Guide

### Lookup User
1. Go to Admin Dashboard (`/admin`)
2. Scroll to "Support Tools" section
3. Select search type (email/userId/deviceId/transactionNo)
4. Enter value and click search
5. View user info, credits, and history

### Grant Pages
1. Lookup user first
2. Fill in:
   - Reason code (Compensation/Promo/Bug/Fraud Review/Other)
   - Reference ID (ticket number like "WA-12345")
   - Amount of pages
3. Click "Add"
4. Verify success message

### Reverse Pages
1. Lookup user first
2. Fill in reason and reference
3. Enter amount (max = current balance)
4. Click "Reverse"
5. Verify success message

### Manual Email Verification
1. Lookup unverified user
2. Fill in reason and reference
3. Click "Mark Verified"
4. Confirm in popup
5. User can now use email features

## Rollback Plan

If issues arise:
1. Remove route registration from `server/routes.ts`
2. Table can remain (data is append-only audit log)
3. Frontend section hidden by removing from admin.tsx

## Notes

- All actions are append-only (never delete from support_actions)
- Status values: PENDING, APPLIED, FAILED, REJECTED
- Max 500 pages per grant/reverse action
- Requires ADMIN_PASSWORD environment variable
