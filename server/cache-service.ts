import Redis from 'ioredis';
import crypto from 'crypto';
import logger from './logger.js';

let redisClient: Redis | null = null;

const CACHE_TTL = {
  QUIZ_RESULT: 7 * 24 * 60 * 60,
  SESSION: 24 * 60 * 60,
  RATE_LIMIT: 15 * 60,
  IMAGE_HASH: 30 * 24 * 60 * 60,
  EXTRACTION: 14 * 24 * 60 * 60,
  SESSION_QUIZ: 6 * 60 * 60,
} as const;

const PIPELINE_VERSION = process.env.PIPELINE_VERSION || 'v2.8';

function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
    
    if (!redisUrl) {
      logger.warn('Redis URL not configured - caching disabled');
      return {
        get: async () => null,
        set: async () => 'OK',
        del: async () => 1,
        exists: async () => 0,
        expire: async () => 1,
        quit: async () => 'OK',
        keys: async () => [],
        status: 'ready',
      } as any;
    }

    try {
      redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        reconnectOnError: (err: Error) => {
          logger.error('Redis connection error', { error: err.message });
          return true;
        },
      });

      redisClient.on('connect', () => {
        logger.info('Redis connected successfully');
      });

      redisClient.on('error', (err: Error) => {
        logger.error('Redis error', { error: err.message });
      });

      redisClient.on('close', () => {
        logger.warn('Redis connection closed');
      });

    } catch (error) {
      logger.error('Failed to initialize Redis', { error: (error as Error).message });
      throw error;
    }
  }

  return redisClient;
}

export function generateQuizCacheKey(images: string[]): string {
  const combined = images.join('|');
  const hash = crypto.createHash('sha256').update(combined).digest('hex');
  return `quiz:${hash}`;
}

export async function cacheQuizResult(
  images: string[],
  result: any
): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const key = generateQuizCacheKey(images);
    
    await redis.set(
      key,
      JSON.stringify(result),
      'EX',
      CACHE_TTL.QUIZ_RESULT
    );

    logger.info('Quiz result cached', { key, ttl: CACHE_TTL.QUIZ_RESULT });
    return true;
  } catch (error) {
    logger.error('Failed to cache quiz result', { error: (error as Error).message });
    return false;
  }
}

export async function getCachedQuizResult(
  images: string[]
): Promise<any | null> {
  try {
    const redis = getRedisClient();
    const key = generateQuizCacheKey(images);
    
    const cached = await redis.get(key);
    
    if (cached) {
      logger.info('Quiz result cache hit', { key });
      return JSON.parse(cached);
    }

    logger.info('Quiz result cache miss', { key });
    return null;
  } catch (error) {
    logger.error('Failed to get cached quiz result', { error: (error as Error).message });
    return null;
  }
}

export async function cacheSession(
  sessionId: string,
  data: any
): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const key = `session:${sessionId}`;
    
    await redis.set(
      key,
      JSON.stringify(data),
      'EX',
      CACHE_TTL.SESSION
    );

    return true;
  } catch (error) {
    logger.error('Failed to cache session', { error: (error as Error).message });
    return false;
  }
}

export async function getCachedSession(
  sessionId: string
): Promise<any | null> {
  try {
    const redis = getRedisClient();
    const key = `session:${sessionId}`;
    
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    logger.error('Failed to get cached session', { error: (error as Error).message });
    return null;
  }
}

export async function deleteCached(pattern: string): Promise<number> {
  try {
    const redis = getRedisClient();
    const keys = await redis.keys(pattern);
    
    if (keys.length === 0) return 0;
    
    return await redis.del(...keys);
  } catch (error) {
    logger.error('Failed to delete cached items', { error: (error as Error).message });
    return 0;
  }
}

export async function getCacheStats(): Promise<{
  connected: boolean;
  quizCount: number;
  sessionCount: number;
  extractionCount: number;
}> {
  try {
    const redis = getRedisClient();
    
    const quizKeys = await redis.keys('quiz:*');
    const sessionKeys = await redis.keys('session:*');
    const extractionKeys = await redis.keys('extract:*');

    return {
      connected: redis.status === 'ready',
      quizCount: quizKeys.length,
      sessionCount: sessionKeys.length,
      extractionCount: extractionKeys.length,
    };
  } catch (error) {
    return {
      connected: false,
      quizCount: 0,
      sessionCount: 0,
      extractionCount: 0,
    };
  }
}

export async function cacheExtraction(
  imageHash: string,
  modelName: string,
  extractionResult: { text: string; confidence: number; metadata?: Record<string, any> }
): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const key = `extract:${PIPELINE_VERSION}:${modelName}:${imageHash}`;
    
    await redis.set(
      key,
      JSON.stringify(extractionResult),
      'EX',
      CACHE_TTL.EXTRACTION
    );

    logger.info('Extraction cached', { key: key.substring(0, 40), modelName });
    return true;
  } catch (error) {
    logger.error('Failed to cache extraction', { error: (error as Error).message });
    return false;
  }
}

export async function getCachedExtraction(
  imageHash: string,
  modelName: string
): Promise<{ text: string; confidence: number; metadata?: Record<string, any> } | null> {
  try {
    const redis = getRedisClient();
    const key = `extract:${PIPELINE_VERSION}:${modelName}:${imageHash}`;
    
    const cached = await redis.get(key);
    
    if (cached) {
      logger.info('Extraction cache hit', { key: key.substring(0, 40) });
      return JSON.parse(cached);
    }

    return null;
  } catch (error) {
    logger.error('Failed to get cached extraction', { error: (error as Error).message });
    return null;
  }
}

export async function cacheSessionQuiz(
  deviceId: string,
  sessionId: string,
  quizData: any
): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const key = `squiz:${deviceId}:${sessionId}:${PIPELINE_VERSION}`;
    
    await redis.set(
      key,
      JSON.stringify(quizData),
      'EX',
      CACHE_TTL.SESSION_QUIZ
    );

    return true;
  } catch (error) {
    logger.error('Failed to cache session quiz', { error: (error as Error).message });
    return false;
  }
}

export async function getCachedSessionQuiz(
  deviceId: string,
  sessionId: string
): Promise<any | null> {
  try {
    const redis = getRedisClient();
    const key = `squiz:${deviceId}:${sessionId}:${PIPELINE_VERSION}`;
    
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    return null;
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}

export { getRedisClient };
