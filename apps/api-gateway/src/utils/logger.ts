import winston from 'winston';
import { gatewayConfig } from '../config';

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
const simpleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    let output = `${timestamp} [${service || 'APIGateway'}] ${level}: ${message}`;
    
    // Add metadata if present
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return output + metaStr;
  })
);

// Create base logger
const baseLogger = winston.createLogger({
  level: gatewayConfig.logging.level,
  format: gatewayConfig.logging.format === 'json' ? logFormat : simpleFormat,
  defaultMeta: {
    service: 'APIGateway',
    environment: gatewayConfig.env,
    version: gatewayConfig.api.version,
  },
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
});

// Add file transports for production
if (gatewayConfig.isProduction) {
  baseLogger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    })
  );

  baseLogger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    })
  );
}

// Create logger factory function
export const createLogger = (service?: string): winston.Logger => {
  return baseLogger.child({
    service: service || 'APIGateway',
  });
};

// Default logger instance
export const logger = createLogger();

// Request logger for Morgan
export const requestLogger = createLogger('HTTP');

// Specialized loggers
export const authLogger = createLogger('Auth');
export const routingLogger = createLogger('Routing');
export const securityLogger = createLogger('Security');
export const metricsLogger = createLogger('Metrics');

// Log startup configuration (without sensitive data)
export const logStartupConfig = (): void => {
  logger.info('API Gateway starting up', {
    environment: gatewayConfig.env,
    port: gatewayConfig.port,
    host: gatewayConfig.host,
    logLevel: gatewayConfig.logging.level,
    cors: gatewayConfig.cors.enabled,
    rateLimit: `${gatewayConfig.security.rateLimit.maxRequests} requests per ${gatewayConfig.security.rateLimit.windowMs}ms`,
    services: Object.entries(gatewayConfig.services)
      .filter(([, config]) => config.url)
      .map(([name]) => name),
  });
};

// Export logger instance as default
export default logger;