# Payments Integration

> **Version**: 2.9.26  
> **Last Updated**: January 8, 2026  
> **Provider**: Paylink (Primary)

## Overview

LearnSnap uses Paylink as the primary payment gateway, supporting:
- mada (Saudi debit cards)
- Visa / Mastercard
- Apple Pay
- STC Pay

## Environment Variables

```bash
PAYLINK_API_KEY      # Paylink API key
PAYLINK_SECRET       # Paylink secret for auth
PAYLINK_WEBHOOK_SECRET  # Webhook signature verification (optional)
```

## Payment Flow

### Step 1: Create Invoice

```
Client: POST /api/payment/create
Body: { packageId: "pack_10", deviceId: "abc123-..." }
```

Server:
1. Validate package exists
2. Calculate `targetOwnerId`:
   - If user logged in: `user_<userId>`
   - Else: `deviceId`
3. Create Paylink invoice via API
4. Store pending payment record
5. Return checkout URL

### Step 2: User Completes Payment

User is redirected to Paylink hosted checkout page.

### Step 3: Payment Confirmation

Two paths for confirmation:

#### Path A: Webhook (Preferred)

```
Paylink: POST /api/webhooks/paylink
Body: { transactionNo, orderStatus, amount, note }
```

Server:
1. Verify signature (if PAYLINK_WEBHOOK_SECRET set)
2. Check idempotency via webhook_events
3. Parse metadata from note field
4. **[FIX v2.9.26]** If deviceId missing from note, fallback to `pending_payments` lookup by transactionNo
5. If PAID:
   - Check for existing transaction
   - Add credits to targetOwnerId
   - Update pending payment status

#### Path B: Client Verification (Fallback)

```
Client: POST /api/payment/verify
Body: { transactionNo, orderNumber }
```

Server:
1. **[FIX v2.9.26]** Look up `pending_payments` by orderNumber - this is **authoritative**
2. Use `pendingPayment.deviceId` as final owner (ignore `req.body.deviceId`)
3. Use `pendingPayment.pages` as authoritative pageCount
4. Call Paylink API to get invoice status
5. If PAID and not already processed (idempotency check):
   - Add credits to authoritative owner
   - Mark as processed
6. Log mismatch if metadata differs from pending_payments

## Data Storage

### pending_payments Table

Stores payment state during checkout:

| Field | Purpose |
|-------|---------|
| order_number | Unique order reference |
| transaction_no | Paylink transaction ID |
| device_id | targetOwnerId (user_<id> or deviceId) |
| pages | Pages to add on success |
| amount | Amount in halalas |
| status | pending/paid/failed |

### webhook_events Table

Ensures idempotent webhook processing:

| Field | Purpose |
|-------|---------|
| event_id | Unique event identifier (e.g., `pl_<transactionNo>_PAID`) |
| event_type | Event type (e.g., `paylink_PAID`) |
| status | pending/processing/succeeded/failed |
| data | Event payload (JSON) |

### transactions Table

Records successful payments:

| Field | Purpose |
|-------|---------|
| device_id | Owner who received credits |
| amount | Amount paid (halalas) |
| pages_purchased | Credits added |
| stripe_payment_id | Payment reference (e.g., `pl_<transactionNo>`) |

## Idempotency Strategy

### Problem

Same payment could be confirmed multiple ways:
- Webhook arrives
- Client polls verify endpoint
- Webhook retries on failure

### Solution

1. **Unique Payment ID**: `transactions.stripe_payment_id` is UNIQUE
   - Prevents duplicate credit grants

2. **Webhook Events Table**: Track processing state
   - `processing`: Being handled
   - `succeeded`: Completed
   - `failed`: Error (can retry)

3. **Lease Timeout**: If `processing` for >5 minutes, assume crashed
   - Allows retry by new worker

### Flow

```
Webhook arrives
  ↓
Check webhook_events for event_id
  ↓
If exists and succeeded → Return 200, skip
If exists and processing and not expired → Return 200, skip
  ↓
Mark as processing (atomic)
  ↓
Check transactions for payment_id
  ↓
If exists → Mark succeeded, return
  ↓
Add credits + create transaction (atomic)
  ↓
Mark webhook as succeeded
```

## Error Handling

### Webhook Signature Invalid

- Log warning
- Return 400
- Do not process

### Missing deviceId in Metadata

- Log error
- Mark webhook as failed
- Return 400

### Database Error During Credit Add

- Log error
- Mark webhook as failed
- Will be retried on next webhook

### Duplicate Payment ID

- Transaction insert fails (unique constraint)
- Catch error, treat as success
- Return 200 to prevent retry

## Metadata in Paylink Note

Payment metadata is stored in the invoice `note` field:

```json
{
  "deviceId": "user_abc123...",
  "userId": "abc123...",
  "packageId": "pack_10",
  "pages": 10
}
```

Both webhook and verify endpoint parse this for credit attribution.

## Testing

### Sandbox Mode

Paylink provides sandbox environment:
- Use test API credentials
- Test card numbers available
- Webhook testing via Paylink dashboard

### Test Scenarios

1. **Happy path**: Create → Pay → Credits added
2. **Webhook first**: Webhook arrives before client polls
3. **Verify first**: Client polls before webhook
4. **Both arrive**: No double credit
5. **Webhook retry**: Same webhook 3 times
6. **Payment failed**: Status not PAID
7. **User logged out**: Credits go to stored targetOwnerId

## Monitoring

Log these events:
- Payment created (order_number, amount, pages)
- Webhook received (transactionNo, orderStatus)
- Payment verified (transactionNo, status)
- Credits added (ownerId, pages, paymentId)

Alert on:
- Failed webhook signature verification
- Payment verified but credits not added
- High payment failure rate
