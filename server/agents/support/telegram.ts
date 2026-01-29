/**
 * Telegram Notification Service for Support Escalations
 * Clean Arabic format for support tickets
 * @version 3.9.0
 */

import logger from "../../logger";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

interface EscalationData {
  conversationId: string;
  userMessage: string;
  userEmail?: string;
  userName?: string;
  category?: string;
}

const categoryLabels: Record<string, string> = {
  general: "عام",
  pricing: "أسعار",
  usage: "استخدام",
  technical: "تقني",
  payment: "دفع",
  account: "حساب",
  error: "خطأ تقني",
};

export async function sendTelegramAlert(data: EscalationData): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) {
    logger.warn("Telegram credentials not configured - skipping alert");
    return false;
  }

  const appUrl = process.env.FRONTEND_URL || "https://learnsnap-app-production.up.railway.app";
  const ticketId = data.conversationId.substring(0, 8).toUpperCase();
  const categoryLabel = categoryLabels[data.category || "general"] || "عام";
  const userName = data.userName || "زائر";
  const userEmail = data.userEmail || "غير متوفر";
  const userMsg = data.userMessage.length > 400 
    ? data.userMessage.substring(0, 400) + "..." 
    : data.userMessage;

  const message = `
تذكرة دعم جديدة #${ticketId}

المستخدم: ${userName}
الإيميل: ${userEmail}
التصنيف: ${categoryLabel}

الرسالة:
${userMsg}

الرابط: ${appUrl}/admin?tab=support&id=${data.conversationId}
`;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_ADMIN_CHAT_ID,
          text: message.trim(),
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error("Telegram send failed", { error, status: response.status });
      return false;
    }

    logger.info("Telegram escalation alert sent", { 
      conversationId: data.conversationId,
      ticketId,
      category: data.category 
    });
    return true;
  } catch (error) {
    logger.error("Telegram error", { error: (error as Error).message });
    return false;
  }
}
