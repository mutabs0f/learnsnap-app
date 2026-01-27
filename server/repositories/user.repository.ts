import { db } from "../db";
import { eq, lt } from "drizzle-orm";
import { hashToken } from "../utils/helpers";
import {
  users,
  emailVerificationTokens,
  userSessions,
  type User,
  type InsertUser,
  type EmailVerificationToken,
  type InsertEmailVerificationToken,
  type UserSession,
  type InsertUserSession,
} from "../../shared/schema.js";
import { sql } from "drizzle-orm";

export interface IUserRepository {
  createUser(data: InsertUser): Promise<User>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  updateUserEmailVerified(userId: string): Promise<void>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
  countUsers(): Promise<number>;

  createEmailVerificationToken(data: InsertEmailVerificationToken): Promise<EmailVerificationToken>;
  getEmailVerificationToken(token: string): Promise<EmailVerificationToken | undefined>;
  deleteEmailVerificationToken(token: string): Promise<void>;
  deleteExpiredVerificationTokens(): Promise<number>;

  createUserSession(data: InsertUserSession): Promise<UserSession>;
  getUserSession(token: string): Promise<UserSession | undefined>;
  deleteUserSession(token: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  deleteExpiredUserSessions(): Promise<number>;
}

export class UserRepository implements IUserRepository {
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

  async createEmailVerificationToken(data: InsertEmailVerificationToken): Promise<EmailVerificationToken> {
    const hashedData = {
      ...data,
      token: hashToken(data.token),
    };
    const [token] = await db.insert(emailVerificationTokens).values(hashedData).returning();
    return token;
  }

  async getEmailVerificationToken(token: string): Promise<EmailVerificationToken | undefined> {
    const hashedToken = hashToken(token);
    const [result] = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.token, hashedToken));
    return result;
  }

  async deleteEmailVerificationToken(token: string): Promise<void> {
    const hashedToken = hashToken(token);
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.token, hashedToken));
  }

  async deleteExpiredVerificationTokens(): Promise<number> {
    const result = await db.delete(emailVerificationTokens)
      .where(lt(emailVerificationTokens.expiresAt, new Date()));
    return result.rowCount || 0;
  }

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

export const userRepository = new UserRepository();
