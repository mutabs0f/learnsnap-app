import { runCleanup } from "./cleanup.agent";
import logger from "../../logger";

export function startCleanupScheduler(): void {
  setInterval(async () => {
    const now = new Date();
    const saudiTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
    
    if (saudiTime.getHours() === 3 && saudiTime.getMinutes() === 0) {
      await runCleanup();
    }
  }, 60 * 1000);

  logger.info("Cleanup Agent started - runs daily at 3:00 AM Saudi time");
}
