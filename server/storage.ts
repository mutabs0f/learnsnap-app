import { db } from "./db";
import { eq, sql, lt, and } from "drizzle-orm";
import logger from "./logger";
import { getCreditOwnerId, hashToken } from "./utils/helpers";
import {
  quizSessions,
  transactions,
  pageCredits,
  webhookEvents,
  pendingPayments,
  users,
  emailVerificationTokens,
  userSessions,
  questionReports,
  questionFeedback,
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
  type QuestionReport,
  type InsertQuestionReport,
  type QuestionFeedback,
  type InsertQuestionFeedback,
} from "../shared/schema.js";

// Constants for free pages
const FREE_PAGES_GUEST = 2; // Free pages for guest devices
const DEFAULT_FREE_PAGES = 2; // 2 free pages for all new users
const EARLY_ADOPTER_FREE_PAGES = 50; // 50 free pages for early adopters
const EARLY_ADOPTER_LIMIT = 30; // First 30 users get bonus

// Idempotency helpers for credit transactions
interface CreditTransaction {
  transactionId: string;
  deviceId: string;
  userId?: string;
  transactionType: 'registration_bonus' | 'early_adopter' | 'purchase' | 'sync' | 'use';
  pagesAmount: number;
  pagesBefore: number;
  pagesAfter: number;
  metadata?: Record<string, any>;
}

// Check if a transaction already happened (idempotency)
async function hasTransactionOccurred(
  deviceId: string, 
  transactionType: string, 
  userId?: string
): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`SELECT 1 FROM credit_transactions 
          WHERE device_id = ${deviceId} 
          AND transaction_type = ${transactionType}
          AND (user_id = ${userId || null} OR (user_id IS NULL AND ${userId} IS NULL))
          LIMIT 1`
    );
    return result.rows.length > 0;
  } catch {
    // Table might not exist yet, return false
    return false;
  }
}

// Record a transaction for idempotency tracking
async function recordTransaction(tx: CreditTransaction): Promise<void> {
  try {
    await db.execute(
      sql`INSERT INTO credit_transactions 
          (transaction_id, device_id, user_id, transaction_type, pages_amount, pages_before, pages_after, metadata)
          VALUES (
            ${tx.transactionId},
            ${tx.deviceId},
            ${tx.userId || null},
            ${tx.transactionType},
            ${tx.pagesAmount},
            ${tx.pagesBefore},
            ${tx.pagesAfter},
            ${JSON.stringify(tx.metadata || {})}
          )
          ON CONFLICT (device_id, transaction_type, user_id) DO NOTHING`
    );
  } catch (err) {
    console.warn('[Credits] Could not record transaction:', err);
  }
}

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
  getPendingPaymentByTransactionNo(transactionNo: string): Promise<PendingPayment | undefined>;
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
  
  // Question Reports (v2.9.5)
  createQuestionReport(data: InsertQuestionReport): Promise<QuestionReport>;
  getQuestionReports(status?: string, page?: number, limit?: number): Promise<{ reports: QuestionReport[]; total: number }>;
  updateQuestionReportStatus(reportId: number, status: string, adminNotes?: string): Promise<void>;
  getQuestionReportStats(): Promise<{ total: number; pending: number; reviewed: number; resolved: number; dismissed: number }>;
  
  // [v2.9.16] Credit owner methods
  transferGuestCreditsToUserOwner(guestDeviceId: string, userId: string): Promise<{ transferred: boolean; amount: number }>;
  initializeUserOwnerCredits(userId: string, isEarlyAdopter: boolean): Promise<{ granted: boolean; pages: number; alreadyHad: boolean }>;
  getCreditsForOwner(deviceId: string, userId?: string | null): Promise<PageCredits | undefined>;
  useCreditsForOwner(deviceId: string, userId: string | null, count: number): Promise<boolean>;
  addCreditsForOwner(deviceId: string, userId: string | null, count: number): Promise<PageCredits>;
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
      .set({ 
        lesson, 
        questions, 
        warnings: warnings || null, 
        status: "ready",
        totalQuestions: questions.length  // [FIX v2.9.31b] Set actual question count
      })
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

  // [FIX v2.9.15] ATOMIC idempotent bonus grant using SELECT FOR UPDATE
  async grantRegistrationBonusAtomic(
    deviceId: string, 
    userId: string, 
    isEarlyAdopter: boolean
  ): Promise<{ granted: boolean; pages: number; alreadyHad: boolean }> {
    const freePages = isEarlyAdopter ? 50 : 2;
    const transactionId = `reg_${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    try {
      // Use a single transaction with advisory lock to prevent race conditions
      const result = await db.transaction(async (tx) => {
        // Try to acquire advisory lock on this user (prevents concurrent grants)
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
        
        // Check if already granted (inside the lock)
        const existingGrant = await tx.execute(
          sql`SELECT 1 FROM credit_transactions 
              WHERE user_id = ${userId}
              AND transaction_type IN ('registration_bonus', 'early_adopter')
              LIMIT 1`
        );
        
        if (existingGrant.rows.length > 0) {
          // Already granted - return without doing anything
          return { granted: false, pages: 0, alreadyHad: true };
        }
        
        // Also check page_credits flag
        const existingFlag = await tx.execute(
          sql`SELECT 1 FROM page_credits 
              WHERE user_id = ${userId}
              AND registration_bonus_granted = true
              LIMIT 1`
        );
        
        if (existingFlag.rows.length > 0) {
          return { granted: false, pages: 0, alreadyHad: true };
        }
        
        // Grant the bonus - ATOMIC insert with ON CONFLICT
        await tx.execute(
          sql`INSERT INTO credit_transactions 
              (transaction_id, device_id, user_id, transaction_type, pages_amount, pages_before, pages_after, metadata)
              VALUES (
                ${transactionId},
                ${deviceId},
                ${userId},
                ${isEarlyAdopter ? 'early_adopter' : 'registration_bonus'},
                ${freePages},
                0,
                ${freePages},
                ${JSON.stringify({ isEarlyAdopter, grantedAt: new Date().toISOString() })}
              )`
        );
        
        // Update or create page_credits with UPSERT
        await tx.execute(
          sql`INSERT INTO page_credits (device_id, user_id, pages_remaining, registration_bonus_granted, is_early_adopter)
              VALUES (${deviceId}, ${userId}, ${freePages}, true, ${isEarlyAdopter})
              ON CONFLICT (device_id) DO UPDATE SET
                pages_remaining = page_credits.pages_remaining + ${freePages},
                user_id = ${userId},
                registration_bonus_granted = true,
                is_early_adopter = COALESCE(page_credits.is_early_adopter, ${isEarlyAdopter}),
                updated_at = NOW()`
        );
        
        return { granted: true, pages: freePages, alreadyHad: false };
      });
      
      if (result.granted) {
        console.log(`[Credits] ✅ Atomic bonus granted: ${freePages} pages to user ${userId.substring(0,8)}...`);
      } else {
        console.log(`[Credits] ℹ️ Bonus already granted to user ${userId.substring(0,8)}...`);
      }
      
      return result;
    } catch (err) {
      console.error('[Credits] ❌ Error in atomic grant:', err);
      // On error, assume it might have been granted to be safe
      return { granted: false, pages: 0, alreadyHad: true };
    }
  }

  // [FIX v2.9.15] Get user's SINGLE credit balance (not sum of all devices)
  async getUserCreditBalance(userId: string): Promise<number> {
    try {
      // Get the MAX from any device (they should all be synced)
      const result = await db.execute(
        sql`SELECT MAX(pages_remaining) as max_pages 
            FROM page_credits 
            WHERE user_id = ${userId}`
      );
      return (result.rows[0] as any)?.max_pages || 0;
    } catch {
      return 0;
    }
  }

  // [FIX v2.9.15] Sync credits to a device (set to user's balance)
  async syncCreditsToDevice(deviceId: string, userId: string): Promise<number> {
    const userBalance = await this.getUserCreditBalance(userId);
    
    await db.execute(
      sql`INSERT INTO page_credits (device_id, user_id, pages_remaining)
          VALUES (${deviceId}, ${userId}, ${userBalance})
          ON CONFLICT (device_id) DO UPDATE SET
            pages_remaining = ${userBalance},
            user_id = ${userId},
            updated_at = NOW()`
    );
    
    return userBalance;
  }

  // [FIX v2.9.10] Transfer credits from TEMP devices only (google_/email_) to browser device
  // This prevents double-counting when browserDevice is already linked to user
  async transferCreditsToDevice(fromUserId: string, toDeviceId: string): Promise<void> {
    // Only get credits from TEMP devices (google_userId or email_userId)
    // NOT from regular browser devices to prevent double-counting
    const googleTempId = `google_${fromUserId}`;
    const emailTempId = `email_${fromUserId}`;
    
    const googleCredits = await this.getPageCredits(googleTempId);
    const emailCredits = await this.getPageCredits(emailTempId);
    
    const tempCredits = (googleCredits?.pagesRemaining || 0) + (emailCredits?.pagesRemaining || 0);
    
    // If no temp credits to transfer, skip
    if (tempCredits <= 0) {
      console.log(`[Transfer] No temp credits to transfer for user ${fromUserId.substring(0,8)}...`);
      return;
    }
    
    const existingDevice = await this.getPageCredits(toDeviceId);
    const isEarlyAdopter = (googleCredits as any)?.isEarlyAdopter || (emailCredits as any)?.isEarlyAdopter;
    
    console.log(`[Transfer] Moving ${tempCredits} pages from temp devices to ${toDeviceId.substring(0,8)}...`, {
      googleCredits: googleCredits?.pagesRemaining || 0,
      emailCredits: emailCredits?.pagesRemaining || 0,
      existingDeviceCredits: existingDevice?.pagesRemaining || 0,
    });
    
    if (existingDevice) {
      // Add ONLY temp credits to existing device
      await db.update(pageCredits)
        .set({ 
          pagesRemaining: (existingDevice.pagesRemaining || 0) + tempCredits,
          userId: fromUserId,
          isEarlyAdopter: isEarlyAdopter || (existingDevice as any).isEarlyAdopter,
          updatedAt: new Date()
        } as any)
        .where(eq(pageCredits.deviceId, toDeviceId));
    } else {
      // Create new device with temp credits
      await db.insert(pageCredits)
        .values({
          deviceId: toDeviceId,
          pagesRemaining: tempCredits,
          userId: fromUserId,
          isEarlyAdopter: isEarlyAdopter
        } as any);
    }
    
    // Clear temp device credits to prevent re-transfer
    if (googleCredits && (googleCredits.pagesRemaining || 0) > 0) {
      await db.update(pageCredits)
        .set({ pagesRemaining: 0, updatedAt: new Date() })
        .where(eq(pageCredits.deviceId, googleTempId));
    }
    
    if (emailCredits && (emailCredits.pagesRemaining || 0) > 0) {
      await db.update(pageCredits)
        .set({ pagesRemaining: 0, updatedAt: new Date() })
        .where(eq(pageCredits.deviceId, emailTempId));
    }
    
    console.log(`[Transfer] Complete. Device ${toDeviceId.substring(0,8)}... now has ${(existingDevice?.pagesRemaining || 0) + tempCredits} pages`);
  }

  async createOrUpdatePageCredits(deviceId: string, pagesRemaining: number): Promise<PageCredits> {
    const existing = await this.getPageCredits(deviceId);
    
    if (existing) {
      // [FIX v2.9.8] Log warning when replacing credits
      if (existing.pagesRemaining !== pagesRemaining) {
        console.warn(`[CREDITS WARNING] Replacing credits for ${deviceId.substring(0,8)}...`, {
          oldPages: existing.pagesRemaining,
          newPages: pagesRemaining,
          diff: pagesRemaining - (existing.pagesRemaining || 0),
        });
      }
      
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
    
    // [FIX v2.9.9] Guests ALWAYS get only 2 pages
    // Early adopter bonus (50 pages) is granted ONLY when user registers/logs in
    // This prevents anonymous devices from consuming early adopter slots
    const freePages = FREE_PAGES_GUEST; // Always 2 for guests
    
    const [credits] = await db.insert(pageCredits)
      .values({ 
        deviceId, 
        pagesRemaining: freePages,
        totalPagesUsed: 0,
        isEarlyAdopter: false // Guest devices are never early adopters
      } as any)
      .returning();
    
    console.log(`[Credits] New guest device initialized: ${deviceId.substring(0,8)}... | Pages: ${freePages} (guest limit)`);
    
    return credits;
  }

  async usePageCredit(deviceId: string): Promise<boolean> {
    return this.usePageCredits(deviceId, 1);
  }

  async usePageCredits(deviceId: string, count: number): Promise<boolean> {
    // Use transaction with row-level locking to prevent race conditions
    const result = await db.transaction(async (tx) => {
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
        // [FIX v2.9.9] Guests ALWAYS get only 2 pages
        // Early adopter bonus is only granted on registration/login
        const freePages = FREE_PAGES_GUEST; // Always 2 for guests
        
        const inserted = await tx.insert(pageCredits)
          .values({
            deviceId,
            pagesRemaining: freePages,
            totalPagesUsed: 0,
            isEarlyAdopter: false, // Guest devices are never early adopters
          } as any)
          .returning();
        const newCredits = inserted[0];
        
        logger.info("Guest credits auto-initialized", {
          operation: "credits_init_guest",
          ownerId: deviceId.substring(0, 12) + "...",
          pagesGranted: freePages,
        });
        
        // Check if there are enough credits after initialization
        const remaining = newCredits.pagesRemaining ?? 0;
        if (remaining < count) {
          return { success: false, pagesBefore: remaining, pagesAfter: remaining };
        }
        
        // Deduct from newly created record
        await tx.update(pageCredits)
          .set({ 
            pagesRemaining: remaining - count,
            totalPagesUsed: count,
            updatedAt: new Date()
          })
          .where(eq(pageCredits.deviceId, deviceId));
        
        return { success: true, pagesBefore: remaining, pagesAfter: remaining - count };
      }
      
      // Check if device is on hold (refund)
      if (row.status === 'on_hold') {
        return { success: false, pagesBefore: row.pages_remaining ?? 0, pagesAfter: row.pages_remaining ?? 0, reason: "on_hold" };
      }
      
      // Check if there are enough credits
      const remaining = row.pages_remaining ?? 0;
      if (remaining < count) {
        return { success: false, pagesBefore: remaining, pagesAfter: remaining, reason: "insufficient" };
      }
      
      // Deduct credits atomically within the transaction
      await tx.update(pageCredits)
        .set({ 
          pagesRemaining: remaining - count,
          totalPagesUsed: (row.total_pages_used || 0) + count,
          updatedAt: new Date()
        })
        .where(eq(pageCredits.deviceId, deviceId));
      
      return { success: true, pagesBefore: remaining, pagesAfter: remaining - count };
    });
    
    // Structured logging for credit usage
    if (result.success) {
      logger.info("Credits used successfully", {
        operation: "credits_use",
        ownerId: deviceId.substring(0, 12) + "...",
        pagesUsed: count,
        pagesBefore: result.pagesBefore,
        pagesAfter: result.pagesAfter,
      });
    } else {
      logger.warn("Credits use failed", {
        operation: "credits_use_failed",
        ownerId: deviceId.substring(0, 12) + "...",
        pagesRequested: count,
        pagesAvailable: result.pagesBefore,
        reason: result.reason || "insufficient",
      });
    }
    
    return result.success;
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
  
  // [FIX v2.9.17] DISABLED - We now use user_<id> as the sole credit owner
  // This function was causing data pollution in page_credits
  // Keeping it as no-op for backward compatibility
  async linkDeviceToUser(deviceId: string, userId: string): Promise<void> {
    // [v2.9.17] NO LONGER WRITES TO page_credits
    // The user_<userId> record is the single source of truth
    // Device records should remain independent (guest credits only)
    
    console.log(`[Credits] linkDeviceToUser() called but DISABLED in v2.9.17 - user_<id> is now sole owner`);
    
    // DO NOTHING - intentionally disabled
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
    const ownerId = data.deviceId!;
    const pagesBefore = await this.getPageCredits(ownerId);
    
    // Use atomic increment in SQL to prevent lost updates
    const result = await db.transaction(async (tx) => {
      // Try to insert transaction (will fail on duplicate paymentId)
      const [transaction] = await tx.insert(transactions).values(data).returning();
      
      // Atomic credit increment - either insert or update with increment
      const existing = await tx.select().from(pageCredits).where(eq(pageCredits.deviceId, ownerId));
      
      let credits: PageCredits;
      if (existing.length > 0) {
        // Atomic increment using SQL - only add purchased pages (NO free bonus)
        const [updated] = await tx.update(pageCredits)
          .set({ 
            pagesRemaining: sql`${pageCredits.pagesRemaining} + ${data.pagesPurchased}`,
            updatedAt: new Date()
          })
          .where(eq(pageCredits.deviceId, ownerId))
          .returning();
        credits = updated;
      } else {
        // First time - create with purchased pages only (NO free bonus on purchase)
        const [newCredits] = await tx.insert(pageCredits)
          .values({ deviceId: ownerId, pagesRemaining: data.pagesPurchased })
          .returning();
        credits = newCredits;
      }
      
      return { transaction, credits };
    });
    
    // Structured logging for payment credits
    logger.info("Credits added from payment", {
      operation: "payment_credits_add",
      ownerId: ownerId.substring(0, 12) + "...",
      pagesAdded: data.pagesPurchased,
      pagesBefore: pagesBefore?.pagesRemaining || 0,
      pagesAfter: result.credits.pagesRemaining,
      paymentId: data.paymentId,
      transactionId: result.transaction.id,
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
      const errorJson = JSON.stringify({ error: errorMessage, failedAt: new Date().toISOString() });
      await db.execute(sql`
        UPDATE webhook_events 
        SET status = ${status},
            processed = ${processed},
            data = COALESCE(data, '{}'::jsonb) || (${errorJson}::text::jsonb)
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
    const jsonData = JSON.stringify({ startedAt: now, claimedAt: now });
    const insertResult = await db.execute(sql`
      INSERT INTO webhook_events (id, event_id, event_type, status, processed, data, created_at)
      VALUES (gen_random_uuid(), ${eventId}, ${eventType}, 'processing', false, 
              ${jsonData}::text::jsonb, NOW())
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

  async getPendingPaymentByTransactionNo(transactionNo: string): Promise<PendingPayment | undefined> {
    const [payment] = await db.select().from(pendingPayments).where(eq(pendingPayments.transactionNo, transactionNo));
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
  // [P1.2] Token is now hashed before storage for security
  async createEmailVerificationToken(data: InsertEmailVerificationToken): Promise<EmailVerificationToken> {
    // Hash the token before storing
    const hashedData = {
      ...data,
      token: hashToken(data.token), // Store hash, not raw token
    };
    const [token] = await db.insert(emailVerificationTokens).values(hashedData).returning();
    return token;
  }

  // [P1.2] Look up by hashed token
  async getEmailVerificationToken(token: string): Promise<EmailVerificationToken | undefined> {
    const hashedToken = hashToken(token);
    const [result] = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.token, hashedToken));
    return result;
  }

  // [P1.2] Delete by hashed token
  async deleteEmailVerificationToken(token: string): Promise<void> {
    const hashedToken = hashToken(token);
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.token, hashedToken));
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
  
  // Question Reports (v2.9.5)
  async createQuestionReport(data: InsertQuestionReport): Promise<QuestionReport> {
    const [report] = await db.insert(questionReports).values(data).returning();
    return report;
  }
  
  async getQuestionReports(status?: string, page: number = 1, limit: number = 20): Promise<{ reports: QuestionReport[]; total: number }> {
    const offset = (page - 1) * limit;
    
    let query;
    let countQuery;
    
    if (status && status !== 'all') {
      query = db.select().from(questionReports)
        .where(eq(questionReports.status, status))
        .orderBy(sql`${questionReports.createdAt} DESC`)
        .limit(limit)
        .offset(offset);
      countQuery = db.select({ count: sql<number>`count(*)` }).from(questionReports)
        .where(eq(questionReports.status, status));
    } else {
      query = db.select().from(questionReports)
        .orderBy(sql`${questionReports.createdAt} DESC`)
        .limit(limit)
        .offset(offset);
      countQuery = db.select({ count: sql<number>`count(*)` }).from(questionReports);
    }
    
    const [reports, countResult] = await Promise.all([query, countQuery]);
    const total = Number(countResult[0]?.count || 0);
    
    return { reports, total };
  }
  
  async updateQuestionReportStatus(reportId: number, status: string, adminNotes?: string): Promise<void> {
    const updateData: any = { 
      status,
      reviewedAt: new Date()
    };
    if (adminNotes !== undefined) {
      updateData.adminNotes = adminNotes;
    }
    await db.update(questionReports).set(updateData).where(eq(questionReports.id, reportId));
  }
  
  async getQuestionReportStats(): Promise<{ total: number; pending: number; reviewed: number; resolved: number; dismissed: number }> {
    const result = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'reviewed') as reviewed,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE status = 'dismissed') as dismissed
      FROM question_reports
    `);
    
    const row = result.rows[0] as any;
    return {
      total: Number(row.total || 0),
      pending: Number(row.pending || 0),
      reviewed: Number(row.reviewed || 0),
      resolved: Number(row.resolved || 0),
      dismissed: Number(row.dismissed || 0),
    };
  }
}

// ========== [NEW v2.9.16] Credit Owner System ==========

// Re-export from centralized helpers to ensure single source of truth
export { getCreditOwnerId } from "./utils/helpers";

/**
 * [FIX v2.9.17] Transfer guest credits to user's owner record (ONE TIME ONLY)
 * Only transfers EXCESS credits above FREE_PAGES_GUEST to prevent 50+2=52 issue
 * This is idempotent - will not transfer again if already done
 */
async function transferGuestCreditsToUserOwnerImpl(
  guestDeviceId: string, 
  userId: string
): Promise<{ transferred: boolean; amount: number }> {
  const userOwnerId = `user_${userId}`;
  const transactionType = 'guest_transfer';
  
  return await db.transaction(async (tx) => {
    // Acquire lock on user to prevent concurrent transfers
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
    
    // Check if already transferred (idempotency)
    const existingTransfer = await tx.execute(
      sql`SELECT 1 FROM credit_transactions 
          WHERE device_id = ${guestDeviceId} 
          AND user_id = ${userId}
          AND transaction_type = ${transactionType}
          LIMIT 1`
    );
    
    if (existingTransfer.rows.length > 0) {
      console.log(`[Credits] Guest transfer already done for ${guestDeviceId.substring(0,8)}... → user_${userId.substring(0,8)}...`);
      return { transferred: false, amount: 0 };
    }
    
    // Get guest credits
    const guestCredits = await tx.execute(
      sql`SELECT pages_remaining FROM page_credits 
          WHERE device_id = ${guestDeviceId} FOR UPDATE`
    );
    
    const guestPages = (guestCredits.rows[0] as any)?.pages_remaining || 0;
    
    // [FIX v2.9.17] Only transfer pages ABOVE the free guest allocation
    // This prevents 50 + 2 = 52 issue
    const transferAmount = Math.max(0, guestPages - FREE_PAGES_GUEST);
    
    // Record that we checked (even if nothing to transfer)
    if (transferAmount <= 0) {
      await tx.execute(
        sql`INSERT INTO credit_transactions 
            (transaction_id, device_id, user_id, transaction_type, pages_amount, pages_before, pages_after, metadata)
            VALUES (
              ${`transfer_${userId}_${guestDeviceId}_${Date.now()}`},
              ${guestDeviceId},
              ${userId},
              ${transactionType},
              0, 0, 0,
              ${JSON.stringify({ 
                guestPages, 
                freePages: FREE_PAGES_GUEST,
                nothingToTransfer: true, 
                checkedAt: new Date().toISOString() 
              })}
            )`
      );
      
      // [FIX v2.9.17] Zero out guest credits anyway to prevent future confusion
      await tx.execute(
        sql`UPDATE page_credits 
            SET pages_remaining = 0, updated_at = NOW()
            WHERE device_id = ${guestDeviceId}`
      );
      
      console.log(`[Credits] No excess credits to transfer from ${guestDeviceId.substring(0,8)}... (had ${guestPages}, free=${FREE_PAGES_GUEST})`);
      return { transferred: false, amount: 0 };
    }
    
    // Get or create user's owner record
    const userOwnerCredits = await tx.execute(
      sql`SELECT pages_remaining FROM page_credits 
          WHERE device_id = ${userOwnerId} FOR UPDATE`
    );
    
    const userCurrentPages = (userOwnerCredits.rows[0] as any)?.pages_remaining || 0;
    const newUserPages = userCurrentPages + transferAmount;
    
    // Add to user's owner record
    await tx.execute(
      sql`INSERT INTO page_credits (device_id, pages_remaining, total_pages_used, created_at, updated_at)
          VALUES (${userOwnerId}, ${newUserPages}, 0, NOW(), NOW())
          ON CONFLICT (device_id) DO UPDATE SET
            pages_remaining = ${newUserPages},
            updated_at = NOW()`
    );
    
    // Zero out guest credits
    await tx.execute(
      sql`UPDATE page_credits 
          SET pages_remaining = 0, updated_at = NOW()
          WHERE device_id = ${guestDeviceId}`
    );
    
    // Record the transfer for idempotency
    await tx.execute(
      sql`INSERT INTO credit_transactions 
          (transaction_id, device_id, user_id, transaction_type, pages_amount, pages_before, pages_after, metadata)
          VALUES (
            ${`transfer_${userId}_${guestDeviceId}_${Date.now()}`},
            ${guestDeviceId},
            ${userId},
            ${transactionType},
            ${transferAmount},
            ${userCurrentPages},
            ${newUserPages},
            ${JSON.stringify({ 
              guestDeviceId, 
              originalGuestPages: guestPages,
              freeGuestPages: FREE_PAGES_GUEST,
              transferredAmount: transferAmount,
              transferredAt: new Date().toISOString() 
            })}
          )`
    );
    
    console.log(`[Credits] ✅ Transferred ${transferAmount} excess pages from guest ${guestDeviceId.substring(0,8)}... to user_${userId.substring(0,8)}... (guest had ${guestPages}, free=${FREE_PAGES_GUEST})`);
    
    return { transferred: true, amount: transferAmount };
  });
}

/**
 * [NEW v2.9.16] Initialize user's owner record with early adopter bonus
 * This replaces the old grantRegistrationBonusAtomic logic
 */
async function initializeUserOwnerCreditsImpl(
  userId: string, 
  isEarlyAdopter: boolean
): Promise<{ granted: boolean; pages: number; alreadyHad: boolean }> {
  const userOwnerId = `user_${userId}`;
  const freePages = isEarlyAdopter ? EARLY_ADOPTER_FREE_PAGES : DEFAULT_FREE_PAGES;
  const transactionType = isEarlyAdopter ? 'early_adopter' : 'registration_bonus';
  
  return await db.transaction(async (tx) => {
    // Lock on user
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
    
    // Check if already granted
    const existingGrant = await tx.execute(
      sql`SELECT 1 FROM credit_transactions 
          WHERE user_id = ${userId}
          AND transaction_type IN ('registration_bonus', 'early_adopter')
          LIMIT 1`
    );
    
    if (existingGrant.rows.length > 0) {
      return { granted: false, pages: 0, alreadyHad: true };
    }
    
    // Check if user owner record exists
    const existing = await tx.execute(
      sql`SELECT pages_remaining FROM page_credits WHERE device_id = ${userOwnerId} FOR UPDATE`
    );
    
    if (existing.rows.length > 0) {
      // Already has record, just add bonus
      await tx.execute(
        sql`UPDATE page_credits 
            SET pages_remaining = pages_remaining + ${freePages},
                is_early_adopter = ${isEarlyAdopter},
                updated_at = NOW()
            WHERE device_id = ${userOwnerId}`
      );
    } else {
      // Create new user owner record
      await tx.execute(
        sql`INSERT INTO page_credits (device_id, pages_remaining, is_early_adopter, total_pages_used, created_at, updated_at)
            VALUES (${userOwnerId}, ${freePages}, ${isEarlyAdopter}, 0, NOW(), NOW())`
      );
    }
    
    // Record the grant
    await tx.execute(
      sql`INSERT INTO credit_transactions 
          (transaction_id, device_id, user_id, transaction_type, pages_amount, pages_before, pages_after, metadata)
          VALUES (
            ${`grant_${userId}_${Date.now()}`},
            ${userOwnerId},
            ${userId},
            ${transactionType},
            ${freePages},
            0,
            ${freePages},
            ${JSON.stringify({ isEarlyAdopter, grantedAt: new Date().toISOString() })}
          )`
    );
    
    console.log(`[Credits] ✅ Granted ${freePages} pages to user_${userId.substring(0,8)}... (${transactionType})`);
    
    return { granted: true, pages: freePages, alreadyHad: false };
  });
}

// Add new v2.9.16 methods to DatabaseStorage class
DatabaseStorage.prototype.transferGuestCreditsToUserOwner = async function(
  guestDeviceId: string, 
  userId: string
): Promise<{ transferred: boolean; amount: number }> {
  return transferGuestCreditsToUserOwnerImpl(guestDeviceId, userId);
};

DatabaseStorage.prototype.initializeUserOwnerCredits = async function(
  userId: string, 
  isEarlyAdopter: boolean
): Promise<{ granted: boolean; pages: number; alreadyHad: boolean }> {
  return initializeUserOwnerCreditsImpl(userId, isEarlyAdopter);
};

DatabaseStorage.prototype.getCreditsForOwner = async function(
  deviceId: string, 
  userId?: string | null
): Promise<PageCredits | undefined> {
  const ownerId = getCreditOwnerId(deviceId, userId);
  const [credits] = await db.select().from(pageCredits).where(eq(pageCredits.deviceId, ownerId));
  return credits;
};

DatabaseStorage.prototype.useCreditsForOwner = async function(
  deviceId: string, 
  userId: string | null, 
  count: number
): Promise<boolean> {
  const ownerId = getCreditOwnerId(deviceId, userId);
  return this.usePageCredits(ownerId, count);
};

DatabaseStorage.prototype.addCreditsForOwner = async function(
  deviceId: string, 
  userId: string | null, 
  pages: number
): Promise<PageCredits> {
  const ownerId = getCreditOwnerId(deviceId, userId);
  return this.addPageCredits(ownerId, pages);
};

// [v3.8.5] Question feedback storage
DatabaseStorage.prototype.createQuestionFeedback = async function(
  data: InsertQuestionFeedback
): Promise<QuestionFeedback> {
  const [feedback] = await db.insert(questionFeedback).values(data).returning();
  return feedback;
};

export const storage = new DatabaseStorage();
