import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import 'express-async-errors'; // Automatically catch async errors

import { appConfig } from './config';
import { logger, requestLogger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { metricsMiddleware, getMetrics } from './utils/metrics';

// Route imports
import { connectionRoutes } from './routes/connection.routes';
import { testingRoutes } from './routes/testing.routes';
import { monitoringRoutes } from './routes/monitoring.routes';
import { healthRoutes } from './routes/health.routes';

// Create Express application
const app: express.Express = express();

// Trust proxy if behind load balancer
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS configuration
if (appConfig.cors.enabled) {
  app.use(cors({
    origin: appConfig.cors.origin === '*' ? true : appConfig.cors.origin.split(','),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-trace-id'],
    credentials: true,
    maxAge: 86400, // 24 hours
  }));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: appConfig.security.rateLimit.windowMs,
  max: appConfig.security.rateLimit.maxRequests,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later',
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: 'unknown',
      version: '0.1.0',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path.startsWith('/health');
  },
  keyGenerator: (req) => {
    // Use forwarded IP if behind proxy
    return req.ip || req.connection.remoteAddress || 'unknown';
  },
});

app.use(limiter);

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  type: ['application/json', 'application/json; charset=utf-8']
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => {
      requestLogger.info(message.trim());
    }
  },
  skip: (req) => {
    // Skip logging for health checks in production
    return appConfig.isProduction && req.path.startsWith('/health');
  }
}));

// Metrics middleware
app.use(metricsMiddleware);

// Request ID middleware
app.use((req, res, next) => {
  const requestId = req.get('x-request-id') || 
    require('crypto').randomBytes(16).toString('hex');
  
  req.headers['x-request-id'] = requestId;
  res.set('x-request-id', requestId);
  
  next();
});

// API routes
app.use('/health', healthRoutes);
app.use('/connections', connectionRoutes);
app.use('/testing', testingRoutes);
app.use('/monitoring', monitoringRoutes);

// Metrics endpoint (separate from main API)
if (appConfig.monitoring.enableMetrics) {
  app.get('/metrics', getMetrics);
}

// API documentation endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'pgai-connection-service',
    version: process.env.SERVICE_VERSION || '0.1.0',
    description: 'Connection Management Service for pgai platform',
    environment: appConfig.env,
    endpoints: {
      connections: {
        'GET /connections': 'List user connections',
        'POST /connections': 'Create new connection',
        'GET /connections/:id': 'Get connection details',
        'PUT /connections/:id': 'Update connection',
        'DELETE /connections/:id': 'Delete connection',
      },
      testing: {
        'POST /testing/connections/:id': 'Test specific connection',
        'POST /testing/batch': 'Batch test connections',
        'GET /testing/results/:id': 'Get test results',
      },
      monitoring: {
        'GET /monitoring/pools': 'Get pool statistics',
        'GET /monitoring/connections/:id/stats': 'Get connection stats',
        'GET /monitoring/health-checks': 'Get health check status',
      },
      system: {
        'GET /health': 'Health check',
        'GET /health/live': 'Liveness probe',
        'GET /health/ready': 'Readiness probe',
        'GET /metrics': 'Prometheus metrics',
      },
    },
    meta: {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      nodejs: process.version,
    },
  });
});

// 404 handler for undefined routes
app.use('*', notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', error, {
    stack: error.stack,
  });
  
  // Graceful shutdown
  process.exit(1);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection', reason, {
    promise: promise.toString(),
  });
  
  // Graceful shutdown
  process.exit(1);
});

export { app };