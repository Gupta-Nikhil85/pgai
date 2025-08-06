import winston from 'winston';
import { appConfig } from '../config';

// Create logger with structured format following our engineering practices
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, traceId, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      service: service || 'user-service',
      traceId,
      ...meta,
    });
  })
);

export const logger = winston.createLogger({
  level: appConfig.logging.level,
  format: logFormat,
  defaultMeta: {
    service: 'user-service',
    version: process.env.SERVICE_VERSION || '0.1.0',
  },
  transports: [
    new winston.transports.Console({
      format: appConfig.isDevelopment 
        ? winston.format.simple() 
        : logFormat,
    }),
  ],
});

// Helper function to create contextual loggers
export const createLogger = (context: string) => {
  return {
    info: (message: string, meta?: any) => 
      logger.info(message, { context, ...meta }),
    warn: (message: string, meta?: any) => 
      logger.warn(message, { context, ...meta }),
    error: (message: string, error?: Error, meta?: any) => 
      logger.error(message, { context, error: error?.stack, ...meta }),
    debug: (message: string, meta?: any) => 
      logger.debug(message, { context, ...meta }),
  };
};

// Request logger for Express middleware
export const requestLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});