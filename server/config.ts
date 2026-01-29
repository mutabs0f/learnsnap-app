import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000'),
  DATABASE_URL: z.string().optional(),
  NEON_DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
  SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required'),
  DEVICE_TOKEN_SECRET: z.string().optional(),
  
  // AI API Keys
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  
  // LemonSqueezy Payment
  LEMONSQUEEZY_API_KEY: z.string().optional(),
  LEMONSQUEEZY_WEBHOOK_SECRET: z.string().optional(),
  LEMONSQUEEZY_STORE_ID: z.string().optional(),
  
  // Redis/Cache
  REDIS_URL: z.string().optional(),
  REDIS_PRIVATE_URL: z.string().optional(),
  
  // Encryption
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters').optional(),
  
  FRONTEND_URL: z.string().optional(),
  APP_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'http']).default('info'),
  SENTRY_DSN: z.string().optional(),
  
  // Feature flags
  ENABLE_CACHING: z.string().optional(),
  ENABLE_ASYNC_PROCESSING: z.string().optional(),
  ENABLE_ENCRYPTION: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  try {
    const env = envSchema.parse(process.env);
    const isProduction = env.NODE_ENV === 'production';
    const warnings: string[] = [];
    const errors: string[] = [];
    
    // Check for database
    if (!env.DATABASE_URL && !env.NEON_DATABASE_URL) {
      if (isProduction) {
        errors.push('DATABASE_URL or NEON_DATABASE_URL is required in production');
      } else {
        warnings.push('DATABASE_URL not set - using in-memory storage');
      }
    }
    
    // Check for AI API keys
    if (!env.GEMINI_API_KEY) {
      warnings.push('GEMINI_API_KEY not set - primary AI generation will fail');
    }
    if (!env.OPENAI_API_KEY) {
      warnings.push('OPENAI_API_KEY not set - AI verification will fail');
    }
    if (!env.ANTHROPIC_API_KEY) {
      warnings.push('ANTHROPIC_API_KEY not set - AI fixing will fail');
    }
    
    // Check for payment in production
    if (!env.LEMONSQUEEZY_API_KEY && isProduction) {
      warnings.push('LEMONSQUEEZY_API_KEY not set - payments will not work');
    }
    
    // Check for encryption key in production
    if (!env.ENCRYPTION_KEY && isProduction) {
      warnings.push('ENCRYPTION_KEY not set - sensitive data encryption disabled');
    }
    
    // Check for Redis (optional but recommended)
    if (!env.REDIS_URL && !env.REDIS_PRIVATE_URL) {
      warnings.push('REDIS_URL not set - caching/async processing disabled (using fallback)');
    }
    
    // Check for device token secret in production
    if (!env.DEVICE_TOKEN_SECRET && !env.SESSION_SECRET && isProduction) {
      errors.push('DEVICE_TOKEN_SECRET or SESSION_SECRET required in production');
    }
    
    // Log warnings
    warnings.forEach(w => console.warn(`⚠️  ${w}`));
    
    // Handle errors
    if (errors.length > 0) {
      errors.forEach(e => console.error(`❌ ${e}`));
      if (isProduction) {
        process.exit(1);
      }
    }
    
    console.log('✅ Environment variables validated successfully');
    return env;
  } catch (error) {
    console.error('❌ Environment validation failed:');
    if (error instanceof z.ZodError) {
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    return process.env as unknown as Env;
  }
}

export const config = validateEnv();
