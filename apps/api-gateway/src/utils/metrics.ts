import { register, Counter, Histogram, Gauge } from 'prom-client';
import { Request, Response, NextFunction } from 'express';
import { metricsLogger } from './logger';
import { gatewayConfig } from '../config';

// Gateway-specific metrics
export const httpRequestDuration = new Histogram({
  name: 'gateway_http_request_duration_seconds',
  help: 'Duration of HTTP requests handled by the gateway in seconds',
  labelNames: ['method', 'route', 'status_code', 'target_service'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10, 15, 30],
});

export const httpRequestTotal = new Counter({
  name: 'gateway_http_requests_total',
  help: 'Total number of HTTP requests handled by the gateway',
  labelNames: ['method', 'route', 'status_code', 'target_service'],
});

// Authentication metrics
export const authenticationAttempts = new Counter({
  name: 'gateway_authentication_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['result', 'method'],
});

export const authorizationChecks = new Counter({
  name: 'gateway_authorization_checks_total',
  help: 'Total number of authorization checks',
  labelNames: ['result', 'required_role'],
});

// Service proxy metrics
export const serviceProxyRequests = new Counter({
  name: 'gateway_service_proxy_requests_total',
  help: 'Total number of requests proxied to backend services',
  labelNames: ['service', 'method', 'status_code'],
});

export const serviceProxyDuration = new Histogram({
  name: 'gateway_service_proxy_duration_seconds',
  help: 'Duration of proxied requests to backend services',
  labelNames: ['service', 'method', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
});

export const serviceProxyErrors = new Counter({
  name: 'gateway_service_proxy_errors_total',
  help: 'Total number of errors when proxying to backend services',
  labelNames: ['service', 'error_type'],
});

// Rate limiting metrics
export const rateLimitHits = new Counter({
  name: 'gateway_rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['limit_type', 'identifier'],
});

// Circuit breaker metrics
export const circuitBreakerState = new Gauge({
  name: 'gateway_circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  labelNames: ['service'],
});

export const circuitBreakerTransitions = new Counter({
  name: 'gateway_circuit_breaker_transitions_total',
  help: 'Total number of circuit breaker state transitions',
  labelNames: ['service', 'from_state', 'to_state'],
});

// Cache metrics
export const cacheOperations = new Counter({
  name: 'gateway_cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['operation', 'result'],
});

export const cacheHitRatio = new Gauge({
  name: 'gateway_cache_hit_ratio',
  help: 'Cache hit ratio',
});

// System metrics
export const activeConnections = new Gauge({
  name: 'gateway_active_connections',
  help: 'Number of active connections to the gateway',
});

export const memoryUsage = new Gauge({
  name: 'gateway_memory_usage_bytes',
  help: 'Memory usage in bytes',
  labelNames: ['type'],
});

// Request size metrics
export const requestSize = new Histogram({
  name: 'gateway_request_size_bytes',
  help: 'Size of HTTP requests in bytes',
  buckets: [100, 1000, 10000, 100000, 1000000],
});

export const responseSize = new Histogram({
  name: 'gateway_response_size_bytes',
  help: 'Size of HTTP responses in bytes',
  buckets: [100, 1000, 10000, 100000, 1000000],
});

// Metrics middleware for Express
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (!gatewayConfig.monitoring.enableMetrics) {
    return next();
  }

  const start = process.hrtime.bigint();
  const route = req.route?.path || req.path;
  const targetService = extractTargetService(req.path);
  
  // Track request size
  const requestSizeBytes = req.get('content-length');
  if (requestSizeBytes) {
    requestSize.observe(parseInt(requestSizeBytes, 10));
  }

  // Override res.end to capture metrics on response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any): Response<any, Record<string, any>> {
    const durationNs = process.hrtime.bigint() - start;
    const duration = Number(durationNs) / 1e9; // Convert to seconds
    
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode.toString(),
      target_service: targetService,
    };

    // Update metrics
    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);

    // Track response size
    const responseLength = res.get('content-length');
    if (responseLength) {
      responseSize.observe(parseInt(responseLength, 10));
    }

    // Log slow requests
    if (duration > 5) {
      metricsLogger.warn('Slow request detected', {
        method: req.method,
        route,
        statusCode: res.statusCode,
        duration,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        targetService,
      });
    }

    // Call original end function
    return originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Extract target service from request path
const extractTargetService = (path: string): string => {
  const pathSegments = path.split('/').filter(segment => segment);
  
  if (pathSegments.length === 0) {
    return 'gateway';
  }

  // Map path prefixes to services
  const serviceMap: Record<string, string> = {
    'auth': 'user-service',
    'users': 'user-service',
    'connections': 'connection-service',
    'schemas': 'schema-service',
    'views': 'view-service',
    'versions': 'versioning-service',
    'docs': 'documentation-service',
    'health': 'gateway',
    'metrics': 'gateway',
  };

  return serviceMap[pathSegments[0]] || 'unknown';
};

// Metrics helper functions
export const recordAuthenticationAttempt = (result: 'success' | 'failure', method: string): void => {
  authenticationAttempts.inc({ result, method });
};

export const recordAuthorizationCheck = (result: 'success' | 'failure', requiredRole: string): void => {
  authorizationChecks.inc({ result, required_role: requiredRole });
};

export const recordServiceProxyRequest = (
  service: string,
  method: string,
  statusCode: number,
  duration: number
): void => {
  const labels = {
    service,
    method,
    status_code: statusCode.toString(),
  };
  
  serviceProxyRequests.inc(labels);
  serviceProxyDuration.observe(labels, duration);
};

export const recordServiceProxyError = (service: string, errorType: string): void => {
  serviceProxyErrors.inc({ service, error_type: errorType });
};

export const recordRateLimitHit = (limitType: string, identifier: string): void => {
  rateLimitHits.inc({ limit_type: limitType, identifier });
};

export const recordCacheOperation = (operation: 'get' | 'set' | 'del', result: 'hit' | 'miss' | 'success' | 'error'): void => {
  cacheOperations.inc({ operation, result });
};

export const updateCircuitBreakerState = (service: string, state: 'closed' | 'open' | 'half-open'): void => {
  const stateValue = { closed: 0, open: 1, 'half-open': 2 }[state];
  circuitBreakerState.set({ service }, stateValue);
};

export const recordCircuitBreakerTransition = (
  service: string,
  fromState: string,
  toState: string
): void => {
  circuitBreakerTransitions.inc({
    service,
    from_state: fromState,
    to_state: toState,
  });
};

// Update system metrics periodically
export const updateSystemMetrics = (): void => {
  const memUsage = process.memoryUsage();
  memoryUsage.set({ type: 'rss' }, memUsage.rss);
  memoryUsage.set({ type: 'heap_used' }, memUsage.heapUsed);
  memoryUsage.set({ type: 'heap_total' }, memUsage.heapTotal);
  memoryUsage.set({ type: 'external' }, memUsage.external);
};

// Metrics endpoint handler
export const getMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    metricsLogger.error('Failed to get metrics', error as Error);
    res.status(500).end('Error retrieving metrics');
  }
};

// Initialize default metrics collection
if (gatewayConfig.monitoring.enableMetrics) {
  // Check if collectDefaultMetrics exists
  if (typeof (register as any).collectDefaultMetrics === 'function') {
    (register as any).collectDefaultMetrics({
      prefix: 'gateway_',
      timeout: 5000,
    });
  }
  
  // Update system metrics every 10 seconds
  setInterval(updateSystemMetrics, 10000);
  
  metricsLogger.info('Metrics collection enabled');
} else {
  metricsLogger.info('Metrics collection disabled');
}