import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import {
  transactions,
  webhookEvents,
  pendingPayments,
  pageCredits,
  type Transaction,
  type InsertTransaction,
  type WebhookEvent,
  type InsertWebhookEvent,
  type PendingPayment,
  type InsertPendingPayment,
  type PageCredits,
} from "../../shared/schema.js";

export interface IPaymentRepository {
  createTransaction(data: InsertTransaction): Promise<Transaction>;
  getTransactionsByDevice(deviceId: string): Promise<Transaction[]>;
  getTransactionByPaymentId(paymentId: string): Promise<Transaction | undefined>;
  createTransactionAndAddCredits(data: InsertTransaction): Promise<{ transaction: Transaction; credits: PageCredits }>;

  getWebhookEvent(eventId: string): Promise<WebhookEvent | undefined>;
  createWebhookEvent(data: InsertWebhookEvent): Promise<WebhookEvent>;
  updateWebhookEventStatus(eventId: string, status: string): Promise<void>;
  upsertWebhookEventForProcessing(eventId: string, eventType: string): Promise<{ status: string; isNew: boolean; canProcess: boolean; previousStatus?: string }>;

  createPendingPayment(data: InsertPendingPayment): Promise<PendingPayment>;
  getPendingPaymentByOrderNumber(orderNumber: string): Promise<PendingPayment | undefined>;
  getPendingPaymentByTransactionNo(transactionNo: string): Promise<PendingPayment | undefined>;
  updatePendingPaymentStatus(orderNumber: string, status: string): Promise<void>;
}

export class PaymentRepository implements IPaymentRepository {
  async createTransaction(data: InsertTransaction): Promise<Transaction> {
    try {
      const [transaction] = await db.insert(transactions).values(data).returning();
      return transaction;
    } catch (error: unknown) {
      const dbError = error as { code?: string; constraint?: string };
      if (dbError.code === '23505' && dbError.constraint?.includes('payment_id')) {
        throw new Error('DUPLICATE_PAYMENT');
      }
      throw error;
    }
  }

  async getTransactionsByDevice(deviceId: string): Promise<Transaction[]> {
    return db.select().from(transactions).where(eq(transactions.deviceId, deviceId));
  }

  async getTransactionByPaymentId(paymentId: string): Promise<Transaction | undefined> {
    const [transaction] = await db.select().from(transactions).where(eq(transactions.paymentId, paymentId));
    return transaction;
  }

  async createTransactionAndAddCredits(data: InsertTransaction): Promise<{ transaction: Transaction; credits: PageCredits }> {
    return await db.transaction(async (tx) => {
      const [transaction] = await tx.insert(transactions).values(data).returning();
      
      const existingCredits = await tx.select().from(pageCredits).where(eq(pageCredits.deviceId, data.deviceId));
      let credits: PageCredits;
      const pagesToAdd = data.pagesPurchased;
      
      if (existingCredits.length > 0) {
        const [updated] = await tx.update(pageCredits)
          .set({ pagesRemaining: sql`pages_remaining + ${pagesToAdd}` })
          .where(eq(pageCredits.deviceId, data.deviceId))
          .returning();
        credits = updated;
      } else {
        const [created] = await tx.insert(pageCredits)
          .values({ deviceId: data.deviceId, pagesRemaining: pagesToAdd })
          .returning();
        credits = created;
      }
      
      return { transaction, credits };
    });
  }

  async getWebhookEvent(eventId: string): Promise<WebhookEvent | undefined> {
    const result = await db.execute(
      sql`SELECT * FROM webhook_events WHERE event_id = ${eventId}`
    );
    return result.rows[0] as WebhookEvent | undefined;
  }

  async createWebhookEvent(data: InsertWebhookEvent): Promise<WebhookEvent> {
    const [event] = await db.insert(webhookEvents).values(data).returning();
    return event;
  }

  async updateWebhookEventStatus(eventId: string, status: string): Promise<void> {
    const processed = status === "succeeded";
    const existingCheck = await db.execute(
      sql`SELECT 1 FROM webhook_events WHERE event_id = ${eventId}`
    );
    
    if (existingCheck.rows.length === 0) {
      await db.execute(sql`
        INSERT INTO webhook_events (id, event_id, event_type, status, processed, data, created_at)
        VALUES (gen_random_uuid(), ${eventId}, 'unknown', ${status}, ${processed}, '{}'::jsonb, NOW())
      `);
    } else {
      await db.update(webhookEvents)
        .set({ status, processed })
        .where(eq(webhookEvents.eventId, eventId));
    }
  }

  async upsertWebhookEventForProcessing(eventId: string, eventType: string): Promise<{ status: string; isNew: boolean; canProcess: boolean; previousStatus?: string }> {
    const LEASE_TIMEOUT_MINUTES = 5;
    const now = new Date().toISOString();
    
    const jsonData = JSON.stringify({ startedAt: now, claimedAt: now });
    const insertResult = await db.execute(sql`
      INSERT INTO webhook_events (id, event_id, event_type, status, processed, data, created_at)
      VALUES (gen_random_uuid(), ${eventId}, ${eventType}, 'processing', false, 
              ${jsonData}::text::jsonb, NOW())
      ON CONFLICT (event_id) DO NOTHING
      RETURNING id
    `);
    
    const wasInserted = (insertResult as { rows?: unknown[] }).rows?.length ?? 0 > 0;
    
    if (wasInserted) {
      return { status: "processing", isNew: true, canProcess: true };
    }
    
    const retryJson = JSON.stringify({ retryAttemptAt: now, claimedAt: now });
    const updateResult = await db.execute(sql`
      UPDATE webhook_events 
      SET status = 'processing',
          processed = false,
          data = COALESCE(data, '{}'::jsonb) || (${retryJson}::text::jsonb)
      WHERE event_id = ${eventId} 
        AND (
          status = 'failed'
          OR (
            status = 'processing' 
            AND (
              data->>'claimedAt' IS NULL 
              OR (data->>'claimedAt')::timestamp < NOW() - INTERVAL '${sql.raw(String(LEASE_TIMEOUT_MINUTES))} minutes'
            )
          )
        )
      RETURNING id, data->>'previousStatus' as previous_status
    `);
    
    const rows = (updateResult as { rows?: Record<string, unknown>[] }).rows;
    const claimRow = rows?.[0];
    
    if (claimRow) {
      return { 
        status: "processing", 
        isNew: false, 
        canProcess: true,
        previousStatus: (claimRow.previous_status as string) || "failed"
      };
    }
    
    const existing = await this.getWebhookEvent(eventId);
    return { 
      status: existing?.status || "processing", 
      isNew: false,
      canProcess: false,
      previousStatus: existing?.status ?? undefined
    };
  }

  async createPendingPayment(data: InsertPendingPayment): Promise<PendingPayment> {
    const [payment] = await db.insert(pendingPayments).values(data).returning();
    return payment;
  }

  async getPendingPaymentByOrderNumber(orderNumber: string): Promise<PendingPayment | undefined> {
    const [payment] = await db.select().from(pendingPayments).where(eq(pendingPayments.orderNumber, orderNumber));
    return payment;
  }

  async getPendingPaymentByTransactionNo(transactionNo: string): Promise<PendingPayment | undefined> {
    const [payment] = await db.select().from(pendingPayments).where(eq(pendingPayments.transactionNo, transactionNo));
    return payment;
  }

  async updatePendingPaymentStatus(orderNumber: string, status: string): Promise<void> {
    await db.update(pendingPayments)
      .set({ status })
      .where(eq(pendingPayments.orderNumber, orderNumber));
  }
}

export const paymentRepository = new PaymentRepository();
