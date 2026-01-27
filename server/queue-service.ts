import Bull from 'bull';
import Redis from 'ioredis';
import crypto from 'crypto';
import logger from './logger.js';

let quizQueue: Bull.Queue | null = null;
let redisClient: Redis | null = null;

// [GO-1] CHANGE: Added creditsToCharge for delayed billing
// [FIX v2.9.22] Added userId for correct owner-based credit charging
interface QuizJobData {
  sessionId: string;
  deviceId: string;
  userId?: string | null; // [FIX v2.9.22] User ID for credit owner lookup
  images: string[];
  optimizationLevel?: 'standard' | 'high-quality' | 'max-quality';
  optimizeImages?: boolean;
  pipelineVersion?: string;
  creditsToCharge?: number; // [GO-1] Credits to charge on success
}

interface JobMapping {
  jobId: string;
  sessionId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
}

const IDEMPOTENCY_TTL = 30 * 60;
const JOB_MAPPING_TTL = 24 * 60 * 60;

function getRedisClient(): Redis | null {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
    if (!redisUrl) {
      return null;
    }
    
    try {
      redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });
    } catch {
      return null;
    }
  }
  return redisClient;
}

let redisAvailable: boolean | null = null;
let lastRedisCheck = 0;
const REDIS_CHECK_INTERVAL = 30000; // 30 seconds

// In-memory idempotency cache for Redis-down fallback
interface InMemoryCacheEntry {
  sessionId?: string;
  jobId?: string;
  status: 'pending' | 'completed';
  expiresAt: number;
  createdAt: number; // [v3.0.3] Track insertion time for FIFO eviction
}
const inMemoryIdempotencyCache = new Map<string, InMemoryCacheEntry>();
const INMEM_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const INMEM_CACHE_MAX_ENTRIES = 10000; // [v3.0.3] Prevent unbounded memory growth

function cleanupInMemoryCache() {
  const now = Date.now();
  // Use Array.from to avoid downlevelIteration requirement
  const entries = Array.from(inMemoryIdempotencyCache.entries());
  
  // First, remove expired entries
  for (const [key, value] of entries) {
    if (value.expiresAt < now) {
      inMemoryIdempotencyCache.delete(key);
    }
  }
  
  // [v3.0.3] If still over limit, evict oldest entries (FIFO by createdAt)
  // Note: FIFO is appropriate for idempotency cache - entries are write-once, check-once
  if (inMemoryIdempotencyCache.size > INMEM_CACHE_MAX_ENTRIES) {
    const sortedEntries = Array.from(inMemoryIdempotencyCache.entries())
      .sort((a, b) => a[1].createdAt - b[1].createdAt); // Oldest first (FIFO)
    const toDelete = sortedEntries.slice(0, inMemoryIdempotencyCache.size - INMEM_CACHE_MAX_ENTRIES);
    for (const [key] of toDelete) {
      inMemoryIdempotencyCache.delete(key);
    }
  }
}

export async function isRedisAvailable(): Promise<boolean> {
  const now = Date.now();
  
  // Return cached result if checked recently
  if (redisAvailable !== null && now - lastRedisCheck < REDIS_CHECK_INTERVAL) {
    return redisAvailable;
  }
  
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
  if (!redisUrl) {
    redisAvailable = false;
    lastRedisCheck = now;
    return false;
  }
  
  // Actually test Redis connection
  const redis = getRedisClient();
  if (!redis) {
    redisAvailable = false;
    lastRedisCheck = now;
    return false;
  }
  
  try {
    await redis.connect();
    await redis.ping();
    redisAvailable = true;
    logger.debug('Redis connection verified');
  } catch (error) {
    logger.warn('Redis connection failed', { error: (error as Error).message });
    redisAvailable = false;
  }
  
  lastRedisCheck = now;
  return redisAvailable;
}

export function generateIdempotencyKey(
  deviceId: string,
  requestId: string
): string {
  // Use only deviceId and requestId (client-provided or auto-generated)
  // This ensures the same request from the same device gets the same key
  const base = `${deviceId}:${requestId}`;
  return `idem:${crypto.createHash('sha256').update(base).digest('hex').substring(0, 32)}`;
}

export async function checkIdempotency(
  idemKey: string
): Promise<{ exists: boolean; jobId?: string; sessionId?: string }> {
  // First check in-memory fallback cache
  cleanupInMemoryCache();
  const memCached = inMemoryIdempotencyCache.get(idemKey);
  if (memCached && memCached.expiresAt > Date.now()) {
    // Only return as "exists" if completed (has sessionId), not if pending
    if (memCached.status === 'completed' && memCached.sessionId) {
      logger.info('Idempotency cache hit (in-memory)', { idemKey: idemKey.substring(0, 20) });
      return { exists: true, jobId: memCached.jobId, sessionId: memCached.sessionId };
    }
    // Pending entry exists but not complete - will be handled by setIdempotencyPending
  }
  
  const redis = getRedisClient();
  if (!redis) {
    return { exists: false };
  }

  try {
    const cached = await redis.get(idemKey);
    if (cached) {
      const data = JSON.parse(cached);
      // Skip pending entries - only return completed ones
      if (data.status === 'pending') {
        return { exists: false };
      }
      logger.info('Idempotency cache hit (Redis)', { idemKey: idemKey.substring(0, 20) });
      return { exists: true, jobId: data.jobId, sessionId: data.sessionId };
    }
  } catch (error) {
    logger.warn('Idempotency check failed', { error: (error as Error).message });
  }

  return { exists: false };
}

export async function setIdempotency(
  idemKey: string,
  jobId: string,
  sessionId: string
): Promise<void> {
  // Always set in in-memory cache as fallback (update from pending to completed)
  const now = Date.now();
  inMemoryIdempotencyCache.set(idemKey, {
    sessionId,
    jobId,
    status: 'completed',
    expiresAt: now + INMEM_CACHE_TTL,
    createdAt: now,
  });

  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.set(
      idemKey,
      JSON.stringify({ jobId, sessionId, status: 'completed', createdAt: Date.now() }),
      'EX',
      IDEMPOTENCY_TTL
    );
    logger.info('Idempotency key set', { idemKey: idemKey.substring(0, 20), jobId });
  } catch (error) {
    logger.warn('Failed to set idempotency key', { error: (error as Error).message });
  }
}

export async function setIdempotencyPending(
  idemKey: string
): Promise<boolean> {
  // Check and atomically reserve in-memory cache first
  cleanupInMemoryCache();
  const existing = inMemoryIdempotencyCache.get(idemKey);
  if (existing && existing.expiresAt > Date.now()) {
    // Entry exists - either pending or completed
    logger.info('Idempotency slot already exists (in-memory)', { 
      idemKey: idemKey.substring(0, 20),
      status: existing.status 
    });
    return false;
  }
  
  // Reserve in-memory slot first (works even without Redis)
  const now = Date.now();
  inMemoryIdempotencyCache.set(idemKey, {
    status: 'pending',
    expiresAt: now + INMEM_CACHE_TTL,
    createdAt: now,
  });

  const redis = getRedisClient();
  if (!redis) {
    // No Redis - in-memory reservation is sufficient
    logger.info('Idempotency slot reserved (in-memory only)', { idemKey: idemKey.substring(0, 20) });
    return true;
  }

  try {
    // Also try to set in Redis with NX for distributed lock
    const result = await redis.set(
      idemKey,
      JSON.stringify({ status: 'pending', createdAt: Date.now() }),
      'EX',
      IDEMPOTENCY_TTL,
      'NX'
    );
    if (result === 'OK') {
      logger.info('Idempotency slot reserved (Redis)', { idemKey: idemKey.substring(0, 20) });
      return true; // Successfully reserved, proceed with processing
    }
    // Redis says slot already exists - rollback in-memory
    inMemoryIdempotencyCache.delete(idemKey);
    logger.info('Idempotency slot already exists (Redis)', { idemKey: idemKey.substring(0, 20) });
    return false;
  } catch (error) {
    // Redis failed but we have in-memory reservation
    logger.warn('Redis reservation failed, using in-memory only', { error: (error as Error).message });
    return true;
  }
}

export async function clearIdempotency(idemKey: string): Promise<void> {
  // Clear from in-memory cache
  inMemoryIdempotencyCache.delete(idemKey);
  
  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.del(idemKey);
    logger.info('Idempotency key cleared', { idemKey: idemKey.substring(0, 20) });
  } catch (error) {
    logger.warn('Failed to clear idempotency key', { error: (error as Error).message });
  }
}

export async function setJobMapping(
  jobId: string,
  sessionId: string,
  status: JobMapping['status'] = 'queued'
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    const mapping: JobMapping = {
      jobId,
      sessionId,
      status,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await redis.set(`job:${jobId}`, JSON.stringify(mapping), 'EX', JOB_MAPPING_TTL);
  } catch (error) {
    logger.warn('Failed to set job mapping', { error: (error as Error).message });
  }
}

export async function getJobMapping(jobId: string): Promise<JobMapping | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    const data = await redis.get(`job:${jobId}`);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function updateJobStatus(
  jobId: string,
  status: JobMapping['status']
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    const existing = await getJobMapping(jobId);
    if (existing) {
      existing.status = status;
      existing.updatedAt = Date.now();
      await redis.set(`job:${jobId}`, JSON.stringify(existing), 'EX', JOB_MAPPING_TTL);
    }
  } catch (error) {
    logger.warn('Failed to update job status', { error: (error as Error).message });
  }
}

// [P0 FIX] Check if Redis is required for production quiz generation
export function isRedisRequiredForQuiz(): boolean {
  const isProduction = process.env.NODE_ENV === 'production';
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
  const allowSyncQuiz = process.env.ALLOW_SYNC_QUIZ === 'true';
  
  // [v3.8.7] Allow synchronous quiz generation without Redis if explicitly enabled
  if (allowSyncQuiz) {
    return true; // Allow sync processing
  }
  
  // In production, Redis is required for quiz generation to prevent OOM
  if (isProduction && !redisUrl) {
    // [v3.8.7] Default to allowing sync quiz in production without Redis
    // This is safe with proper memory management in quiz generation
    logger.warn('Redis not configured - allowing synchronous quiz generation');
    return true;
  }
  return true;
}

export function getQuizQueue(): Bull.Queue {
  if (!quizQueue) {
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (!redisUrl) {
      // [P0 FIX] In production, log error but still return mock to prevent crash
      // The quiz.routes.ts should check isRedisRequiredForQuiz() before calling this
      if (isProduction) {
        logger.error('CRITICAL: Redis URL not configured in production - quiz generation will be unavailable');
      } else {
        logger.warn('Redis URL not configured - async processing disabled (dev mode)');
      }
      return {
        add: async () => ({ id: 'mock' }),
        process: () => {},
        on: () => {},
        getJob: async () => null,
        close: async () => {},
      } as any;
    }

    quizQueue = new Bull('quiz-generation', redisUrl, {
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

    quizQueue.on('completed', (job: Bull.Job) => {
      logger.info('Quiz generation job completed', { jobId: job.id });
    });

    quizQueue.on('failed', (job: Bull.Job, err: Error) => {
      logger.error('Quiz generation job failed', {
        jobId: job.id,
        error: err.message,
      });
    });

    quizQueue.on('stalled', (job: Bull.Job) => {
      logger.warn('Quiz generation job stalled', { jobId: job.id });
    });

    logger.info('Quiz queue initialized');
  }

  return quizQueue;
}

// [GO-1] CHANGE: Added creditsToCharge parameter for delayed billing
// [FIX v2.9.22] Added userId parameter for correct owner-based credit charging
export async function queueQuizGeneration(
  sessionId: string,
  deviceId: string,
  images: string[],
  optimizationLevel?: 'standard' | 'high-quality' | 'max-quality',
  creditsToCharge?: number,
  userId?: string | null // [FIX v2.9.22] User ID for credit owner lookup
): Promise<string> {
  const queue = getQuizQueue();
  
  const job = await queue.add({
    sessionId,
    deviceId,
    userId, // [FIX v2.9.22] Pass userId for correct credit owner
    images,
    optimizationLevel,
    creditsToCharge, // [GO-1] Pass credits to worker
  });

  logger.info('Quiz generation job queued', {
    jobId: job.id,
    sessionId,
    creditsToCharge,
    hasUser: !!userId,
  });

  return job.id as string;
}

// [GO-2] Session-Job mapping for progress tracking
const SESSION_JOB_TTL = 24 * 60 * 60; // 24 hours

// In-memory fallback for progress tracking when Redis is unavailable
interface InMemoryProgressEntry {
  progress: number;
  stage: string;
  updatedAt: number;
}
const inMemorySessionJobMap = new Map<string, string>();
const inMemoryProgressMap = new Map<string, InMemoryProgressEntry>();
const INMEM_PROGRESS_TTL = 60 * 60 * 1000; // 1 hour

function cleanupInMemoryProgressCache() {
  const now = Date.now();
  const sessionJobEntries = Array.from(inMemorySessionJobMap.entries());
  for (const [key] of sessionJobEntries) {
    // Keep for 24 hours (no timestamp, just check if too many entries)
    if (inMemorySessionJobMap.size > 1000) {
      inMemorySessionJobMap.delete(key);
    }
  }
  const progressEntries = Array.from(inMemoryProgressMap.entries());
  for (const [key, value] of progressEntries) {
    if (now - value.updatedAt > INMEM_PROGRESS_TTL) {
      inMemoryProgressMap.delete(key);
    }
  }
}

export async function setSessionJobId(sessionId: string, jobId: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    // Fallback to in-memory
    inMemorySessionJobMap.set(sessionId, jobId);
    cleanupInMemoryProgressCache();
    return;
  }

  try {
    await redis.set(`sessionjob:${sessionId}`, jobId, 'EX', SESSION_JOB_TTL);
    logger.debug('Session-job mapping set', { sessionId, jobId });
  } catch (error) {
    // Fallback to in-memory
    inMemorySessionJobMap.set(sessionId, jobId);
    logger.warn('Failed to set session-job mapping in Redis, using in-memory', { error: (error as Error).message });
  }
}

export async function getSessionJobId(sessionId: string): Promise<string | null> {
  const redis = getRedisClient();
  if (!redis) {
    // Fallback to in-memory
    return inMemorySessionJobMap.get(sessionId) || null;
  }

  try {
    const result = await redis.get(`sessionjob:${sessionId}`);
    if (result) return result;
    // Also check in-memory fallback
    return inMemorySessionJobMap.get(sessionId) || null;
  } catch {
    return inMemorySessionJobMap.get(sessionId) || null;
  }
}

// [GO-2] Store progress stage in Redis (with in-memory fallback)
export async function setJobProgress(jobId: string, progress: number, stage: string): Promise<void> {
  const redis = getRedisClient();
  const progressEntry = { progress, stage, updatedAt: Date.now() };
  
  if (!redis) {
    // Fallback to in-memory
    inMemoryProgressMap.set(jobId, progressEntry);
    cleanupInMemoryProgressCache();
    return;
  }

  try {
    await redis.set(
      `jobprogress:${jobId}`,
      JSON.stringify(progressEntry),
      'EX',
      3600 // 1 hour TTL
    );
  } catch (error) {
    // Fallback to in-memory
    inMemoryProgressMap.set(jobId, progressEntry);
    logger.warn('Failed to set job progress in Redis, using in-memory', { error: (error as Error).message });
  }
}

export async function getJobProgress(jobId: string): Promise<{ progress: number; stage: string } | null> {
  const redis = getRedisClient();
  if (!redis) {
    // Fallback to in-memory
    const entry = inMemoryProgressMap.get(jobId);
    if (entry) return { progress: entry.progress, stage: entry.stage };
    return null;
  }

  try {
    const data = await redis.get(`jobprogress:${jobId}`);
    if (data) {
      const parsed = JSON.parse(data);
      return { progress: parsed.progress, stage: parsed.stage };
    }
    // Also check in-memory fallback
    const entry = inMemoryProgressMap.get(jobId);
    if (entry) return { progress: entry.progress, stage: entry.stage };
  } catch {
    const entry = inMemoryProgressMap.get(jobId);
    if (entry) return { progress: entry.progress, stage: entry.stage };
  }
  return null;
}

export async function getJobStatus(jobId: string): Promise<{
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'unknown';
  progress?: number;
  result?: any;
  error?: string;
}> {
  try {
    const queue = getQuizQueue();
    const job = await queue.getJob(jobId);

    if (!job) {
      return { status: 'unknown' };
    }

    const state = await job.getState();
    const progress = job.progress();

    return {
      status: state as any,
      progress: typeof progress === 'number' ? progress : undefined,
      result: state === 'completed' ? await job.finished() : undefined,
      error: state === 'failed' ? (job.failedReason || 'Unknown error') : undefined,
    };
  } catch (error) {
    logger.error('Failed to get job status', { error: (error as Error).message });
    return { status: 'unknown' };
  }
}

export async function closeQueue(): Promise<void> {
  if (quizQueue) {
    await quizQueue.close();
    quizQueue = null;
    logger.info('Quiz queue closed');
  }
}
