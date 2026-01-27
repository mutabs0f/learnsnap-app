import { getDailyStats } from "./stats.agent";
import logger from "../../logger";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

async function sendTelegramReport(message: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) return;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_ADMIN_CHAT_ID,
        text: message,
        parse_mode: "Markdown"
      })
    });
  } catch (error) {
    logger.error("Stats: Telegram send failed", { error: (error as Error).message });
  }
}

function formatReport(stats: any): string {
  return `
📊 *تقرير ليرن سناب اليومي*
📅 ${stats.date}
━━━━━━━━━━━━━━━━━

👥 مستخدمين جدد: *${stats.newUsers}*
💰 المبيعات: *${stats.totalRevenue} ر.س*
🧾 عدد الطلبات: *${stats.totalOrders}*
📄 صفحات مستخدمة: *${stats.pagesUsed}*
📝 اختبارات منشأة: *${stats.quizzesGenerated}*
🏆 أكثر باقة: *${stats.topPackage}*

━━━━━━━━━━━━━━━━━
🤖 _تقرير آلي من Stats Agent_
`;
}

export async function sendDailyReport(): Promise<void> {
  try {
    const stats = await getDailyStats();
    const report = formatReport(stats);
    await sendTelegramReport(report);
    logger.info("Stats: Daily report sent", { date: stats.date });
  } catch (error) {
    logger.error("Stats: Failed to send daily report", { error: (error as Error).message });
  }
}

export function startStatsScheduler(): void {
  // Check every minute if it's 8:00 AM Saudi time
  setInterval(() => {
    const now = new Date();
    const saudiTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
    
    if (saudiTime.getHours() === 8 && saudiTime.getMinutes() === 0) {
      sendDailyReport();
    }
  }, 60 * 1000);

  logger.info("Stats Agent started - daily report at 8:00 AM Saudi time");
}
