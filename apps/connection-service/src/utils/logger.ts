import winston from 'winston';
import { appConfig } from '../config';

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    let output = `${timestamp} [${service || 'ConnectionService'}] ${level}: ${message}`;
    
    // Add metadata if present
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return output + metaStr;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: appConfig.logging.level,
  format: appConfig.logging.format === 'json' ? logFormat : developmentFormat,
  defaultMeta: {
    service: appConfig.service.name,
    environment: appConfig.env,
    version: appConfig.service.version,
  },
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
});

// Helper function for structured logging
export const logError = (
  logger: winston.Logger,
  message: string,
  error: Error,
  context?: Record<string, any>
) => {
  logger.error(message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  });
};

// Helper function for performance logging
export const logPerformance = (
  logger: winston.Logger,
  operation: string,
  duration: number,
  context?: Record<string, any>
) => {
  logger.info(`${operation} completed`, {
    operation,
    duration_ms: duration,
    ...context,
  });
};

// Factory function to create component-specific loggers
export const createLogger = (component: string): winston.Logger => {
  return logger.child({ component: component || 'ConnectionService' });
};


// Specialized loggers for different components
export const connectionLogger = createLogger('connection');
export const poolLogger = createLogger('pool');
export const securityLogger = createLogger('security');
export const healthLogger = createLogger('health');
export const metricsLogger = createLogger('metrics');

// Request logger middleware
export const requestLogger = createLogger('request');

export default logger;