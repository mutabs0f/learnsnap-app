import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - supports both email/password and Google OAuth
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), // null for Google OAuth users
  name: text("name"),
  googleId: text("google_id").unique(), // Google OAuth ID
  avatarUrl: text("avatar_url"),
  emailVerified: boolean("email_verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  passwordHash: true,
  name: true,
  googleId: true,
  avatarUrl: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Email verification tokens
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmailVerificationTokenSchema = createInsertSchema(emailVerificationTokens).pick({
  userId: true,
  token: true,
  expiresAt: true,
});

export type InsertEmailVerificationToken = z.infer<typeof insertEmailVerificationTokenSchema>;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;

// User sessions for authentication
export const userSessions = pgTable("user_sessions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSessionSchema = createInsertSchema(userSessions).pick({
  userId: true,
  token: true,
  expiresAt: true,
});

export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;
export type UserSession = typeof userSessions.$inferSelect;

// Question types
export type QuestionType = "multiple_choice" | "true_false" | "fill_blank" | "matching";

// Base question with common fields
const baseQuestionSchema = z.object({
  question: z.string(),
  explanation: z.string().optional(),
  diagram: z.string().optional(),
});

// Multiple choice question (اختر الإجابة الصحيحة)
export const multipleChoiceSchema = baseQuestionSchema.extend({
  type: z.literal("multiple_choice").default("multiple_choice"),
  options: z.array(z.string()).length(4),
  correct: z.enum(["A", "B", "C", "D"]),
  // NEW in v2.7.0: Evidence tracking
  evidence: z.object({
    text: z.string(),
    page: z.number(),
    confidence: z.number().min(0).max(1)
  }).optional(),
});

// True/False question (صح أو خطأ)
export const trueFalseSchema = baseQuestionSchema.extend({
  type: z.literal("true_false"),
  correct: z.boolean(), // true = صح, false = خطأ
  // NEW in v2.7.0: Evidence tracking
  evidence: z.object({
    text: z.string(),
    page: z.number(),
    confidence: z.number().min(0).max(1)
  }).optional(),
});

// Fill in the blank question (أكمل الفراغ)
export const fillBlankSchema = baseQuestionSchema.extend({
  type: z.literal("fill_blank"),
  correct: z.string(), // The correct answer text
  hint: z.string().optional(), // Optional hint for the blank
  // NEW in v2.7.0: Evidence tracking
  evidence: z.object({
    text: z.string(),
    page: z.number(),
    confidence: z.number().min(0).max(1)
  }).optional(),
});

// Matching question (وصّل)
export const matchingSchema = baseQuestionSchema.extend({
  type: z.literal("matching"),
  pairs: z.array(z.object({
    left: z.string(),
    right: z.string(),
  })).min(2).max(4),
  // NEW in v2.7.0: Evidence tracking
  evidence: z.object({
    text: z.string(),
    page: z.number(),
    confidence: z.number().min(0).max(1)
  }).optional(),
});

// Union of all question types
export const questionSchema = z.discriminatedUnion("type", [
  multipleChoiceSchema,
  trueFalseSchema,
  fillBlankSchema,
  matchingSchema,
]).or(
  // Fallback for backward compatibility with old MCQ format without type field
  baseQuestionSchema.extend({
    options: z.array(z.string()).length(4),
    correct: z.enum(["A", "B", "C", "D"]),
  }).transform((q) => ({ ...q, type: "multiple_choice" as const }))
);

// Interactive step schema for lessons
export const lessonStepSchema = z.object({
  type: z.enum(["explanation", "example", "practice"]),
  content: z.string(), // Main text content
  question: z.string().optional(), // For practice steps
  options: z.array(z.string()).optional(), // For practice steps
  correctAnswer: z.string().optional(), // For practice steps
  hint: z.string().optional(), // Help text
});

// Evidence schema for grounding validation (v2.7.0)
export const evidenceSchema = z.object({
  text: z.string(),
  page: z.number(),
  confidence: z.number().min(0).max(1)
}).optional();

// Lesson summary schema - enhanced for children
export const lessonSchema = z.object({
  title: z.string(),
  summary: z.string(),
  keyPoints: z.array(z.string()),
  steps: z.array(lessonStepSchema).optional(), // Interactive learning steps
  targetAge: z.number().optional(), // Target age group
  // NEW in v2.7.0: Evidence tracking
  extractedText: z.array(z.string()).optional(), // OCR text from each page
  confidence: z.number().min(0).max(1).optional(), // Generation confidence
});

export type Question = z.infer<typeof questionSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type LessonStep = z.infer<typeof lessonStepSchema>;

// Quiz Sessions - stores temporary quiz data (expires after 24h)
export const quizSessions = pgTable("quiz_sessions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  deviceId: text("device_id"), // Anonymous user tracking via localStorage
  imageData: text("image_data"), // Legacy single image support
  images: jsonb("images").$type<string[]>(), // Array of base64 images (up to 20)
  imageCount: integer("image_count").default(1), // Number of images uploaded
  lesson: jsonb("lesson").$type<Lesson>(), // Lesson summary before quiz
  questions: jsonb("questions").$type<Question[]>(),
  answers: jsonb("answers").$type<string[]>(),
  score: integer("score"),
  totalQuestions: integer("total_questions").default(10),
  status: text("status").default("processing"), // processing, ready, completed
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").default(sql`NOW() + INTERVAL '24 hours'`),
});

export const insertQuizSessionSchema = createInsertSchema(quizSessions).pick({
  deviceId: true,
  images: true,
  imageCount: true,
});

export type InsertQuizSession = z.infer<typeof insertQuizSessionSchema>;
export type QuizSession = typeof quizSessions.$inferSelect;

// Transactions - payment records
export const transactions = pgTable("transactions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  deviceId: text("device_id"), // Anonymous user tracking
  amount: integer("amount").notNull(), // in halalas (1 SAR = 100 halalas)
  pagesPurchased: integer("pages_purchased").notNull(),
  paymentId: text("stripe_payment_id").unique(), // Legacy column name in DB, stores ls_* IDs
  paymentStatus: text("stripe_payment_status"), // Legacy column name in DB
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactions).pick({
  deviceId: true,
  amount: true,
  pagesPurchased: true,
  paymentId: true,
});

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

// Page Credits - track remaining pages per device (linked to user when they register)
export const pageCredits = pgTable("page_credits", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  deviceId: text("device_id").notNull().unique(),
  userId: varchar("user_id", { length: 36 }), // Link to user when they register
  pagesRemaining: integer("pages_remaining").default(2), // 2 free pages for new devices
  totalPagesUsed: integer("total_pages_used").default(0),
  isEarlyAdopter: boolean("is_early_adopter").default(false), // First 30 users get bonus
  status: text("status").default("active"), // active, on_hold (for refunds)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Webhook Events - for idempotency (prevent duplicate processing)
// Status: processing (started), succeeded (completed), failed (error occurred)
export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  eventId: text("event_id").notNull().unique(), // LemonSqueezy order_id or event_id
  eventType: text("event_type").notNull(), // order_created, order_refunded
  status: text("status").default("processing"), // processing, succeeded, failed
  processed: boolean("processed").default(true), // Legacy, kept for compatibility
  data: jsonb("data"), // Store event data for debugging
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWebhookEventSchema = createInsertSchema(webhookEvents).pick({
  eventId: true,
  eventType: true,
  status: true,
  data: true,
});

export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;
export type WebhookEvent = typeof webhookEvents.$inferSelect;

export const insertPageCreditsSchema = createInsertSchema(pageCredits).pick({
  deviceId: true,
  pagesRemaining: true,
});

export type InsertPageCredits = z.infer<typeof insertPageCreditsSchema>;
export type PageCredits = typeof pageCredits.$inferSelect;

// Pricing packages (prices in halalas: 1 SAR = 100 halalas)
export const pricingPackages = [
  { id: "free", pages: 1, price: 0, pricePerPage: 0, label: "تجربة مجانية", badge: null, discount: null },
  { id: "basic", pages: 5, price: 300, pricePerPage: 60, label: "أساسية", badge: null, discount: null }, // 3 SAR
  { id: "popular", pages: 15, price: 700, pricePerPage: 47, label: "شائعة", badge: "الأكثر شيوعاً", discount: "22%" }, // 7 SAR
  { id: "best", pages: 50, price: 2000, pricePerPage: 40, label: "الأفضل قيمة", badge: "أفضل قيمة", discount: "33%" }, // 20 SAR
  { id: "family", pages: 100, price: 3500, pricePerPage: 35, label: "عائلية", badge: null, discount: "42%" }, // 35 SAR
] as const;

export type PricingPackage = typeof pricingPackages[number];
