import { register, Counter, Histogram, Gauge } from 'prom-client';
import { Request, Response, NextFunction } from 'express';
import { createLogger } from './logger';
import { appConfig } from '../config';

const logger = createLogger('MetricsService');

// HTTP Request metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
});

// Authentication metrics
export const authenticationAttempts = new Counter({
  name: 'authentication_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['type', 'status'],
});

export const activeUsers = new Gauge({
  name: 'active_users_total',
  help: 'Number of currently active users',
});

// Business metrics
export const userRegistrations = new Counter({
  name: 'user_registrations_total',
  help: 'Total number of user registrations',
  labelNames: ['status'],
});

export const passwordChanges = new Counter({
  name: 'password_changes_total',
  help: 'Total number of password changes',
  labelNames: ['status'],
});

export const tokenRefreshes = new Counter({
  name: 'token_refreshes_total',
  help: 'Total number of token refresh attempts',
  labelNames: ['status'],
});

// Database metrics
export const databaseConnections = new Gauge({
  name: 'database_connections_active',
  help: 'Number of active database connections',
});

export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
});

// System metrics
export const processInfo = new Gauge({
  name: 'process_info',
  help: 'Process information',
  labelNames: ['version', 'nodejs_version'],
});

// Initialize system metrics
processInfo.set(
  {
    version: process.env.SERVICE_VERSION || '0.1.0',
    nodejs_version: process.version,
  },
  1
);

// Metrics middleware for Express
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (!appConfig.monitoring.enableMetrics) {
    return next();
  }

  const start = Date.now();
  const route = req.route?.path || req.path;
  
  // Increment request counter
  httpRequestTotal.inc({
    method: req.method,
    route,
    status_code: '0', // Will be updated on response
    service: 'user-service',
  });

  // Override res.end to capture metrics on response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any): Response<any, Record<string, any>> {
    const duration = (Date.now() - start) / 1000;
    
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode.toString(),
      service: 'user-service',
    };

    // Update duration histogram
    httpRequestDuration.observe(labels, duration);

    // Update request counter with final status
    httpRequestTotal.inc(labels);

    // Log slow requests
    if (duration > 1) {
      logger.warn('Slow request detected', {
        method: req.method,
        route,
        statusCode: res.statusCode,
        duration,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      });
    }

    // Call original end function
    return originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Authentication metrics helpers
export const recordAuthenticationAttempt = (type: 'login' | 'register' | 'refresh', success: boolean): void => {
  authenticationAttempts.inc({
    type,
    status: success ? 'success' : 'failure',
  });
};

export const recordUserRegistration = (success: boolean): void => {
  userRegistrations.inc({
    status: success ? 'success' : 'failure',
  });
};

export const recordPasswordChange = (success: boolean): void => {
  passwordChanges.inc({
    status: success ? 'success' : 'failure',
  });
};

export const recordTokenRefresh = (success: boolean): void => {
  tokenRefreshes.inc({
    status: success ? 'success' : 'failure',
  });
};

// Database metrics helpers
export const recordDatabaseQuery = (operation: string, duration: number): void => {
  databaseQueryDuration.observe({ operation }, duration);
};

// Metrics endpoint handler
export const getMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    logger.error('Failed to get metrics', error as Error);
    res.status(500).end('Error retrieving metrics');
  }
};

// Initialize default metrics collection (CPU, memory, etc.)
if (appConfig.monitoring.enableMetrics) {
  // Check if collectDefaultMetrics exists
  if (typeof (register as any).collectDefaultMetrics === 'function') {
    (register as any).collectDefaultMetrics({
      prefix: 'user_service_',
      timeout: 5000,
    });
  }
  
  logger.info('Metrics collection enabled');
} else {
  logger.info('Metrics collection disabled');
}