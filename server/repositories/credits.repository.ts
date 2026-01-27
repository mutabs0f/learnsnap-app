import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import logger from "../logger";
import { getCreditOwnerId } from "../utils/helpers";
import {
  pageCredits,
  type PageCredits,
} from "../../shared/schema.js";

const FREE_PAGES_GUEST = 2;
const DEFAULT_FREE_PAGES = 2;
const EARLY_ADOPTER_FREE_PAGES = 50;
const EARLY_ADOPTER_LIMIT = 30;

export interface ICreditsRepository {
  getPageCredits(deviceId: string): Promise<PageCredits | undefined>;
  getPageCreditsByUserId(userId: string): Promise<PageCredits | undefined>;
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
  
  transferGuestCreditsToUserOwner(guestDeviceId: string, userId: string): Promise<{ transferred: boolean; amount: number }>;
  initializeUserOwnerCredits(userId: string, isEarlyAdopter: boolean): Promise<{ granted: boolean; pages: number; alreadyHad: boolean }>;
  getCreditsForOwner(deviceId: string, userId?: string | null): Promise<PageCredits | undefined>;
  useCreditsForOwner(deviceId: string, userId: string | null, count: number): Promise<boolean>;
  addCreditsForOwner(deviceId: string, userId: string | null, count: number): Promise<PageCredits>;
}

export class CreditsRepository implements ICreditsRepository {
  async getPageCredits(deviceId: string): Promise<PageCredits | undefined> {
    const [credits] = await db.select().from(pageCredits).where(eq(pageCredits.deviceId, deviceId));
    return credits;
  }

  async getPageCreditsByUserId(userId: string): Promise<PageCredits | undefined> {
    const result = await db.execute(
      sql`SELECT * FROM page_credits WHERE user_id = ${userId}`
    );
    if (result.rows.length === 0) return undefined;
    let totalPages = 0;
    let isEarlyAdopter = false;
    for (const row of result.rows) {
      const r = row as Record<string, unknown>;
      totalPages += (r.pages_remaining as number) || 0;
      if (r.is_early_adopter) isEarlyAdopter = true;
    }
    const firstRow = result.rows[0] as Record<string, unknown>;
    return { 
      id: firstRow.id as string,
      deviceId: firstRow.device_id as string,
      pagesRemaining: totalPages,
      totalPagesUsed: firstRow.total_pages_used as number,
      createdAt: firstRow.created_at as Date,
      updatedAt: firstRow.updated_at as Date,
      isEarlyAdopter: isEarlyAdopter
    } as PageCredits;
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
    if (existing) return existing;
    
    const freePages = FREE_PAGES_GUEST;
    
    const [credits] = await db.insert(pageCredits)
      .values({ 
        deviceId, 
        pagesRemaining: freePages,
        totalPagesUsed: 0
      })
      .returning();
    
    logger.info("Guest credits initialized", { deviceId: deviceId.substring(0, 8), pages: freePages });
    
    return credits;
  }

  async usePageCredit(deviceId: string): Promise<boolean> {
    return this.usePageCredits(deviceId, 1);
  }

  async usePageCredits(deviceId: string, count: number): Promise<boolean> {
    const result = await db.transaction(async (tx) => {
      const lockedRows = await tx.execute(
        sql`SELECT * FROM page_credits WHERE device_id = ${deviceId} FOR UPDATE`
      );
      
      const row = lockedRows.rows[0] as {
        pages_remaining?: number;
        total_pages_used?: number;
        status?: string;
      } | undefined;
      
      if (!row) {
        const freePages = FREE_PAGES_GUEST;
        await tx.insert(pageCredits)
          .values({
            deviceId,
            pagesRemaining: freePages,
            totalPagesUsed: 0
          })
          .returning();
        
        if (freePages < count) {
          return { success: false };
        }
        
        await tx.update(pageCredits)
          .set({ 
            pagesRemaining: freePages - count,
            totalPagesUsed: count,
            updatedAt: new Date()
          })
          .where(eq(pageCredits.deviceId, deviceId));
        
        return { success: true };
      }
      
      if (row.status === 'on_hold') {
        return { success: false };
      }
      
      const remaining = row.pages_remaining ?? 0;
      if (remaining < count) {
        return { success: false };
      }
      
      await tx.update(pageCredits)
        .set({ 
          pagesRemaining: remaining - count,
          totalPagesUsed: (row.total_pages_used || 0) + count,
          updatedAt: new Date()
        })
        .where(eq(pageCredits.deviceId, deviceId));
      
      return { success: true };
    });
    
    return result.success;
  }

  async addPageCredits(deviceId: string, pages: number): Promise<PageCredits> {
    return await db.transaction(async (tx) => {
      const lockedRows = await tx.execute(
        sql`SELECT * FROM page_credits WHERE device_id = ${deviceId} FOR UPDATE`
      );
      
      const row = lockedRows.rows[0] as { pages_remaining?: number } | undefined;
      
      if (!row) {
        const [newCredits] = await tx.insert(pageCredits)
          .values({ deviceId, pagesRemaining: pages, totalPagesUsed: 0 })
          .returning();
        return newCredits;
      }
      
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
    return this.usePageCredits(deviceId, pages);
  }

  async setDeviceStatus(deviceId: string, status: string): Promise<void> {
    await db.update(pageCredits)
      .set({ status, updatedAt: new Date() } as Record<string, unknown>)
      .where(eq(pageCredits.deviceId, deviceId));
  }

  async linkDeviceToUser(deviceId: string, userId: string): Promise<void> {
    await db.update(pageCredits)
      .set({ userId, updatedAt: new Date() } as Record<string, unknown>)
      .where(eq(pageCredits.deviceId, deviceId));
  }

  async countEarlyAdopters(): Promise<number> {
    const result = await db.execute(
      sql`SELECT COUNT(*) as count FROM page_credits WHERE is_early_adopter = true`
    );
    return Number((result.rows[0] as Record<string, unknown>)?.count || 0);
  }

  async grantEarlyAdopterBonus(deviceId: string): Promise<boolean> {
    const count = await this.countEarlyAdopters();
    if (count >= EARLY_ADOPTER_LIMIT) return false;
    
    const existing = await this.getPageCredits(deviceId);
    if ((existing as Record<string, unknown>)?.isEarlyAdopter) return false;
    
    await db.update(pageCredits)
      .set({ 
        pagesRemaining: EARLY_ADOPTER_FREE_PAGES,
        isEarlyAdopter: true,
        updatedAt: new Date()
      } as Record<string, unknown>)
      .where(eq(pageCredits.deviceId, deviceId));
    
    return true;
  }

  async transferGuestCreditsToUserOwner(guestDeviceId: string, userId: string): Promise<{ transferred: boolean; amount: number }> {
    const userOwnerId = `user_${userId}`;
    
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
      
      const guestCredits = await tx.execute(
        sql`SELECT pages_remaining FROM page_credits WHERE device_id = ${guestDeviceId} FOR UPDATE`
      );
      
      const guestPages = (guestCredits.rows[0] as Record<string, unknown>)?.pages_remaining as number || 0;
      const transferAmount = Math.max(0, guestPages - FREE_PAGES_GUEST);
      
      if (transferAmount <= 0) {
        return { transferred: false, amount: 0 };
      }
      
      const userCredits = await tx.execute(
        sql`SELECT pages_remaining FROM page_credits WHERE device_id = ${userOwnerId} FOR UPDATE`
      );
      
      const userCurrentPages = (userCredits.rows[0] as Record<string, unknown>)?.pages_remaining as number || 0;
      
      if (userCredits.rows.length === 0) {
        await tx.execute(sql`
          INSERT INTO page_credits (device_id, pages_remaining, total_pages_used, is_early_adopter, user_id)
          VALUES (${userOwnerId}, ${transferAmount}, 0, false, ${userId})
        `);
      } else {
        await tx.execute(sql`
          UPDATE page_credits SET pages_remaining = ${userCurrentPages + transferAmount}
          WHERE device_id = ${userOwnerId}
        `);
      }
      
      await tx.execute(sql`
        UPDATE page_credits SET pages_remaining = ${FREE_PAGES_GUEST}
        WHERE device_id = ${guestDeviceId}
      `);
      
      return { transferred: true, amount: transferAmount };
    });
  }

  async initializeUserOwnerCredits(userId: string, isEarlyAdopter: boolean): Promise<{ granted: boolean; pages: number; alreadyHad: boolean }> {
    const userOwnerId = `user_${userId}`;
    const freePages = isEarlyAdopter ? EARLY_ADOPTER_FREE_PAGES : DEFAULT_FREE_PAGES;
    
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
      
      const existing = await tx.execute(
        sql`SELECT pages_remaining FROM page_credits WHERE device_id = ${userOwnerId} FOR UPDATE`
      );
      
      if (existing.rows.length > 0) {
        return { granted: false, pages: 0, alreadyHad: true };
      }
      
      await tx.execute(sql`
        INSERT INTO page_credits (device_id, pages_remaining, total_pages_used, is_early_adopter, user_id)
        VALUES (${userOwnerId}, ${freePages}, 0, ${isEarlyAdopter}, ${userId})
      `);
      
      return { granted: true, pages: freePages, alreadyHad: false };
    });
  }

  async getCreditsForOwner(deviceId: string, userId?: string | null): Promise<PageCredits | undefined> {
    const ownerId = getCreditOwnerId(deviceId, userId);
    return this.getPageCredits(ownerId);
  }

  async useCreditsForOwner(deviceId: string, userId: string | null, count: number): Promise<boolean> {
    const ownerId = getCreditOwnerId(deviceId, userId);
    return this.usePageCredits(ownerId, count);
  }

  async addCreditsForOwner(deviceId: string, userId: string | null, count: number): Promise<PageCredits> {
    const ownerId = getCreditOwnerId(deviceId, userId);
    return this.addPageCredits(ownerId, count);
  }
}

export const creditsRepository = new CreditsRepository();
export { getCreditOwnerId };
