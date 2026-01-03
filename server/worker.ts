// [GO-1] CHANGE: Added credit charging on success, progress tracking
import Bull from 'bull';
import logger from './logger.js';
import { storage } from './storage.js';
import { generateQuestionsFromImages, RecaptureRequiredError, ValidationUnavailableError } from './ai-service.js';
import { metrics } from './metrics.js';
import { initDatabase, closeDatabase } from './db.js';
import { updateJobStatus, setJobProgress } from './queue-service.js';
import * as Sentry from '@sentry/node';

// [GO-1] CHANGE: Added creditsToCharge for delayed billing
interface QuizJobData {
  sessionId: string;
  deviceId: string;
  images: string[];
  optimizationLevel?: 'standard' | 'high-quality' | 'max-quality';
  optimizeImages?: boolean;
  pipelineVersion?: string;
  creditsToCharge?: number; // [GO-1] Credits to charge on success
}

interface JobMapping {
  sessionId: string;
  deviceId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  error?: string;
}

// [FAST MODE] Reduced timeout - new pipeline is much faster
const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes (should complete in ~30-60s)

let quizQueue: Bull.Queue<QuizJobData> | null = null;

function getRedisUrl(): string | null {
  return process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || null;
}

async function initWorker(): Promise<void> {
  const redisUrl = getRedisUrl();
  
  if (!redisUrl) {
    logger.error('WORKER ERROR: REDIS_URL not configured');
    console.error('FATAL: Worker requires REDIS_URL to be set');
    process.exit(1);
  }

  logger.info('Initializing quiz worker...', { redisUrl: redisUrl.substring(0, 20) + '...' });

  await initDatabase();

  quizQueue = new Bull<QuizJobData>('quiz-generation', redisUrl, {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });

  quizQueue.process(1, async (job) => {
    const { sessionId, deviceId, images, optimizationLevel, optimizeImages, creditsToCharge } = job.data;
    const startTime = Date.now();
    const jobId = String(job.id);
    
    logger.info(`[WORKER] Processing job ${job.id}`, { sessionId, imageCount: images.length, creditsToCharge });
    metrics.recordQuizCreated();
    
    // [FIX #4] Update job status to processing
    await updateJobStatus(jobId, 'processing');

    // [GO-2] Progress helper with stage tracking
    const updateProgress = async (progress: number, stage: string) => {
      job.progress(progress);
      await setJobProgress(jobId, progress, stage);
    };

    try {
      await updateProgress(5, 'تهيئة الطلب');
      
      const contentPromise = generateQuestionsFromImages(images, {
        optimizationLevel,
        optimizeImages,
        // [GO-2] Pass progress callback
        onProgress: async (p: number, stage: string) => {
          await updateProgress(p, stage);
        },
      });
      
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
      );

      const content = await Promise.race([contentPromise, timeoutPromise]);
      
      await updateProgress(90, 'حفظ النتائج');

      await storage.updateQuizSessionContent(sessionId, content.lesson, content.questions);
      await storage.clearQuizSessionImages(sessionId);

      // [GO-1] Charge credits ONLY on successful quiz generation
      if (creditsToCharge && creditsToCharge > 0) {
        const charged = await storage.usePageCredits(deviceId, creditsToCharge);
        if (charged) {
          metrics.recordCreditsUsed(creditsToCharge);
          logger.info(`[WORKER] Credits charged on success`, { 
            sessionId, 
            deviceId: deviceId.substring(0, 8) + '...', 
            credits: creditsToCharge 
          });
        } else {
          // Rare race condition - log but don't fail the quiz
          logger.warn(`[WORKER] Failed to charge credits (possible race)`, { sessionId, deviceId: deviceId.substring(0, 8) });
          metrics.recordCreditsNotCharged('race_condition');
        }
      }

      const duration = Date.now() - startTime;
      metrics.recordQuizCompleted(duration);
      
      // [FIX #4] Update job status to completed
      await updateJobStatus(jobId, 'completed');

      logger.info(`[WORKER] Job ${job.id} completed`, {
        sessionId,
        lessonTitle: content.lesson.title,
        questionCount: content.questions.length,
        duration,
      });

      await updateProgress(100, 'اكتمل');

      return {
        success: true,
        questionCount: content.questions.length,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = (error as Error).message;

      logger.error(`[WORKER] Job ${job.id} failed`, {
        sessionId,
        error: errorMsg,
        duration,
      });

      metrics.recordQuizFailed();

      if (process.env.SENTRY_DSN) {
        Sentry.captureException(error, {
          extra: { sessionId, jobId: job.id, duration },
        });
      }

      let errorStatus = 'error';
      let shouldChargeCredits = true; // [GO-1] Default: charge credits
      
      if (errorMsg === 'TIMEOUT') {
        errorStatus = 'timeout';
      } else if (error instanceof ValidationUnavailableError) {
        // [GO-1] Validation service down - don't charge credits
        errorStatus = 'validation_unavailable';
        shouldChargeCredits = false;
        metrics.recordValidationOutcome('unavailable');
        logger.info(`[WORKER] Job ${job.id} - ValidationUnavailable, credits not charged`);
      } else if (errorMsg.includes('API') || errorMsg.includes('quota')) {
        errorStatus = 'service_error';
        shouldChargeCredits = false; // Don't charge for service errors
      } else if (error instanceof RecaptureRequiredError || errorMsg.includes('UNCLEAR')) {
        errorStatus = 'recapture_required';
      }
      
      // [GO-1] Record credits not charged
      if (!shouldChargeCredits) {
        if (error instanceof ValidationUnavailableError) {
          metrics.recordCreditsNotCharged('validation_unavailable');
        } else {
          metrics.recordCreditsNotCharged('service_error');
        }
        logger.info(`[WORKER] Job ${job.id} - Credits not charged: ${errorStatus}`);
      }

      await storage.updateQuizSessionStatus(sessionId, errorStatus);
      
      // [FIX #4] Update job status to failed
      await updateJobStatus(jobId, 'failed');

      try {
        await storage.clearQuizSessionImages(sessionId);
      } catch {}

      throw error;
    }
  });

  quizQueue.on('completed', (job) => {
    logger.info(`[WORKER] Job ${job.id} finished successfully`);
  });

  quizQueue.on('failed', (job, err) => {
    logger.error(`[WORKER] Job ${job.id} failed`, { error: err.message });
  });

  quizQueue.on('stalled', (job) => {
    logger.warn(`[WORKER] Job ${job.id} stalled`);
  });

  quizQueue.on('error', (err) => {
    logger.error('[WORKER] Queue error', { error: err.message });
  });

  logger.info('Quiz worker initialized and ready to process jobs');
}

async function shutdown(): Promise<void> {
  logger.info('[WORKER] Shutting down...');
  
  if (quizQueue) {
    await quizQueue.close();
    logger.info('[WORKER] Queue closed');
  }
  
  await closeDatabase();
  logger.info('[WORKER] Database closed');
  
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

initWorker().catch((err) => {
  logger.error('[WORKER] Failed to initialize', { error: err.message });
  console.error('Worker initialization failed:', err);
  process.exit(1);
});
