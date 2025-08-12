import { Request, Response, NextFunction } from 'express';
import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { appConfig } from '../config';

// Clear any existing metrics (useful for testing)
register.clear();

// Collect default metrics (CPU, memory, etc.)
if (appConfig.monitoring.enableMetrics) {
  collectDefaultMetrics({
    register,
    prefix: 'schema_service_',
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  });
}

// HTTP Request Metrics
export const httpRequestDuration = new Histogram({
  name: 'schema_service_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10, 15, 30],
});

export const httpRequestTotal = new Counter({
  name: 'schema_service_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

// Schema Discovery Metrics
export const schemaDiscoveryDuration = new Histogram({
  name: 'schema_service_discovery_duration_seconds',
  help: 'Duration of schema discovery operations',
  labelNames: ['connection_id', 'success'],
  buckets: [1, 5, 10, 15, 30, 60, 120, 300, 600],
});

export const schemaDiscoveryTotal = new Counter({
  name: 'schema_service_discovery_total',
  help: 'Total number of schema discovery operations',
  labelNames: ['connection_id', 'success'],
});

export const schemaObjectsDiscovered = new Histogram({
  name: 'schema_service_objects_discovered',
  help: 'Number of schema objects discovered',
  labelNames: ['connection_id', 'object_type'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500],
});

// Cache Metrics
export const cacheOperationDuration = new Histogram({
  name: 'schema_service_cache_operation_duration_seconds',
  help: 'Duration of cache operations',
  labelNames: ['operation', 'success'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
});

export const cacheOperationTotal = new Counter({
  name: 'schema_service_cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['operation', 'success'],
});

export const cacheHitRate = new Gauge({
  name: 'schema_service_cache_hit_rate',
  help: 'Cache hit rate as a percentage',
});

export const cacheSizeBytes = new Gauge({
  name: 'schema_service_cache_size_bytes',
  help: 'Current cache size in bytes',
});

export const cacheEntries = new Gauge({
  name: 'schema_service_cache_entries',
  help: 'Number of entries in cache',
});

// Database Connection Metrics
export const databaseConnectionsActive = new Gauge({
  name: 'schema_service_database_connections_active',
  help: 'Number of active database connections',
  labelNames: ['connection_id'],
});

export const databaseQueryDuration = new Histogram({
  name: 'schema_service_database_query_duration_seconds',
  help: 'Duration of database queries',
  labelNames: ['query_type', 'success'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
});

export const databaseQueryTotal = new Counter({
  name: 'schema_service_database_query_total',
  help: 'Total number of database queries',
  labelNames: ['query_type', 'success'],
});

// WebSocket Metrics (for real-time updates)
export const websocketConnections = new Gauge({
  name: 'schema_service_websocket_connections',
  help: 'Number of active WebSocket connections',
});

export const websocketMessages = new Counter({
  name: 'schema_service_websocket_messages_total',
  help: 'Total number of WebSocket messages sent',
  labelNames: ['message_type'],
});

// Service Health Metrics
export const serviceHealth = new Gauge({
  name: 'schema_service_health_status',
  help: 'Service health status (1 = healthy, 0 = unhealthy)',
  labelNames: ['component'],
});

// Middleware for automatic HTTP metrics collection
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (!appConfig.monitoring.enableMetrics) {
    return next();
  }

  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode.toString(),
    };
    
    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);
  });
  
  next();
};

// Function to get metrics in Prometheus format
export const getMetrics = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end('Error generating metrics');
  }
};

// Utility functions for recording metrics
export const recordSchemaDiscovery = {
  start: (connectionId: string) => {
    const end = schemaDiscoveryDuration.startTimer({ connection_id: connectionId, success: 'unknown' });
    return {
      success: () => {
        end({ success: 'true' });
        schemaDiscoveryTotal.inc({ connection_id: connectionId, success: 'true' });
      },
      failure: () => {
        end({ success: 'false' });
        schemaDiscoveryTotal.inc({ connection_id: connectionId, success: 'false' });
      },
    };
  },
  objects: (connectionId: string, objectType: string, count: number) => {
    schemaObjectsDiscovered.observe({ connection_id: connectionId, object_type: objectType }, count);
  },
};

export const recordCacheOperation = {
  start: (operation: string) => {
    const end = cacheOperationDuration.startTimer({ operation, success: 'unknown' });
    return {
      success: () => {
        end({ success: 'true' });
        cacheOperationTotal.inc({ operation, success: 'true' });
      },
      failure: () => {
        end({ success: 'false' });
        cacheOperationTotal.inc({ operation, success: 'false' });
      },
    };
  },
};

export const recordDatabaseQuery = {
  start: (queryType: string) => {
    const end = databaseQueryDuration.startTimer({ query_type: queryType, success: 'unknown' });
    return {
      success: () => {
        end({ success: 'true' });
        databaseQueryTotal.inc({ query_type: queryType, success: 'true' });
      },
      failure: () => {
        end({ success: 'false' });
        databaseQueryTotal.inc({ query_type: queryType, success: 'false' });
      },
    };
  },
};

// Health check utilities
export const updateServiceHealth = (component: string, healthy: boolean): void => {
  serviceHealth.set({ component }, healthy ? 1 : 0);
};

export const updateCacheMetrics = (hitRate: number, sizeBytes: number, entries: number): void => {
  cacheHitRate.set(hitRate);
  cacheSizeBytes.set(sizeBytes);
  cacheEntries.set(entries);
};

export const updateWebSocketMetrics = (connections: number): void => {
  websocketConnections.set(connections);
};

export const recordWebSocketMessage = (messageType: string): void => {
  websocketMessages.inc({ message_type: messageType });
};

// Cleanup function for graceful shutdown
export const cleanupMetrics = (): void => {
  register.clear();
};