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
    version: '2.1.0',
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

export default logger;

// Helper functions for structured logging
export const logRequest = (req: any, duration: number) => {
  logger.http('HTTP Request', {
    method: req.method,
    url: req.url,
    status: req.res?.statusCode,
    duration: `${duration}ms`,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
};

export const logError = (error: Error, context?: Record<string, any>) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
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
