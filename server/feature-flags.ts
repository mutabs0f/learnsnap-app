/**
 * Feature Flags Service
 * [SRE v3.5.0] Runtime feature toggles for incident response
 * [L7 v3.5.2] Added Redis persistence for multi-instance deployments
 * 
 * Flags can be set via:
 * 1. Environment variables (static, requires restart)
 * 2. Runtime API (dynamic, no restart needed)
 * 3. Redis persistence (survives restarts, shared across instances)
 */

import Redis from "ioredis";
import logger from "./logger";

interface FeatureFlags {
  MAINTENANCE_MODE: boolean;
  DISABLE_AI_GENERATION: boolean;
  DISABLE_PAYMENTS: boolean;
  READ_ONLY_MODE: boolean;
  DISABLE_REGISTRATION: boolean;
  ENABLE_DEBUG_ENDPOINTS: boolean;
  REDUCED_AI_CONCURRENCY: boolean;
}

const defaultFlags: FeatureFlags = {
  MAINTENANCE_MODE: false,
  DISABLE_AI_GENERATION: false,
  DISABLE_PAYMENTS: false,
  READ_ONLY_MODE: false,
  DISABLE_REGISTRATION: false,
  ENABLE_DEBUG_ENDPOINTS: false,
  REDUCED_AI_CONCURRENCY: false,
};

const REDIS_KEY_PREFIX = 'learnsnap:feature_flags:';
const SYNC_INTERVAL_MS = 30000; // 30 seconds

class FeatureFlagService {
  private flags: FeatureFlags;
  private overrides: Partial<FeatureFlags> = {};
  private redisClient: Redis | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncTime = 0;

  constructor() {
    this.flags = { ...defaultFlags };
    this.loadFromEnv();
    this.initRedis();
  }

  private async initRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
    if (!redisUrl) {
      logger.info('Feature flags: Redis not configured, using in-memory only');
      return;
    }

    try {
      this.redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 500, 3000);
        },
      });

      await this.redisClient.connect();
      
      // Load persisted overrides from Redis
      await this.loadFromRedis();
      
      // Start periodic sync
      this.syncInterval = setInterval(() => {
        this.loadFromRedis().catch(err => {
          logger.warn('Feature flags Redis sync failed', { error: err.message });
        });
      }, SYNC_INTERVAL_MS);

      logger.info('Feature flags: Redis persistence enabled');
    } catch (error) {
      logger.warn('Feature flags: Redis connection failed, using in-memory', { 
        error: (error as Error).message 
      });
      this.redisClient = null;
    }
  }

  private async loadFromRedis(): Promise<void> {
    if (!this.redisClient) return;

    try {
      const keys = Object.keys(defaultFlags) as (keyof FeatureFlags)[];
      
      for (const flag of keys) {
        const value = await this.redisClient.get(`${REDIS_KEY_PREFIX}${flag}`);
        if (value !== null) {
          this.overrides[flag] = value === 'true';
        }
      }
      
      this.lastSyncTime = Date.now();
    } catch (error) {
      logger.warn('Failed to load feature flags from Redis', { 
        error: (error as Error).message 
      });
    }
  }

  private async persistToRedis(flag: keyof FeatureFlags, value: boolean): Promise<void> {
    if (!this.redisClient) return;

    try {
      await this.redisClient.set(
        `${REDIS_KEY_PREFIX}${flag}`, 
        value.toString(),
        'EX',
        86400 * 7 // 7 days TTL
      );
    } catch (error) {
      logger.warn('Failed to persist feature flag to Redis', { 
        flag, 
        error: (error as Error).message 
      });
    }
  }

  private async removeFromRedis(flag: keyof FeatureFlags): Promise<void> {
    if (!this.redisClient) return;

    try {
      await this.redisClient.del(`${REDIS_KEY_PREFIX}${flag}`);
    } catch (error) {
      logger.warn('Failed to remove feature flag from Redis', { 
        flag, 
        error: (error as Error).message 
      });
    }
  }

  private loadFromEnv(): void {
    const envMappings: Record<keyof FeatureFlags, string> = {
      MAINTENANCE_MODE: 'MAINTENANCE_MODE',
      DISABLE_AI_GENERATION: 'DISABLE_AI_GENERATION',
      DISABLE_PAYMENTS: 'DISABLE_PAYMENTS',
      READ_ONLY_MODE: 'READ_ONLY_MODE',
      DISABLE_REGISTRATION: 'DISABLE_REGISTRATION',
      ENABLE_DEBUG_ENDPOINTS: 'ENABLE_DEBUG_ENDPOINTS',
      REDUCED_AI_CONCURRENCY: 'REDUCED_AI_CONCURRENCY',
    };

    for (const [flag, envVar] of Object.entries(envMappings)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        this.flags[flag as keyof FeatureFlags] = value === 'true' || value === '1';
      }
    }
  }

  isEnabled(flag: keyof FeatureFlags): boolean {
    if (flag in this.overrides) {
      return this.overrides[flag]!;
    }
    return this.flags[flag];
  }

  async setFlag(flag: keyof FeatureFlags, enabled: boolean): Promise<void> {
    this.overrides[flag] = enabled;
    await this.persistToRedis(flag, enabled);
    
    logger.warn(`Feature flag changed: ${flag} = ${enabled}`, {
      flag,
      enabled,
      source: 'runtime',
      persisted: !!this.redisClient,
    });
  }

  async clearOverride(flag: keyof FeatureFlags): Promise<void> {
    delete this.overrides[flag];
    await this.removeFromRedis(flag);
    logger.info(`Feature flag override cleared: ${flag}`, { flag });
  }

  async clearAllOverrides(): Promise<void> {
    const flags = Object.keys(this.overrides) as (keyof FeatureFlags)[];
    for (const flag of flags) {
      await this.removeFromRedis(flag);
    }
    this.overrides = {};
    logger.info('All feature flag overrides cleared');
  }

  getAllFlags(): Record<string, { value: boolean; source: 'env' | 'runtime' | 'default'; persisted: boolean }> {
    const result: Record<string, { value: boolean; source: 'env' | 'runtime' | 'default'; persisted: boolean }> = {};
    
    for (const flag of Object.keys(defaultFlags) as (keyof FeatureFlags)[]) {
      let source: 'env' | 'runtime' | 'default' = 'default';
      let value = defaultFlags[flag];
      
      if (process.env[flag] !== undefined) {
        source = 'env';
        value = this.flags[flag];
      }
      
      if (flag in this.overrides) {
        source = 'runtime';
        value = this.overrides[flag]!;
      }
      
      result[flag] = { value, source, persisted: !!this.redisClient };
    }
    
    return result;
  }

  isRedisConnected(): boolean {
    return this.redisClient !== null && this.redisClient.status === 'ready';
  }

  getLastSyncTime(): number {
    return this.lastSyncTime;
  }

  async shutdown(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.redisClient) {
      await this.redisClient.quit();
      this.redisClient = null;
    }
  }
}

export const featureFlags = new FeatureFlagService();

export function isMaintenanceMode(): boolean {
  return featureFlags.isEnabled('MAINTENANCE_MODE');
}

export function isAIDisabled(): boolean {
  return featureFlags.isEnabled('DISABLE_AI_GENERATION');
}

export function arePaymentsDisabled(): boolean {
  return featureFlags.isEnabled('DISABLE_PAYMENTS');
}

export function isReadOnlyMode(): boolean {
  return featureFlags.isEnabled('READ_ONLY_MODE');
}

export function isRegistrationDisabled(): boolean {
  return featureFlags.isEnabled('DISABLE_REGISTRATION');
}

export function isReducedConcurrency(): boolean {
  return featureFlags.isEnabled('REDUCED_AI_CONCURRENCY');
}
