/**
 * Account Lockout Service
 * [SECURITY FIX v3.3.3] Redis-backed with in-memory fallback
 * 
 * Uses Redis in production for distributed lockout tracking.
 * Falls back to in-memory Map in development.
 */

import logger from "./logger";

interface LockoutRecord {
  count: number;
  lockUntil: number;
}

// In-memory fallback for development
const memoryStore = new Map<string, LockoutRecord>();

// Redis client (lazy-loaded)
let redisClient: any = null;
let redisAvailable = false;

// Initialize Redis connection
async function getRedis(): Promise<any> {
  if (redisClient !== null) return redisClient;
  
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
  
  if (!redisUrl) {
    logger.warn("Redis not configured - using in-memory lockout (not recommended for production)");
    redisClient = false;
    return null;
  }
  
  try {
    const Redis = (await import("ioredis")).default;
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true,
    });
    
    await redisClient.connect();
    redisAvailable = true;
    logger.info("Redis connected for account lockout");
    return redisClient;
  } catch (error) {
    logger.error("Redis connection failed - using in-memory fallback", { 
      error: (error as Error).message 
    });
    redisClient = false;
    return null;
  }
}

// Lockout duration constants (in ms)
const LOCKOUT_DURATIONS = {
  LEVEL_1: 15 * 60 * 1000,      // 5 fails = 15 min
  LEVEL_2: 60 * 60 * 1000,      // 10 fails = 1 hour
  LEVEL_3: 24 * 60 * 60 * 1000, // 15+ fails = 24 hours
};

const LOCKOUT_TTL_SECONDS = 24 * 60 * 60; // 24 hours TTL for Redis keys

function getKey(email: string): string {
  return `lockout:${email.toLowerCase()}`;
}

export async function checkAccountLock(email: string): Promise<{ locked: boolean; retryAfter?: number }> {
  const key = getKey(email);
  const redis = await getRedis();
  
  if (redis) {
    try {
      const data = await redis.get(key);
      if (!data) return { locked: false };
      
      const record: LockoutRecord = JSON.parse(data);
      const now = Date.now();
      
      if (now < record.lockUntil) {
        return {
          locked: true,
          retryAfter: Math.ceil((record.lockUntil - now) / 1000),
        };
      }
      
      // Lock expired
      await redis.del(key);
      return { locked: false };
    } catch (error) {
      logger.error("Redis lockout check failed", { error: (error as Error).message });
      // Fall through to memory check
    }
  }
  
  // In-memory fallback
  const record = memoryStore.get(key);
  if (!record) return { locked: false };
  
  const now = Date.now();
  if (now < record.lockUntil) {
    return {
      locked: true,
      retryAfter: Math.ceil((record.lockUntil - now) / 1000),
    };
  }
  
  memoryStore.delete(key);
  return { locked: false };
}

export async function recordFailedLogin(email: string): Promise<void> {
  const key = getKey(email);
  const redis = await getRedis();
  const now = Date.now();
  
  if (redis) {
    try {
      const data = await redis.get(key);
      let record: LockoutRecord = data ? JSON.parse(data) : { count: 0, lockUntil: 0 };
      
      record.count++;
      
      // Progressive lockout
      if (record.count >= 15) {
        record.lockUntil = now + LOCKOUT_DURATIONS.LEVEL_3;
      } else if (record.count >= 10) {
        record.lockUntil = now + LOCKOUT_DURATIONS.LEVEL_2;
      } else if (record.count >= 5) {
        record.lockUntil = now + LOCKOUT_DURATIONS.LEVEL_1;
      }
      
      await redis.setex(key, LOCKOUT_TTL_SECONDS, JSON.stringify(record));
      
      if (record.lockUntil > now) {
        logger.warn("Account locked due to failed attempts", {
          emailHash: email.substring(0, 3) + "***@***",
          attempts: record.count,
          lockDuration: Math.ceil((record.lockUntil - now) / 60000) + " min",
        });
      }
      return;
    } catch (error) {
      logger.error("Redis lockout record failed", { error: (error as Error).message });
      // Fall through to memory
    }
  }
  
  // In-memory fallback
  const record = memoryStore.get(key) || { count: 0, lockUntil: 0 };
  record.count++;
  
  if (record.count >= 15) {
    record.lockUntil = now + LOCKOUT_DURATIONS.LEVEL_3;
  } else if (record.count >= 10) {
    record.lockUntil = now + LOCKOUT_DURATIONS.LEVEL_2;
  } else if (record.count >= 5) {
    record.lockUntil = now + LOCKOUT_DURATIONS.LEVEL_1;
  }
  
  memoryStore.set(key, record);
}

export async function clearFailedLogins(email: string): Promise<void> {
  const key = getKey(email);
  const redis = await getRedis();
  
  if (redis) {
    try {
      await redis.del(key);
      return;
    } catch (error) {
      logger.error("Redis lockout clear failed", { error: (error as Error).message });
    }
  }
  
  memoryStore.delete(key);
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}
