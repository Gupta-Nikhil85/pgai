import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { schemaRoutes, schemaService, setWebSocketService } from './routes/schema.routes';
import { WebSocketService } from './services/websocket.service';
import { metricsMiddleware, getMetrics } from './utils/metrics';
import { requestLogger } from './utils/logger';
import { appConfig } from './config';

// Create Express app
const app: Application = express();

// Create HTTP server
const server = createServer(app);

// Setup Socket.IO for real-time updates
const io = new SocketIOServer(server, {
  cors: {
    origin: appConfig.cors.origins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Create and setup WebSocket service (database service will be passed after route setup)
const websocketService = new WebSocketService(io);
setWebSocketService(websocketService);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: appConfig.cors.origins,
  credentials: appConfig.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Compression
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID middleware
app.use((req, res, next) => {
  req.requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const originalSend = res.send;
  
  res.send = function(body) {
    const duration = Date.now() - start;
    requestLogger.info(
      `${req.method} ${req.path} ${res.statusCode} ${duration}ms - ${req.requestId}`
    );
    return originalSend.call(this, body);
  };
  
  next();
});

// Metrics middleware
app.use(metricsMiddleware);

// Auth middleware (placeholder - would integrate with auth service)
app.use((req, res, next) => {
  // TODO: Integrate with authentication service
  // For now, add placeholder auth info
  req.auth = {
    userId: 'placeholder-user-id',
    teamId: 'placeholder-team-id',
  };
  next();
});

// Health check endpoint (before auth)
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      service: appConfig.service.name,
      version: appConfig.service.version,
      environment: appConfig.environment,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  });
});

// Metrics endpoint
app.get('/metrics', getMetrics);

// API routes
app.use('/schemas', schemaRoutes);

// WebSocket handling is now managed by WebSocketService

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found',
      path: req.originalUrl,
    },
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.requestId,
      version: appConfig.service.version,
    },
  });
});

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  
  const statusCode = error.statusCode || error.status || 500;
  const message = error.message || 'An unexpected error occurred';
  
  res.status(statusCode).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: statusCode === 500 ? 'An unexpected error occurred' : message,
      ...(appConfig.isDevelopment && { stack: error.stack }),
    },
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.requestId,
      version: appConfig.service.version,
    },
  });
});

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, starting graceful shutdown...');
  
  server.close(async () => {
    console.log('HTTP server closed');
    
    try {
      await Promise.all([
        schemaService.shutdown(),
        websocketService.shutdown(),
      ]);
      console.log('All services shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, starting graceful shutdown...');
  
  server.close(async () => {
    console.log('HTTP server closed');
    
    try {
      await Promise.all([
        schemaService.shutdown(),
        websocketService.shutdown(),
      ]);
      console.log('All services shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
});

export { app, server, io };