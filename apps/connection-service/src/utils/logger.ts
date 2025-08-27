import winston from 'winston';
import { appConfig } from '../config';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  appConfig.isDevelopment
    ? winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    : winston.format.json()
);

// Create logger instance
export const logger = winston.createLogger({
  level: appConfig.logging.level,
  format: logFormat,
  defaultMeta: {
    service: appConfig.service.name,
    version: appConfig.service.version,
  },
  transports: [
    new winston.transports.Console({
      format: appConfig.logging.format === 'json' 
        ? winston.format.json() 
        : winston.format.simple()
    }),
  ],
});

// Specialized loggers for different components
export const connectionLogger = logger.child({ component: 'connection' });
export const poolLogger = logger.child({ component: 'pool' });
export const securityLogger = logger.child({ component: 'security' });
export const healthLogger = logger.child({ component: 'health' });
export const metricsLogger = logger.child({ component: 'metrics' });

// Request logger middleware
export const requestLogger = logger.child({ component: 'request' });

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
  return logger.child({ component });
};

export default logger;