import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - supports both email/password and Google OAuth
// [P1.1] Removed legacy password column - use passwordHash only
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), // null for Google OAuth users
  // [P1.1 SECURITY] password column removed - always use passwordHash
  // Legacy column kept in DB for migration safety, but not exposed in ORM
  name: text("name"),
  fullName: text("full_name"), // Legacy column
  googleId: text("google_id").unique(), // Google OAuth ID
  avatarUrl: text("avatar_url"),
  emailVerified: boolean("email_verified").default(false),
  subscriptionTier: text("subscription_tier"), // Legacy column
  subscriptionStatus: text("subscription_status"), // Legacy column
  stripeCustomerId: text("stripe_customer_id"), // Legacy column
  stripeSubscriptionId: text("stripe_subscription_id"), // Legacy column
  notificationPreferences: jsonb("notification_preferences"), // Legacy column
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
// [P1.2] Now stores hashed tokens for security
// [P1.4] Added tokenType field to distinguish verify vs reset tokens
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  token: text("token").notNull().unique(), // [P1.2] Now stores SHA-256 hash of actual token
  tokenType: text("token_type").default("verify"), // [P1.4] "verify" or "reset"
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmailVerificationTokenSchema = createInsertSchema(emailVerificationTokens).pick({
  userId: true,
  token: true,
  tokenType: true,
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
  deviceId: text("device_id").notNull(), // [P0 FIX v2.9.2] Required for BOLA prevention
  imageData: text("image_data"), // Legacy single image support
  images: jsonb("images").$type<string[]>(), // Array of base64 images (up to 20)
  imageCount: integer("image_count").default(1), // Number of images uploaded
  lesson: jsonb("lesson").$type<Lesson>(), // Lesson summary before quiz
  questions: jsonb("questions").$type<Question[]>(),
  answers: jsonb("answers").$type<string[]>(),
  score: integer("score"),
  totalQuestions: integer("total_questions").default(10),
  status: text("status").default("processing"), // processing, ready, completed
  warnings: jsonb("warnings").$type<string[]>(), // Warnings about coverage/processing
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
  deviceId: text("device_id").notNull(), // [P0 FIX v2.9.2] Required for audit trail
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
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: 'set null' }), // [P1 FIX v2.9.2] FK with cascade
  pagesRemaining: integer("pages_remaining").default(2), // 2 free pages for new devices
  totalPagesUsed: integer("total_pages_used").default(0),
  isEarlyAdopter: boolean("is_early_adopter").default(false), // First 30 users get bonus
  status: text("status").default("active"), // active, on_hold (for refunds)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Pending Payments - track invoice -> transaction mapping for verification
export const pendingPayments = pgTable("pending_payments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number").notNull().unique(),
  transactionNo: text("transaction_no").notNull().unique(), // [SECURITY v2.9.2] Added unique constraint
  deviceId: text("device_id").notNull(),
  pages: integer("pages").notNull(),
  amount: integer("amount").notNull(), // in halalas
  status: text("status").default("pending"), // pending, paid, failed, expired
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").default(sql`NOW() + INTERVAL '24 hours'`),
});

export const insertPendingPaymentSchema = createInsertSchema(pendingPayments).pick({
  orderNumber: true,
  transactionNo: true,
  deviceId: true,
  pages: true,
  amount: true,
});

export type InsertPendingPayment = z.infer<typeof insertPendingPaymentSchema>;
export type PendingPayment = typeof pendingPayments.$inferSelect;

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

// Child Portal Types (for practice/test stages)
export interface Chapter {
  id: string;
  title: string;
  content: {
    practice: Question[];
    test: Question[];
  };
}

export interface ChapterResult {
  stars: number;
  totalScore: number;
  practiceScore: number;
  testScore: number;
}

// Legacy tables - keep for database compatibility
export const badges = pgTable("badges", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  description: text("description"),
  descriptionAr: text("description_ar"),
  icon: text("icon"),
  color: text("color"),
  type: text("type"),
  requirement: text("requirement"),
  rarity: text("rarity"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sampleChapters = pgTable("sample_chapters", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  titleAr: text("title_ar"),
  subject: text("subject"),
  grade: text("grade"),
  description: text("description"),
  descriptionAr: text("description_ar"),
  previewImage: text("preview_image"),
  difficulty: text("difficulty"),
  estimatedMinutes: integer("estimated_minutes"),
  isActive: boolean("is_active").default(true),
  content: jsonb("content"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Question Reports table (v2.9.5)
export const questionReports = pgTable("question_reports", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  sessionId: varchar("session_id", { length: 255 }).notNull(),
  questionIndex: integer("question_index").notNull(),
  questionText: text("question_text").notNull(),
  reportReason: varchar("report_reason", { length: 50 }).notNull(),
  reportDetails: text("report_details"),
  deviceId: varchar("device_id", { length: 255 }),
  userId: varchar("user_id", { length: 255 }),
  status: varchar("status", { length: 20 }).default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const insertQuestionReportSchema = createInsertSchema(questionReports).pick({
  sessionId: true,
  questionIndex: true,
  questionText: true,
  reportReason: true,
  reportDetails: true,
  deviceId: true,
  userId: true,
});

export type InsertQuestionReport = z.infer<typeof insertQuestionReportSchema>;
export type QuestionReport = typeof questionReports.$inferSelect;

// Credit Transactions table (v2.9.16) - for idempotency tracking
// IMPORTANT: This table uses SERIAL id (not UUID) as defined in migrations
export const creditTransactions = pgTable("credit_transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  transactionId: varchar("transaction_id", { length: 255 }).notNull().unique(),
  deviceId: varchar("device_id", { length: 255 }).notNull(),
  userId: varchar("user_id", { length: 255 }),
  transactionType: varchar("transaction_type", { length: 50 }).notNull(), // guest_transfer, early_adopter, registration_bonus, purchase, usage
  pagesAmount: integer("pages_amount").notNull().default(0),
  pagesBefore: integer("pages_before").notNull().default(0),
  pagesAfter: integer("pages_after").notNull().default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).pick({
  transactionId: true,
  deviceId: true,
  userId: true,
  transactionType: true,
  pagesAmount: true,
  pagesBefore: true,
  pagesAfter: true,
  metadata: true,
});

export type InsertCreditTransaction = z.infer<typeof insertCreditTransactionSchema>;
export type CreditTransaction = typeof creditTransactions.$inferSelect;

// Support Actions table (v3.1.0) - Admin manual support operations audit log
// This is an append-only audit table for all admin support actions
export const supportActions = pgTable("support_actions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  adminIdentifier: text("admin_identifier").notNull(), // "local-admin" or admin email
  targetUserId: text("target_user_id"), // user_<UUID> or null
  targetDeviceId: text("target_device_id"), // deviceId or null
  actionType: text("action_type").notNull(), // GRANT_PAGES | REVERSE_PAGES | RESEND_VERIFICATION | MARK_VERIFIED
  amountPages: integer("amount_pages"), // for GRANT/REVERSE actions
  reasonCode: text("reason_code").notNull(), // COMPENSATION | PROMO | BUG | FRAUD_REVIEW | OTHER
  referenceId: text("reference_id").notNull(), // ticket/whatsapp/email number
  notes: text("notes"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  beforeSnapshot: jsonb("before_snapshot"), // {pages_remaining, verified, ...}
  afterSnapshot: jsonb("after_snapshot"),
  status: text("status").notNull(), // APPLIED | FAILED | REJECTED
  error: text("error"),
});

export const insertSupportActionSchema = createInsertSchema(supportActions).pick({
  adminIdentifier: true,
  targetUserId: true,
  targetDeviceId: true,
  actionType: true,
  amountPages: true,
  reasonCode: true,
  referenceId: true,
  notes: true,
  idempotencyKey: true,
  beforeSnapshot: true,
  afterSnapshot: true,
  status: true,
  error: true,
});

export type InsertSupportAction = z.infer<typeof insertSupportActionSchema>;
export type SupportAction = typeof supportActions.$inferSelect;

// Support Conversations table (v3.8.0) - AI Chat Support System
export const supportConversations = pgTable("support_conversations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text("session_id").notNull(),
  userId: text("user_id"),
  deviceId: text("device_id"),
  userEmail: text("user_email"),
  userName: text("user_name"),
  status: text("status").default("active"), // active, escalated, resolved
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSupportConversationSchema = createInsertSchema(supportConversations).pick({
  sessionId: true,
  userId: true,
  deviceId: true,
  userEmail: true,
  userName: true,
  status: true,
});

export type InsertSupportConversation = z.infer<typeof insertSupportConversationSchema>;
export type SupportConversation = typeof supportConversations.$inferSelect;

// Support Messages table (v3.8.0) - Individual chat messages
export const supportMessages = pgTable("support_messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id", { length: 36 }).notNull().references(() => supportConversations.id),
  role: text("role").notNull(), // 'user', 'agent', 'admin'
  content: text("content").notNull(),
  escalated: boolean("escalated").default(false),
  category: text("category"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSupportMessageSchema = createInsertSchema(supportMessages).pick({
  conversationId: true,
  role: true,
  content: true,
  escalated: true,
  category: true,
});

export type InsertSupportMessage = z.infer<typeof insertSupportMessageSchema>;
export type SupportMessage = typeof supportMessages.$inferSelect;

// [v3.8.5] Question Feedback table for user ratings
export const questionFeedback = pgTable("question_feedback", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text("session_id").notNull(),
  questionIndex: integer("question_index").notNull(),
  questionText: text("question_text"),
  feedback: text("feedback").notNull(), // 'up' or 'down'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertQuestionFeedbackSchema = createInsertSchema(questionFeedback).pick({
  sessionId: true,
  questionIndex: true,
  questionText: true,
  feedback: true,
});

export type InsertQuestionFeedback = z.infer<typeof insertQuestionFeedbackSchema>;
export type QuestionFeedback = typeof questionFeedback.$inferSelect;
