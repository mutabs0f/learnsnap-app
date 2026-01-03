import { db } from "./db";
import { eq, sql, lt, and } from "drizzle-orm";
import {
  quizSessions,
  transactions,
  pageCredits,
  webhookEvents,
  pendingPayments,
  users,
  emailVerificationTokens,
  userSessions,
  type QuizSession,
  type InsertQuizSession,
  type Transaction,
  type InsertTransaction,
  type PageCredits,
  type InsertPageCredits,
  type WebhookEvent,
  type InsertWebhookEvent,
  type PendingPayment,
  type InsertPendingPayment,
  type Question,
  type Lesson,
  type User,
  type InsertUser,
  type EmailVerificationToken,
  type InsertEmailVerificationToken,
  type UserSession,
  type InsertUserSession,
} from "../shared/schema.js";

// Constants for free pages
const FREE_PAGES_GUEST = 2; // Free pages for guest devices
const DEFAULT_FREE_PAGES = 2; // 2 free pages for all new users
const EARLY_ADOPTER_FREE_PAGES = 50; // 50 free pages for early adopters
const EARLY_ADOPTER_LIMIT = 30; // First 30 users get bonus

export interface IStorage {
  healthCheck(): Promise<void>;
  
  // Quiz Sessions
  createQuizSession(data: InsertQuizSession): Promise<QuizSession>;
  getQuizSessionById(id: string): Promise<QuizSession | undefined>;
  updateQuizSessionContent(id: string, lesson: Lesson, questions: Question[], warnings?: string[]): Promise<void>;
  updateQuizSessionStatus(id: string, status: string): Promise<void>;
  clearQuizSessionImages(id: string): Promise<void>;
  submitQuizAnswers(id: string, answers: string[], score: number): Promise<void>;
  deleteExpiredSessions(): Promise<number>;

  // Page Credits
  getPageCredits(deviceId: string): Promise<PageCredits | undefined>;
  getPageCreditsByUserId(userId: string): Promise<PageCredits | undefined>;
  transferCreditsToDevice(fromUserId: string, toDeviceId: string): Promise<void>;
  createOrUpdatePageCredits(deviceId: string, pagesRemaining: number): Promise<PageCredits>;
  initializeDeviceCredits(deviceId: string): Promise<PageCredits>;
  usePageCredit(deviceId: string): Promise<boolean>;
  usePageCredits(deviceId: string, count: number): Promise<boolean>;
  addPageCredits(deviceId: string, pages: number): Promise<PageCredits>;
  deductPageCredits(deviceId: string, pages: number): Promise<boolean>;
  setDeviceStatus(deviceId: string, status: string): Promise<void>;
  linkDeviceToUser(deviceId: string, userId: string): Promise<void>;
  countEarlyAdopters(): Promise<number>;
  grantEarlyAdopterBonus(deviceId: string): Promise<boolean>;

  // Transactions
  createTransaction(data: InsertTransaction): Promise<Transaction>;
  getTransactionsByDevice(deviceId: string): Promise<Transaction[]>;
  getTransactionByPaymentId(paymentId: string): Promise<Transaction | undefined>;
  createTransactionAndAddCredits(data: InsertTransaction): Promise<{ transaction: Transaction; credits: PageCredits }>;

  // Webhook Events (Idempotency)
  getWebhookEvent(eventId: string): Promise<WebhookEvent | undefined>;
  createWebhookEvent(data: InsertWebhookEvent): Promise<WebhookEvent>;
  updateWebhookEventStatus(eventId: string, status: string): Promise<void>;

  // Pending Payments
  createPendingPayment(data: InsertPendingPayment): Promise<PendingPayment>;
  getPendingPaymentByOrderNumber(orderNumber: string): Promise<PendingPayment | undefined>;
  updatePendingPaymentStatus(orderNumber: string, status: string): Promise<void>;

  // Users
  createUser(data: InsertUser): Promise<User>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  updateUserEmailVerified(userId: string): Promise<void>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
  countUsers(): Promise<number>;

  // Email Verification Tokens
  createEmailVerificationToken(data: InsertEmailVerificationToken): Promise<EmailVerificationToken>;
  getEmailVerificationToken(token: string): Promise<EmailVerificationToken | undefined>;
  deleteEmailVerificationToken(token: string): Promise<void>;
  deleteExpiredVerificationTokens(): Promise<number>;

  // User Sessions
  createUserSession(data: InsertUserSession): Promise<UserSession>;
  getUserSession(token: string): Promise<UserSession | undefined>;
  deleteUserSession(token: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  deleteExpiredUserSessions(): Promise<number>;
  
  // [P1 FIX v2.9.2] Comprehensive cleanup for all expired data
  cleanupAllExpiredData(): Promise<{
    quizSessions: number;
    userSessions: number;
    verificationTokens: number;
    pendingPayments: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async healthCheck(): Promise<void> {
    await db.execute(sql`SELECT 1`);
  }

  // Quiz Sessions
  async createQuizSession(data: InsertQuizSession): Promise<QuizSession> {
    const [session] = await db.insert(quizSessions).values(data).returning();
    return session;
  }

  async getQuizSessionById(id: string): Promise<QuizSession | undefined> {
    const [session] = await db.select().from(quizSessions).where(eq(quizSessions.id, id));
    return session;
  }

  async updateQuizSessionContent(id: string, lesson: Lesson, questions: Question[], warnings?: string[]): Promise<void> {
    await db.update(quizSessions)
      .set({ lesson, questions, warnings: warnings || null, status: "ready" })
      .where(eq(quizSessions.id, id));
  }

  async updateQuizSessionStatus(id: string, status: string): Promise<void> {
    await db.update(quizSessions)
      .set({ status })
      .where(eq(quizSessions.id, id));
  }

  async clearQuizSessionImages(id: string): Promise<void> {
    await db.update(quizSessions)
      .set({ images: null, imageData: null })
      .where(eq(quizSessions.id, id));
  }

  async submitQuizAnswers(id: string, answers: string[], score: number): Promise<void> {
    await db.update(quizSessions)
      .set({ answers, score, status: "completed" })
      .where(eq(quizSessions.id, id));
  }

  async deleteExpiredSessions(): Promise<number> {
    const result = await db.delete(quizSessions)
      .where(lt(quizSessions.expiresAt, new Date()));
    return result.rowCount || 0;
  }

  // Page Credits
  async getPageCredits(deviceId: string): Promise<PageCredits | undefined> {
    const [credits] = await db.select().from(pageCredits).where(eq(pageCredits.deviceId, deviceId));
    return credits;
  }

  // [FIX] Get page credits by userId for logged-in users
  async getPageCreditsByUserId(userId: string): Promise<PageCredits | undefined> {
    const result = await db.select().from(pageCredits).where(eq((pageCredits as any).userId, userId));
    if (result.length === 0) return undefined;
    // Sum all credits for this user across all devices
    let totalPages = 0;
    let isEarlyAdopter = false;
    for (const row of result) {
      totalPages += row.pagesRemaining || 0;
      if ((row as any).isEarlyAdopter) isEarlyAdopter = true;
    }
    return { ...result[0], pagesRemaining: totalPages, isEarlyAdopter } as any;
  }

  // [FIX] Transfer credits from one device to another (for login flow)
  async transferCreditsToDevice(fromUserId: string, toDeviceId: string): Promise<void> {
    const userCredits = await this.getPageCreditsByUserId(fromUserId);
    if (!userCredits || (userCredits.pagesRemaining || 0) <= 0) return;
    
    const existingDevice = await this.getPageCredits(toDeviceId);
    
    if (existingDevice) {
      // Add to existing device credits
      await db.update(pageCredits)
        .set({ 
          pagesRemaining: (existingDevice.pagesRemaining || 0) + (userCredits.pagesRemaining || 0),
          userId: fromUserId,
          isEarlyAdopter: (userCredits as any).isEarlyAdopter || (existingDevice as any).isEarlyAdopter,
          updatedAt: new Date()
        } as any)
        .where(eq(pageCredits.deviceId, toDeviceId));
    } else {
      // Create new device with user's credits
      await db.insert(pageCredits)
        .values({
          deviceId: toDeviceId,
          pagesRemaining: userCredits.pagesRemaining,
          userId: fromUserId,
          isEarlyAdopter: (userCredits as any).isEarlyAdopter
        } as any);
    }
    
    // Clear old temp device credits to avoid double spending
    const tempDeviceId = `google_${fromUserId}`;
    await db.update(pageCredits)
      .set({ pagesRemaining: 0, updatedAt: new Date() })
      .where(eq(pageCredits.deviceId, tempDeviceId));
    
    const emailDeviceId = `email_${fromUserId}`;
    await db.update(pageCredits)
      .set({ pagesRemaining: 0, updatedAt: new Date() })
      .where(eq(pageCredits.deviceId, emailDeviceId));
  }

  async createOrUpdatePageCredits(deviceId: string, pagesRemaining: number): Promise<PageCredits> {
    const existing = await this.getPageCredits(deviceId);
    
    if (existing) {
      await db.update(pageCredits)
        .set({ pagesRemaining, updatedAt: new Date() })
        .where(eq(pageCredits.deviceId, deviceId));
      return { ...existing, pagesRemaining };
    }
    
    const [credits] = await db.insert(pageCredits)
      .values({ deviceId, pagesRemaining })
      .returning();
    return credits;
  }

  async initializeDeviceCredits(deviceId: string): Promise<PageCredits> {
    const existing = await this.getPageCredits(deviceId);
    if (existing) {
      return existing;
    }
    
    // Check early adopter status
    const earlyAdopterCount = await this.countEarlyAdopters();
    const isEarlyAdopter = earlyAdopterCount < EARLY_ADOPTER_LIMIT;
    const freePages = isEarlyAdopter ? EARLY_ADOPTER_FREE_PAGES : FREE_PAGES_GUEST;
    
    const [credits] = await db.insert(pageCredits)
      .values({ 
        deviceId, 
        pagesRemaining: freePages,
        totalPagesUsed: 0,
        isEarlyAdopter: isEarlyAdopter
      } as any)
      .returning();
    
    console.log(`[Credits] New device initialized: ${deviceId.substring(0,8)}... | Pages: ${freePages} | Early Adopter: ${isEarlyAdopter}`);
    console.log(`[DEBUG] Early adopter count: ${earlyAdopterCount}, Limit: ${EARLY_ADOPTER_LIMIT}, Is Early: ${isEarlyAdopter}, Free Pages: ${freePages}`);
    
    return credits;
  }

  async usePageCredit(deviceId: string): Promise<boolean> {
    return this.usePageCredits(deviceId, 1);
  }

  async usePageCredits(deviceId: string, count: number): Promise<boolean> {
    // Use transaction with row-level locking to prevent race conditions
    return await db.transaction(async (tx) => {
      // Lock the row with FOR UPDATE to prevent concurrent reads
      const lockedRows = await tx.execute(
        sql`SELECT * FROM page_credits WHERE device_id = ${deviceId} FOR UPDATE`
      );
      
      // SQL returns snake_case column names
      const row = lockedRows.rows[0] as {
        device_id?: string;
        pages_remaining?: number;
        total_pages_used?: number;
        status?: string;
      } | undefined;
      
      // If no credits exist, initialize them within the transaction
      if (!row) {
        // Check early adopter status
        const earlyAdopterResult = await tx.select({ count: sql<number>`count(*)` })
          .from(pageCredits)
          .where(sql`is_early_adopter = true`);
        const earlyAdopterCount = Number(earlyAdopterResult[0]?.count || 0);
        const isEarlyAdopter = earlyAdopterCount < EARLY_ADOPTER_LIMIT;
        const freePages = isEarlyAdopter ? EARLY_ADOPTER_FREE_PAGES : FREE_PAGES_GUEST;
        
        const inserted = await tx.insert(pageCredits)
          .values({
            deviceId,
            pagesRemaining: freePages,
            totalPagesUsed: 0,
            isEarlyAdopter: isEarlyAdopter,
          } as any)
          .returning();
        const newCredits = inserted[0];
        
        console.log(`[Credits] Auto-initialized on use: ${deviceId.substring(0,8)}... | Pages: ${freePages} | Early Adopter: ${isEarlyAdopter}`);
        
        // Check if there are enough credits after initialization
        const remaining = newCredits.pagesRemaining ?? 0;
        if (remaining < count) {
          return false;
        }
        
        // Deduct from newly created record
        await tx.update(pageCredits)
          .set({ 
            pagesRemaining: remaining - count,
            totalPagesUsed: count,
            updatedAt: new Date()
          })
          .where(eq(pageCredits.deviceId, deviceId));
        
        return true;
      }
      
      // Check if device is on hold (refund)
      if (row.status === 'on_hold') {
        return false;
      }
      
      // Check if there are enough credits
      const remaining = row.pages_remaining ?? 0;
      if (remaining < count) {
        return false;
      }
      
      // Deduct credits atomically within the transaction
      await tx.update(pageCredits)
        .set({ 
          pagesRemaining: remaining - count,
          totalPagesUsed: (row.total_pages_used || 0) + count,
          updatedAt: new Date()
        })
        .where(eq(pageCredits.deviceId, deviceId));
      
      return true;
    });
  }

  async addPageCredits(deviceId: string, pages: number): Promise<PageCredits> {
    // Use transaction with row-level locking to prevent race conditions
    return await db.transaction(async (tx) => {
      const lockedRows = await tx.execute(
        sql`SELECT * FROM page_credits WHERE device_id = ${deviceId} FOR UPDATE`
      );
      
      const row = lockedRows.rows[0] as {
        pages_remaining?: number;
      } | undefined;
      
      if (!row) {
        // Create new record with the added pages
        const [newCredits] = await tx.insert(pageCredits)
          .values({
            deviceId,
            pagesRemaining: pages,
            totalPagesUsed: 0,
          })
          .returning();
        return newCredits;
      }
      
      // Update existing record atomically
      const [updated] = await tx.update(pageCredits)
        .set({ 
          pagesRemaining: (row.pages_remaining || 0) + pages,
          updatedAt: new Date()
        })
        .where(eq(pageCredits.deviceId, deviceId))
        .returning();
      
      return updated;
    });
  }

  async deductPageCredits(deviceId: string, pages: number): Promise<boolean> {
    // Use transaction with row-level locking to prevent race conditions
    return await db.transaction(async (tx) => {
      const lockedRows = await tx.execute(
        sql`SELECT pages_remaining FROM page_credits WHERE device_id = ${deviceId} FOR UPDATE`
      );
      
      const row = lockedRows.rows[0] as { pages_remaining?: number } | undefined;
      
      if (!row) {
        return false;
      }
      
      const currentPages = row.pages_remaining || 0;
      
      // If user has fewer pages than purchased, they've used some - can't fully refund
      if (currentPages < pages) {
        return false;
      }
      
      const newPages = currentPages - pages;
      
      await tx.update(pageCredits)
        .set({ pagesRemaining: newPages, updatedAt: new Date() })
        .where(eq(pageCredits.deviceId, deviceId));
      
      return true;
    });
  }

  async setDeviceStatus(deviceId: string, status: string): Promise<void> {
    await db.update(pageCredits)
      .set({ status, updatedAt: new Date() } as any)
      .where(eq(pageCredits.deviceId, deviceId));
  }
  
  async linkDeviceToUser(deviceId: string, userId: string): Promise<void> {
    const existing = await this.getPageCredits(deviceId);
    
    if (existing) {
      await db.update(pageCredits)
        .set({ userId, updatedAt: new Date() })
        .where(eq(pageCredits.deviceId, deviceId));
    } else {
      await db.insert(pageCredits)
        .values({ deviceId, userId, pagesRemaining: FREE_PAGES_GUEST })
        .onConflictDoUpdate({
          target: pageCredits.deviceId,
          set: { userId, updatedAt: new Date() }
        });
    }
  }

  async countEarlyAdopters(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(pageCredits)
      .where(eq((pageCredits as any).isEarlyAdopter, true));
    return Number(result[0]?.count || 0);
  }

  async grantEarlyAdopterBonus(deviceId: string): Promise<boolean> {
    const existing = await this.getPageCredits(deviceId);
    
    // Check if already an early adopter
    if (existing && (existing as any).isEarlyAdopter) {
      return false; // Already received bonus
    }
    
    // Check if we have room for more early adopters
    const earlyAdopterCount = await this.countEarlyAdopters();
    if (earlyAdopterCount >= EARLY_ADOPTER_LIMIT) {
      return false; // Limit reached
    }
    
    if (existing) {
      await db.update(pageCredits)
        .set({ 
          pagesRemaining: EARLY_ADOPTER_FREE_PAGES,
          isEarlyAdopter: true,
          updatedAt: new Date()
        } as any)
        .where(eq(pageCredits.deviceId, deviceId));
    } else {
      await db.insert(pageCredits)
        .values({ 
          deviceId, 
          pagesRemaining: EARLY_ADOPTER_FREE_PAGES,
          isEarlyAdopter: true
        } as any);
    }
    
    return true;
  }

  // Atomic transaction creation and credit addition to prevent race conditions
  async createTransactionAndAddCredits(data: InsertTransaction): Promise<{ transaction: Transaction; credits: PageCredits }> {
    // Use atomic increment in SQL to prevent lost updates
    const result = await db.transaction(async (tx) => {
      // Try to insert transaction (will fail on duplicate paymentId)
      const [transaction] = await tx.insert(transactions).values(data).returning();
      
      // Atomic credit increment - either insert or update with increment
      const existing = await tx.select().from(pageCredits).where(eq(pageCredits.deviceId, data.deviceId!));
      
      let credits: PageCredits;
      if (existing.length > 0) {
        // Atomic increment using SQL - only add purchased pages (NO free bonus)
        const [updated] = await tx.update(pageCredits)
          .set({ 
            pagesRemaining: sql`${pageCredits.pagesRemaining} + ${data.pagesPurchased}`,
            updatedAt: new Date()
          })
          .where(eq(pageCredits.deviceId, data.deviceId!))
          .returning();
        credits = updated;
      } else {
        // First time - create with purchased pages only (NO free bonus on purchase)
        const [newCredits] = await tx.insert(pageCredits)
          .values({ deviceId: data.deviceId!, pagesRemaining: data.pagesPurchased })
          .returning();
        credits = newCredits;
      }
      
      return { transaction, credits };
    });
    
    return result;
  }

  // Webhook Events for idempotency - uses status column for proper tracking
  async getWebhookEvent(eventId: string): Promise<WebhookEvent | undefined> {
    const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.eventId, eventId));
    return event;
  }

  async createWebhookEvent(data: InsertWebhookEvent): Promise<WebhookEvent> {
    const [event] = await db.insert(webhookEvents).values({
      ...data,
      status: data.status || "processing",
    }).returning();
    return event;
  }

  async updateWebhookEventStatus(eventId: string, status: string, errorMessage?: string): Promise<void> {
    // [FIX] Set processed=true only when status is 'succeeded'
    // This allows retries for failed events
    const processed = status === 'succeeded';
    
    if (errorMessage) {
      // Append error to existing data using jsonb concatenation
      await db.execute(sql`
        UPDATE webhook_events 
        SET status = ${status},
            processed = ${processed},
            data = COALESCE(data, '{}'::jsonb) || ${JSON.stringify({ error: errorMessage, failedAt: new Date().toISOString() })}::jsonb
        WHERE event_id = ${eventId}
      `);
    } else {
      await db.update(webhookEvents)
        .set({ status, processed })
        .where(eq(webhookEvents.eventId, eventId));
    }
  }

  async upsertWebhookEventForProcessing(eventId: string, eventType: string): Promise<{ status: string; isNew: boolean; canProcess: boolean; previousStatus?: string }> {
    // [FIX v6] Two-phase atomic claim with lease timeout for crash recovery
    //
    // Phase 1: Try to INSERT with ON CONFLICT DO NOTHING
    //   - If we insert successfully, we own the event (canProcess=true)
    //   - If conflict, someone else created it first
    //
    // Phase 2: If not inserted, try conditional UPDATE for:
    //   - status='failed' (normal retry)
    //   - status='processing' AND lease expired (crash recovery)
    //   - Lease timeout: 5 minutes (if processing longer, assume crashed)
    
    const LEASE_TIMEOUT_MINUTES = 5;
    const now = new Date().toISOString();
    
    // Phase 1: Try to insert (only succeeds if event doesn't exist)
    const insertResult = await db.execute(sql`
      INSERT INTO webhook_events (id, event_id, event_type, status, processed, data, created_at)
      VALUES (gen_random_uuid(), ${eventId}, ${eventType}, 'processing', false, 
              ${JSON.stringify({ startedAt: now, claimedAt: now })}::jsonb, NOW())
      ON CONFLICT (event_id) DO NOTHING
      RETURNING id
    `);
    
    const wasInserted = (insertResult as any).rows?.length > 0;
    
    if (wasInserted) {
      // We successfully created the event - we own it
      return { 
        status: "processing", 
        isNew: true, 
        canProcess: true 
      };
    }
    
    // Phase 2: Event exists - try to claim it if:
    // - status='failed' (normal retry), OR
    // - status='processing' AND claimedAt is older than 5 minutes (stale lease)
    const updateResult = await db.execute(sql`
      UPDATE webhook_events 
      SET status = 'processing',
          processed = false,
          data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
            'retryAttemptAt', ${now},
            'claimedAt', ${now},
            'previousStatus', status
          )
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
    
    const claimRow = (updateResult as any).rows?.[0];
    
    if (claimRow) {
      // We successfully claimed the event for retry or crash recovery
      return { 
        status: "processing", 
        isNew: false, 
        canProcess: true,
        previousStatus: claimRow.previous_status || "failed"
      };
    }
    
    // Someone else owns this event (processing with valid lease, or succeeded)
    const existing = await this.getWebhookEvent(eventId);
    return { 
      status: existing?.status || "processing", 
      isNew: false,
      canProcess: false,
      previousStatus: existing?.status ?? undefined
    };
  }

  // Transactions
  async createTransaction(data: InsertTransaction): Promise<Transaction> {
    try {
      const [transaction] = await db.insert(transactions).values(data).returning();
      return transaction;
    } catch (error: any) {
      // Check for unique constraint violation (duplicate payment ID)
      if (error.code === '23505' && error.constraint?.includes('payment_id')) {
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

  // Pending Payments - track invoice creation for verification
  async createPendingPayment(data: InsertPendingPayment): Promise<PendingPayment> {
    const [payment] = await db.insert(pendingPayments).values(data).returning();
    return payment;
  }

  async getPendingPaymentByOrderNumber(orderNumber: string): Promise<PendingPayment | undefined> {
    const [payment] = await db.select().from(pendingPayments).where(eq(pendingPayments.orderNumber, orderNumber));
    return payment;
  }

  async updatePendingPaymentStatus(orderNumber: string, status: string): Promise<void> {
    await db.update(pendingPayments)
      .set({ status })
      .where(eq(pendingPayments.orderNumber, orderNumber));
  }

  // Users
  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async updateUserEmailVerified(userId: string): Promise<void> {
    await db.update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await db.update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async countUsers(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(users);
    return Number(result[0]?.count || 0);
  }

  // Email Verification Tokens
  async createEmailVerificationToken(data: InsertEmailVerificationToken): Promise<EmailVerificationToken> {
    const [token] = await db.insert(emailVerificationTokens).values(data).returning();
    return token;
  }

  async getEmailVerificationToken(token: string): Promise<EmailVerificationToken | undefined> {
    const [result] = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.token, token));
    return result;
  }

  async deleteEmailVerificationToken(token: string): Promise<void> {
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.token, token));
  }

  async deleteExpiredVerificationTokens(): Promise<number> {
    const result = await db.delete(emailVerificationTokens)
      .where(lt(emailVerificationTokens.expiresAt, new Date()));
    return result.rowCount || 0;
  }

  // User Sessions
  async createUserSession(data: InsertUserSession): Promise<UserSession> {
    const [session] = await db.insert(userSessions).values(data).returning();
    return session;
  }

  async getUserSession(token: string): Promise<UserSession | undefined> {
    const [session] = await db.select().from(userSessions).where(eq(userSessions.token, token));
    return session;
  }

  async deleteUserSession(token: string): Promise<void> {
    await db.delete(userSessions).where(eq(userSessions.token, token));
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await db.delete(userSessions).where(eq(userSessions.userId, userId));
  }

  async deleteExpiredUserSessions(): Promise<number> {
    const result = await db.delete(userSessions)
      .where(lt(userSessions.expiresAt, new Date()));
    return result.rowCount || 0;
  }
  
  // [P1 FIX v2.9.2] Comprehensive cleanup for all expired data with advisory lock
  async cleanupAllExpiredData(): Promise<{
    quizSessions: number;
    userSessions: number;
    verificationTokens: number;
    pendingPayments: number;
  }> {
    const results = {
      quizSessions: 0,
      userSessions: 0,
      verificationTokens: 0,
      pendingPayments: 0,
    };

    // [P2] Try to acquire advisory lock (prevents multi-instance race on Railway)
    const lockResult = await db.execute(sql`SELECT pg_try_advisory_lock(12345)`);
    const gotLock = (lockResult.rows[0] as { pg_try_advisory_lock: boolean })?.pg_try_advisory_lock === true;
    
    if (!gotLock) {
      // Another instance is running cleanup
      return results;
    }

    try {
      // Quiz sessions
      const q1 = await db.delete(quizSessions).where(lt(quizSessions.expiresAt, new Date()));
      results.quizSessions = q1.rowCount || 0;

      // User sessions
      const q2 = await db.delete(userSessions).where(lt(userSessions.expiresAt, new Date()));
      results.userSessions = q2.rowCount || 0;

      // Email verification tokens
      const q3 = await db.delete(emailVerificationTokens).where(lt(emailVerificationTokens.expiresAt, new Date()));
      results.verificationTokens = q3.rowCount || 0;

      // Pending payments - update to 'expired' instead of delete (audit trail)
      const q4 = await db.update(pendingPayments)
        .set({ status: 'expired' })
        .where(
          and(
            lt(pendingPayments.expiresAt, new Date()),
            eq(pendingPayments.status, 'pending')
          )
        );
      results.pendingPayments = q4.rowCount || 0;

      return results;
    } finally {
      // Release advisory lock
      await db.execute(sql`SELECT pg_advisory_unlock(12345)`);
    }
  }
}

export const storage = new DatabaseStorage();
