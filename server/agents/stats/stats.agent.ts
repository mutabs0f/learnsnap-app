import { db } from "../../db";
import { sql } from "drizzle-orm";
import logger from "../../logger";

export interface DailyStats {
  date: string;
  newUsers: number;
  totalRevenue: number;
  totalOrders: number;
  pagesUsed: number;
  quizzesGenerated: number;
  topPackage: string;
}

export async function getDailyStats(): Promise<DailyStats> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];

  let newUsers = 0;
  let totalRevenue = 0;
  let totalOrders = 0;
  let pagesUsed = 0;
  let quizzesGenerated = 0;
  let topPackage = "لا يوجد";

  // 1. New users yesterday
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM users 
      WHERE DATE(created_at) = ${dateStr}
    `);
    newUsers = Number((result.rows[0] as any)?.count || 0);
  } catch { }

  // 2. Revenue yesterday (completed payments)
  try {
    const result = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0) as total FROM pending_payments 
      WHERE status = 'completed' 
      AND DATE(created_at) = ${dateStr}
    `);
    totalRevenue = Number((result.rows[0] as any)?.total || 0) / 100;
  } catch { }

  // 3. Total orders yesterday
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM pending_payments 
      WHERE status = 'completed' 
      AND DATE(created_at) = ${dateStr}
    `);
    totalOrders = Number((result.rows[0] as any)?.count || 0);
  } catch { }

  // 4. Pages used yesterday
  try {
    const result = await db.execute(sql`
      SELECT COALESCE(SUM(pages_used), 0) as total FROM quizzes 
      WHERE DATE(created_at) = ${dateStr}
    `);
    pagesUsed = Number((result.rows[0] as any)?.total || 0);
  } catch { }

  // 5. Quizzes generated yesterday
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM quizzes 
      WHERE DATE(created_at) = ${dateStr}
    `);
    quizzesGenerated = Number((result.rows[0] as any)?.count || 0);
  } catch { }

  // 6. Top selling package yesterday
  try {
    const result = await db.execute(sql`
      SELECT package_id, COUNT(*) as count FROM pending_payments 
      WHERE status = 'completed' 
      AND DATE(created_at) = ${dateStr}
      GROUP BY package_id 
      ORDER BY count DESC 
      LIMIT 1
    `);
    if (result.rows.length > 0) {
      const packageMap: Record<string, string> = {
        'basic': 'الأساسية',
        'popular': 'الشائعة',
        'best': 'الأفضل قيمة',
        'family': 'العائلية'
      };
      topPackage = packageMap[(result.rows[0] as any)?.package_id] || 'غير معروف';
    }
  } catch { }

  return {
    date: dateStr,
    newUsers,
    totalRevenue,
    totalOrders,
    pagesUsed,
    quizzesGenerated,
    topPackage
  };
}
