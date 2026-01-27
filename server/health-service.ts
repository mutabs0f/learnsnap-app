import { db } from './db.js';
import { getCacheStats } from './cache-service.js';
import logger from './logger.js';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: { status: boolean; latency?: number; error?: string };
    redis: { status: boolean; stats?: any; error?: string };
    memory: { used: number; total: number; percentage: number };
    disk: { status: boolean };
  };
}

async function checkDatabase(): Promise<{
  status: boolean;
  latency?: number;
  error?: string;
}> {
  try {
    const start = Date.now();
    
    await db.execute('SELECT 1');
    
    const latency = Date.now() - start;
    
    return {
      status: true,
      latency,
    };
  } catch (error) {
    return {
      status: false,
      error: (error as Error).message,
    };
  }
}

async function checkRedis(): Promise<{
  status: boolean;
  stats?: any;
  error?: string;
}> {
  try {
    const stats = await getCacheStats();
    
    return {
      status: stats.connected,
      stats,
    };
  } catch (error) {
    return {
      status: false,
      error: (error as Error).message,
    };
  }
}

function checkMemory(): {
  used: number;
  total: number;
  percentage: number;
} {
  const used = process.memoryUsage();
  const total = used.heapTotal;
  const percentage = (used.heapUsed / total) * 100;

  return {
    used: Math.round(used.heapUsed / 1024 / 1024),
    total: Math.round(total / 1024 / 1024),
    percentage: Math.round(percentage),
  };
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const [database, redis] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  const memory = checkMemory();

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (!database.status) {
    status = 'unhealthy';
  } else if (!redis.status || memory.percentage > 90) {
    status = 'degraded';
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '2.9.1',
    checks: {
      database,
      redis,
      memory,
      disk: { status: true },
    },
  };
}

export async function isHealthy(): Promise<boolean> {
  try {
    const health = await getHealthStatus();
    return health.status !== 'unhealthy';
  } catch (error) {
    logger.error('Health check failed', { error: (error as Error).message });
    return false;
  }
}

export async function getReadinessStatus(): Promise<{
  ready: boolean;
  checks: { database: boolean; redis: boolean };
}> {
  const [database, redis] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  return {
    ready: database.status,
    checks: {
      database: database.status,
      redis: redis.status,
    },
  };
}

export async function getLivenessStatus(): Promise<{
  alive: boolean;
  uptime: number;
}> {
  return {
    alive: true,
    uptime: process.uptime(),
  };
}
