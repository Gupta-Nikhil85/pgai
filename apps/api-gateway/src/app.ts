import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import 'express-async-errors'; // Automatically catch async errors

import { gatewayConfig } from './config';
import { requestLogger, logger } from './utils/logger';
import { 
  errorHandler, 
  notFoundHandler, 
  timeoutHandler,
  validationErrorHandler 
} from './middleware/error.middleware';
import {
  requestIdMiddleware,
  securityHeadersMiddleware,
  requestSizeLimiter,
  allowedMethodsMiddleware,
  contentTypeValidation,
  securityLoggingMiddleware,
  publicRateLimiter
} from './middleware/security.middleware';
import { metricsMiddleware, getMetrics } from './utils/metrics';

// Route imports
import { healthRoutes } from './routes/health.routes';
import { apiRoutes } from './routes/api.routes';

// Create Express application
const app: express.Express = express();

// ==========================================
// Trust Proxy Configuration
// ==========================================
if (gatewayConfig.security.trustProxy) {
  app.set('trust proxy', 1);
}

// ==========================================
// Security Middleware
// ==========================================

// Security headers
app.use(securityHeadersMiddleware);

// Helmet for additional security headers
if (gatewayConfig.security.helmet.enabled) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },
  }));
}

// Request ID and timing
app.use(requestIdMiddleware);

// Request timeout
app.use(timeoutHandler(gatewayConfig.request.timeoutMs));

// ==========================================
// CORS Configuration
// ==========================================
if (gatewayConfig.cors.enabled) {
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      // Allow all origins in development
      if (gatewayConfig.isDevelopment) {
        return callback(null, true);
      }
      
      // Check allowed origins
      const allowedOrigins = gatewayConfig.cors.origin === '*' 
        ? [origin] 
        : gatewayConfig.cors.origin.split(',').map(o => o.trim());
      
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        logger.warn('CORS origin not allowed', { origin, allowedOrigins });
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'x-request-id', 
      'x-trace-id',
      'x-api-key',
      'user-agent'
    ],
    exposedHeaders: [
      'x-request-id',
      'x-gateway-version',
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset'
    ],
    credentials: true,
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 200,
  }));
}

// ==========================================
// Request Processing Middleware
// ==========================================

// Compression
app.use(compression());

// Request size limiting
app.use(requestSizeLimiter(gatewayConfig.request.maxSize));

// Method validation
app.use(allowedMethodsMiddleware());

// Content-Type validation
app.use(contentTypeValidation());

// Body parsing middleware
app.use(express.json({ 
  limit: gatewayConfig.request.maxSize,
  type: ['application/json', 'application/json; charset=utf-8']
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: gatewayConfig.request.maxSize 
}));

// ==========================================
// Logging Middleware
// ==========================================

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => {
      requestLogger.info(message.trim());
    }
  },
  skip: (req) => {
    // Skip logging for health checks in production
    return gatewayConfig.isProduction && req.path.startsWith('/health');
  }
}));

// Security logging
app.use(securityLoggingMiddleware);

// ==========================================
// Metrics and Monitoring
// ==========================================

// Metrics collection
app.use(metricsMiddleware);

// ==========================================
// Rate Limiting
// ==========================================

// Global rate limiting
app.use(publicRateLimiter);

// ==========================================
// API Routes
// ==========================================

// Health check routes (no auth required)
app.use('/health', healthRoutes);

// Main API routes
app.use('/api/v1', apiRoutes);

// Metrics endpoint (separate from main API)
if (gatewayConfig.monitoring.enableMetrics) {
  app.get('/metrics', getMetrics);
}

// ==========================================
// API Documentation Root
// ==========================================

// Root endpoint with API information
app.get('/', (req, res) => {
  res.json({
    service: gatewayConfig.api.title,
    version: gatewayConfig.api.version,
    description: gatewayConfig.api.description,
    environment: gatewayConfig.env,
    timestamp: new Date().toISOString(),
    endpoints: {
      health: {
        'GET /health': 'Comprehensive health check',
        'GET /health/live': 'Liveness probe',
        'GET /health/ready': 'Readiness probe',
        'GET /health/services': 'Services health status',
        'GET /health/metrics': 'System metrics',
      },
      authentication: {
        'POST /api/v1/auth/register': 'User registration',
        'POST /api/v1/auth/login': 'User authentication',
        'POST /api/v1/auth/refresh': 'Token refresh',
        'POST /api/v1/auth/logout': 'User logout',
      },
      users: {
        'GET /api/v1/users/profile': 'Get user profile',
        'PUT /api/v1/users/profile': 'Update user profile',
        'PUT /api/v1/users/change-password': 'Change password',
        'DELETE /api/v1/users/account': 'Delete account',
      },
      connections: {
        'GET /api/v1/connections': 'List database connections',
        'POST /api/v1/connections': 'Create database connection',
        'GET /api/v1/connections/:id': 'Get connection details',
        'PUT /api/v1/connections/:id': 'Update connection',
        'DELETE /api/v1/connections/:id': 'Delete connection',
      },
      schemas: {
        'GET /api/v1/schemas': 'List database schemas',
        'POST /api/v1/schemas': 'Create schema',
        'GET /api/v1/schemas/:id': 'Get schema details',
        'PUT /api/v1/schemas/:id': 'Update schema',
        'DELETE /api/v1/schemas/:id': 'Delete schema',
      },
      views: {
        'GET /api/v1/views': 'List database views',
        'POST /api/v1/views': 'Create view',
        'GET /api/v1/views/:id': 'Get view details',
        'PUT /api/v1/views/:id': 'Update view',
        'DELETE /api/v1/views/:id': 'Delete view',
      },
      system: {
        'GET /metrics': 'Prometheus metrics',
      },
    },
    meta: {
      requestId: req.requestId || 'unknown',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      nodejs: process.version,
      gateway: {
        cors: gatewayConfig.cors.enabled,
        rateLimit: `${gatewayConfig.security.rateLimit.maxRequests} requests per ${gatewayConfig.security.rateLimit.windowMs}ms`,
        requestTimeout: `${gatewayConfig.request.timeoutMs}ms`,
        maxRequestSize: gatewayConfig.request.maxSize,
      },
    },
  });
});

// ==========================================
// Error Handling
// ==========================================

// Validation error handler (for OpenAPI validator)
app.use(validationErrorHandler);

// 404 handler for undefined routes
app.use('*', notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// ==========================================
// Graceful Shutdown Handlers
// ==========================================

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