/**
 * Monitor Agent Scheduler
 * Runs health checks every 5 minutes
 */

import { runHealthCheck } from "./monitor.agent";
import logger from "../../logger";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

async function sendTelegramAlert(message: string): Promise<void> {
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
    logger.error("Monitor: Telegram alert failed", { error: (error as Error).message });
  }
}

export function startMonitorScheduler(): void {
  const INTERVAL = 5 * 60 * 1000; // 5 minutes

  setInterval(async () => {
    try {
      const result = await runHealthCheck();

      if (!result.healthy) {
        const message = `
*تنبيه من Monitor Agent*

${result.issues.join("\n")}

${new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}
`;
        await sendTelegramAlert(message);
        logger.warn("Monitor: Issues detected", { issues: result.issues });
      }
    } catch (error) {
      logger.error("Monitor: Scheduler error", { error: (error as Error).message });
    }
  }, INTERVAL);

  logger.info("Monitor Agent started - checking every 5 minutes");
}
