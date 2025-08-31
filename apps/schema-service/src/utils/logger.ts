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
    let output = `${timestamp} [${service || 'SchemaService'}] ${level}: ${message}`;
    
    // Add metadata if present
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return output + metaStr;
  })
);

// Create the main logger instance
export const logger = winston.createLogger({
  level: appConfig.logging.level,
  format: appConfig.logging.format === 'json' ? logFormat : developmentFormat,
  defaultMeta: {
    environment: appConfig.env,
    service: appConfig.service.name,
    version: appConfig.service.version,
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

// Create contextual logger factory
export const createLogger = (service?: string): winston.Logger => {
  return logger.child({
    service: service || 'SchemaService',
  });
};

// Request logger for Express middleware
export const requestLogger = createLogger('HTTP');

export default logger;