import { Request, Response, NextFunction } from 'express';
import * as client from 'prom-client';
import { appConfig } from '../config';

// Create a registry for metrics
const register = new client.Registry();

// Add default metrics
client.collectDefaultMetrics({
  register,
  prefix: 'connection_service_',
});

// Custom metrics for connection service
export const connectionMetrics = {
  // HTTP metrics
  httpRequestsTotal: new client.Counter({
    name: 'connection_service_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
  }),

  httpRequestDuration: new client.Histogram({
    name: 'connection_service_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
    registers: [register],
  }),

  // Connection metrics
  connectionsTotal: new client.Counter({
    name: 'connection_service_connections_total',
    help: 'Total number of database connections created',
    labelNames: ['user_id', 'connection_type', 'status'],
    registers: [register],
  }),

  activeConnections: new client.Gauge({
    name: 'connection_service_active_connections',
    help: 'Number of active database connections',
    labelNames: ['connection_type'],
    registers: [register],
  }),

  connectionTestsTotal: new client.Counter({
    name: 'connection_service_tests_total',
    help: 'Total number of connection tests performed',
    labelNames: ['connection_type', 'result'],
    registers: [register],
  }),

  connectionTestDuration: new client.Histogram({
    name: 'connection_service_test_duration_seconds',
    help: 'Duration of connection tests in seconds',
    labelNames: ['connection_type', 'result'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    registers: [register],
  }),

  // Pool metrics
  connectionPoolSize: new client.Gauge({
    name: 'connection_service_pool_size',
    help: 'Current size of connection pools',
    labelNames: ['connection_id', 'pool_type'],
    registers: [register],
  }),

  connectionPoolActive: new client.Gauge({
    name: 'connection_service_pool_active_connections',
    help: 'Number of active connections in pool',
    labelNames: ['connection_id'],
    registers: [register],
  }),

  connectionPoolIdle: new client.Gauge({
    name: 'connection_service_pool_idle_connections',
    help: 'Number of idle connections in pool',
    labelNames: ['connection_id'],
    registers: [register],
  }),

  connectionPoolWaiting: new client.Gauge({
    name: 'connection_service_pool_waiting_count',
    help: 'Number of requests waiting for connections',
    labelNames: ['connection_id'],
    registers: [register],
  }),

  // Error metrics
  errorsTotal: new client.Counter({
    name: 'connection_service_errors_total',
    help: 'Total number of errors',
    labelNames: ['error_type', 'operation'],
    registers: [register],
  }),

  // Health check metrics
  healthCheckStatus: new client.Gauge({
    name: 'connection_service_health_status',
    help: 'Health status of connections (1 = healthy, 0 = unhealthy)',
    labelNames: ['connection_id'],
    registers: [register],
  }),

  healthCheckDuration: new client.Histogram({
    name: 'connection_service_health_check_duration_seconds',
    help: 'Duration of health checks in seconds',
    labelNames: ['connection_id', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register],
  }),

  // Cache metrics
  cacheOperations: new client.Counter({
    name: 'connection_service_cache_operations_total',
    help: 'Total number of cache operations',
    labelNames: ['operation', 'result'],
    registers: [register],
  }),

  cacheHitRate: new client.Gauge({
    name: 'connection_service_cache_hit_rate',
    help: 'Cache hit rate as a percentage',
    registers: [register],
  }),
};

// Middleware to collect HTTP metrics
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    const route = req.route?.path || req.path;
    
    connectionMetrics.httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: res.statusCode,
    });
    
    connectionMetrics.httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode,
      },
      duration
    );
  });
  
  next();
};

// Helper functions to record metrics
export const recordConnectionCreated = (userId: string, connectionType: string, status: string) => {
  connectionMetrics.connectionsTotal.inc({
    user_id: userId,
    connection_type: connectionType,
    status,
  });
};

export const recordConnectionTest = (
  connectionType: string,
  result: 'success' | 'failure',
  duration: number
) => {
  connectionMetrics.connectionTestsTotal.inc({
    connection_type: connectionType,
    result,
  });
  
  connectionMetrics.connectionTestDuration.observe(
    {
      connection_type: connectionType,
      result,
    },
    duration
  );
};

export const updatePoolMetrics = (
  connectionId: string,
  poolSize: number,
  active: number,
  idle: number,
  waiting: number
) => {
  connectionMetrics.connectionPoolSize.set({ connection_id: connectionId, pool_type: 'total' }, poolSize);
  connectionMetrics.connectionPoolActive.set({ connection_id: connectionId }, active);
  connectionMetrics.connectionPoolIdle.set({ connection_id: connectionId }, idle);
  connectionMetrics.connectionPoolWaiting.set({ connection_id: connectionId }, waiting);
};

export const recordHealthCheck = (
  connectionId: string,
  status: 'healthy' | 'unhealthy',
  duration: number
) => {
  connectionMetrics.healthCheckStatus.set(
    { connection_id: connectionId },
    status === 'healthy' ? 1 : 0
  );
  
  connectionMetrics.healthCheckDuration.observe(
    {
      connection_id: connectionId,
      status,
    },
    duration
  );
};

export const recordError = (errorType: string, operation: string) => {
  connectionMetrics.errorsTotal.inc({
    error_type: errorType,
    operation,
  });
};

export const recordCacheOperation = (operation: 'get' | 'set' | 'delete', result: 'hit' | 'miss' | 'success' | 'failure') => {
  connectionMetrics.cacheOperations.inc({
    operation,
    result,
  });
};

// Metrics endpoint handler
export const getMetrics = async (req: Request, res: Response) => {
  try {
    const metrics = await register.metrics();
    res.set('Content-Type', register.contentType);
    res.end(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to collect metrics' });
  }
};

export { register };
export default connectionMetrics;