import winston from 'winston';
import { appConfig } from '../config';

// Create base logger configuration
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, context, service, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      context,
      service: service || appConfig.service.name,
      version: appConfig.service.version,
      ...meta,
    });
  })
);

// Create the main logger instance
export const logger = winston.createLogger({
  level: appConfig.logging.level,
  format: appConfig.logging.format === 'simple' 
    ? winston.format.simple() 
    : logFormat,
  defaultMeta: {
    service: appConfig.service.name,
    version: appConfig.service.version,
  },
  transports: [
    new winston.transports.Console({
      format: appConfig.isDevelopment 
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        : logFormat,
    }),
  ],
});

// Create contextual logger factory
export const createLogger = (context: string) => {
  return {
    info: (message: string, meta?: any) => 
      logger.info(message, { context, ...meta }),
    
    warn: (message: string, meta?: any) => 
      logger.warn(message, { context, ...meta }),
    
    error: (message: string, error?: Error, meta?: any) => 
      logger.error(message, { 
        context, 
        error: error?.message,
        stack: error?.stack,
        ...meta 
      }),
    
    debug: (message: string, meta?: any) => 
      logger.debug(message, { context, ...meta }),
  };
};

// Request logger for Express middleware
export const requestLogger = {
  info: (message: string) => logger.info(message.trim()),
};

// Handle uncaught exceptions and unhandled rejections
if (!appConfig.isTest) {
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', error, {
      context: 'Process',
      fatal: true,
    });
    
    // Give logger time to write before exiting
    setTimeout(() => process.exit(1), 1000);
  });

  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Rejection', reason instanceof Error ? reason : new Error(String(reason)), {
      context: 'Process',
      promise: promise.toString(),
    });
  });
}

export default logger;