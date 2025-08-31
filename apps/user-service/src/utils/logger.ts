import winston from 'winston';
import { appConfig } from '../config';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Simple format for development
const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    let output = `${timestamp} [${service || 'UserService'}] ${level}: ${message}`;
    
    // Add metadata if present
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return output + metaStr;
  })
);

export const logger = winston.createLogger({
  level: appConfig.logging.level,
  format: appConfig.logging.format === 'json' ? logFormat : developmentFormat,
  defaultMeta: {
    service: 'user-service',
    environment: appConfig.env,
    version: process.env.SERVICE_VERSION || '0.1.0',
  },
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
});

// Add file transports for production
if (appConfig.isProduction) {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    })
  );
}

// Helper function to create contextual loggers
export const createLogger = (service: string) => {
  return logger.child({
    service: service || 'user-service',
  });
};

// Request logger for Express middleware
export const requestLogger = createLogger('HTTP');