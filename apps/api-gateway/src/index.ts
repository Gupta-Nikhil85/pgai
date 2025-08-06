import { app } from './app';
import { gatewayConfig } from './config';
import { logger, logStartupConfig } from './utils/logger';

// Server instance
let server: any;

// Graceful shutdown handler
const gracefulShutdown = async (signal: string): Promise<void> => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // Close server
  server.close(async (error: Error | null) => {
    if (error) {
      logger.error('Error during server shutdown', error);
      process.exit(1);
    }

    logger.info('HTTP server closed');

    try {
      // Additional cleanup can be added here
      // - Close database connections
      // - Close Redis connections
      // - Flush metrics
      // - Clean up resources
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', error as Error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 30000);
};

// Startup function
const startServer = async (): Promise<void> => {
  try {
    // Log startup configuration
    logStartupConfig();

    // Start HTTP server
    server = app.listen(gatewayConfig.port, gatewayConfig.host, () => {
      logger.info('API Gateway started successfully', {
        port: gatewayConfig.port,
        host: gatewayConfig.host,
        environment: gatewayConfig.env,
        nodeVersion: process.version,
        processId: process.pid,
        title: gatewayConfig.api.title,
        version: gatewayConfig.api.version,
      });

      // Log service configuration
      logger.info('Gateway configuration', {
        cors: gatewayConfig.cors.enabled,
        metrics: gatewayConfig.monitoring.enableMetrics,
        rateLimit: `${gatewayConfig.security.rateLimit.maxRequests} requests per ${gatewayConfig.security.rateLimit.windowMs}ms`,
        requestTimeout: `${gatewayConfig.request.timeoutMs}ms`,
        maxRequestSize: gatewayConfig.request.maxSize,
        helmet: gatewayConfig.security.helmet.enabled,
        trustProxy: gatewayConfig.security.trustProxy,
      });

      // Log registered services
      const registeredServices = Object.entries(gatewayConfig.services)
        .filter(([, config]) => config.url)
        .map(([name, config]) => `${name}: ${config.url}`);
      
      if (registeredServices.length > 0) {
        logger.info('Registered backend services', {
          services: registeredServices,
          totalServices: registeredServices.length,
        });
      } else {
        logger.warn('No backend services registered - running in standalone mode');
      }

      // Health check reminder
      logger.info('Health check endpoints available', {
        comprehensive: '/health',
        liveness: '/health/live',
        readiness: '/health/ready',
        services: '/health/services',
        metrics: gatewayConfig.monitoring.enableMetrics ? '/metrics' : 'disabled',
      });
    });

    // Set server timeout
    server.timeout = gatewayConfig.request.timeoutMs + 5000; // Add 5s buffer

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${gatewayConfig.port} is already in use`);
      } else if (error.code === 'EACCES') {
        logger.error(`Permission denied to bind to port ${gatewayConfig.port}`);
      } else {
        logger.error('Server error', error);
      }
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start API Gateway', error as Error);
    process.exit(1);
  }
};

// Handle startup errors
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception during startup', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Rejection during startup', reason);
  process.exit(1);
});

// Start the server if this file is run directly
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Failed to start application', error);
    process.exit(1);
  });
}

export { app, startServer };