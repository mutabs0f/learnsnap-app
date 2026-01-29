import { db } from "../db";
import { eq, lt, sql } from "drizzle-orm";
import {
  quizSessions,
  questionReports,
  type QuizSession,
  type InsertQuizSession,
  type Question,
  type Lesson,
  type QuestionReport,
  type InsertQuestionReport,
} from "../../shared/schema.js";

export interface IQuizRepository {
  createQuizSession(data: InsertQuizSession): Promise<QuizSession>;
  getQuizSessionById(id: string): Promise<QuizSession | undefined>;
  updateQuizSessionContent(id: string, lesson: Lesson, questions: Question[], warnings?: string[]): Promise<void>;
  updateQuizSessionStatus(id: string, status: string): Promise<void>;
  clearQuizSessionImages(id: string): Promise<void>;
  submitQuizAnswers(id: string, answers: string[], score: number): Promise<void>;
  deleteExpiredSessions(): Promise<number>;

  createQuestionReport(data: InsertQuestionReport): Promise<QuestionReport>;
  getQuestionReports(status?: string, page?: number, limit?: number): Promise<{ reports: QuestionReport[]; total: number }>;
  updateQuestionReportStatus(reportId: number, status: string, adminNotes?: string): Promise<void>;
  getQuestionReportStats(): Promise<{ total: number; pending: number; reviewed: number; resolved: number; dismissed: number }>;
}

export class QuizRepository implements IQuizRepository {
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
        totalQuestions: questions.length
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
    const updateData: Record<string, unknown> = { 
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
    
    const row = result.rows[0] as Record<string, unknown>;
    return {
      total: Number(row.total || 0),
      pending: Number(row.pending || 0),
      reviewed: Number(row.reviewed || 0),
      resolved: Number(row.resolved || 0),
      dismissed: Number(row.dismissed || 0),
    };
  }
}

export const quizRepository = new QuizRepository();
