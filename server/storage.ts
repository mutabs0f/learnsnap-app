import { db } from "./db";
import { eq, sql, lt, and } from "drizzle-orm";
import {
  quizSessions,
  transactions,
  pageCredits,
  webhookEvents,
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
const FREE_PAGES_EARLY_ADOPTER = 50; // Bonus for first 30 registered users
const EARLY_ADOPTER_LIMIT = 30; // Number of early adopters

export interface IStorage {
  healthCheck(): Promise<void>;
  
  // Quiz Sessions
  createQuizSession(data: InsertQuizSession): Promise<QuizSession>;
  getQuizSessionById(id: string): Promise<QuizSession | undefined>;
  updateQuizSessionContent(id: string, lesson: Lesson, questions: Question[]): Promise<void>;
  updateQuizSessionStatus(id: string, status: string): Promise<void>;
  clearQuizSessionImages(id: string): Promise<void>;
  submitQuizAnswers(id: string, answers: string[], score: number): Promise<void>;
  deleteExpiredSessions(): Promise<number>;

  // Page Credits
  getPageCredits(deviceId: string): Promise<PageCredits | undefined>;
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

  async updateQuizSessionContent(id: string, lesson: Lesson, questions: Question[]): Promise<void> {
    await db.update(quizSessions)
      .set({ lesson, questions, status: "ready" })
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
    
    const [credits] = await db.insert(pageCredits)
      .values({ deviceId, pagesRemaining: FREE_PAGES_GUEST })
      .returning();
    return credits;
  }

  async usePageCredit(deviceId: string): Promise<boolean> {
    return this.usePageCredits(deviceId, 1);
  }

  async usePageCredits(deviceId: string, count: number): Promise<boolean> {
    let credits = await this.getPageCredits(deviceId);
    
    if (!credits) {
      credits = await this.initializeDeviceCredits(deviceId);
    }
    
    // Check if device is on hold (refund)
    if ((credits as any).status === 'on_hold') {
      return false;
    }
    
    if (credits.pagesRemaining && credits.pagesRemaining >= count) {
      await db.update(pageCredits)
        .set({ 
          pagesRemaining: credits.pagesRemaining - count,
          totalPagesUsed: (credits.totalPagesUsed || 0) + count,
          updatedAt: new Date()
        })
        .where(eq(pageCredits.deviceId, deviceId));
      return true;
    }
    
    return false;
  }

  async addPageCredits(deviceId: string, pages: number): Promise<PageCredits> {
    const existing = await this.getPageCredits(deviceId);
    const currentPages = existing?.pagesRemaining || 0;
    return this.createOrUpdatePageCredits(deviceId, currentPages + pages);
  }

  async deductPageCredits(deviceId: string, pages: number): Promise<boolean> {
    const existing = await this.getPageCredits(deviceId);
    if (!existing) return false;
    
    const currentPages = existing.pagesRemaining || 0;
    
    // If user has fewer pages than purchased, they've used some - can't fully refund
    if (currentPages < pages) {
      return false; // This will trigger on_hold status
    }
    
    const newPages = currentPages - pages;
    
    await db.update(pageCredits)
      .set({ pagesRemaining: newPages, updatedAt: new Date() })
      .where(eq(pageCredits.deviceId, deviceId));
    
    return true;
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
          pagesRemaining: (existing.pagesRemaining || 0) + FREE_PAGES_EARLY_ADOPTER,
          isEarlyAdopter: true,
          updatedAt: new Date()
        } as any)
        .where(eq(pageCredits.deviceId, deviceId));
    } else {
      await db.insert(pageCredits)
        .values({ 
          deviceId, 
          pagesRemaining: FREE_PAGES_GUEST + FREE_PAGES_EARLY_ADOPTER,
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
      previousStatus: existing?.status
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
}

export const storage = new DatabaseStorage();
