import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { mkdirSync } from 'fs';

const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

// Ensure logs directory exists
try {
  mkdirSync('logs', { recursive: true });
} catch (err) {
  // Directory already exists or permission issue
}

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

// JSON format for file logs (machine-readable)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger with service metadata
const logger = winston.createLogger({
  level: logLevel,
  format: fileFormat,
  defaultMeta: {
    service: 'learnsnap',
    environment: process.env.NODE_ENV || 'development',
    version: '2.9.1',
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
      silent: process.env.NODE_ENV === 'test',
    }),
    // Error log file
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '30d',
      maxSize: '20m',
      zippedArchive: isProduction,
    }),
    // Combined log file
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      maxSize: '20m',
      zippedArchive: isProduction,
    }),
    // HTTP requests log file
    new DailyRotateFile({
      filename: 'logs/http-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'http',
      maxFiles: '7d',
      maxSize: '20m',
      zippedArchive: isProduction,
    }),
  ],
});

// PII filter for production logs
function sanitizeLogData(data: Record<string, any>): Record<string, any> {
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'authorization', 'cookie', 'email'];
  const sanitized = { ...data };
  
  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

// Override logger methods in production to sanitize PII
if (process.env.NODE_ENV === 'production') {
  const originalInfo = logger.info.bind(logger);
  const originalWarn = logger.warn.bind(logger);
  const originalError = logger.error.bind(logger);
  
  (logger as any).info = (message: any, meta?: any) => {
    if (typeof message === 'string' && meta) {
      return originalInfo(message, sanitizeLogData(meta));
    }
    return originalInfo(message, meta);
  };
  (logger as any).warn = (message: any, meta?: any) => {
    if (typeof message === 'string' && meta) {
      return originalWarn(message, sanitizeLogData(meta));
    }
    return originalWarn(message, meta);
  };
  (logger as any).error = (message: any, meta?: any) => {
    if (typeof message === 'string' && meta) {
      return originalError(message, sanitizeLogData(meta));
    }
    return originalError(message, meta);
  };
}

export default logger;

// Helper functions for structured logging
export const logRequest = (req: any, duration: number) => {
  logger.http('HTTP Request', {
    requestId: req.id,
    method: req.method,
    url: req.url,
    status: req.res?.statusCode,
    duration: `${duration}ms`,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    apiVersion: req.apiVersion,
  });
};

export const logError = (error: Error, context?: Record<string, any>) => {
  logger.error('Application Error', {
    errorName: error.name,
    message: error.message,
    stack: error.stack,
    requestId: context?.requestId,
    ...context,
  });
};

export const logAI = (action: string, details: Record<string, any>) => {
  logger.info('AI Operation', {
    action,
    ...details,
  });
};

export const logPayment = (action: string, details: Record<string, any>) => {
  logger.info('Payment Operation', {
    action,
    ...details,
  });
};

export const logQuiz = (action: string, details: Record<string, any>) => {
  logger.info('Quiz Operation', {
    action,
    ...details,
  });
};
