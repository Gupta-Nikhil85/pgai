import { app } from './app';
import { appConfig } from './config';
import { logger, createLogger } from './utils/logger';
import { databaseService } from './services/database';

const serviceLogger = createLogger('UserService');

// Server instance
let server: any;

// Graceful shutdown handler
const gracefulShutdown = async (signal: string): Promise<void> => {
  serviceLogger.info(`Received ${signal}, starting graceful shutdown...`);

  // Close server
  server.close(async (error: Error | null) => {
    if (error) {
      serviceLogger.error('Error during server shutdown', error);
      process.exit(1);
    }

    serviceLogger.info('HTTP server closed');

    try {
      // Disconnect from database
      await databaseService.gracefulShutdown();
      serviceLogger.info('Database connection closed');

      // Additional cleanup can be added here
      serviceLogger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      serviceLogger.error('Error during graceful shutdown', error as Error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    serviceLogger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 30000);
};

// Startup function
const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    serviceLogger.info('Connecting to database...');
    await databaseService.connect();
    serviceLogger.info('Database connected successfully');

    // Start HTTP server
    server = app.listen(appConfig.port, appConfig.host, () => {
      serviceLogger.info('Server started successfully', {
        port: appConfig.port,
        host: appConfig.host,
        environment: appConfig.env,
        nodeVersion: process.version,
        processId: process.pid,
      });

      // Log service configuration
      serviceLogger.info('Service configuration', {
        cors: appConfig.cors.enabled,
        metrics: appConfig.monitoring.enableMetrics,
        rateLimit: `${appConfig.security.rateLimit.maxRequests} requests per ${appConfig.security.rateLimit.windowMs}ms`,
        jwtExpiresIn: appConfig.jwt.expiresIn,
      });
    });

    // Set server timeout
    server.timeout = 30000; // 30 seconds

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        serviceLogger.error(`Port ${appConfig.port} is already in use`);
      } else {
        serviceLogger.error('Server error', error);
      }
      process.exit(1);
    });

    // Server is already available through module scope

  } catch (error) {
    serviceLogger.error('Failed to start server', error as Error);
    process.exit(1);
  }
};

// Handle startup errors
process.on('uncaughtException', (error: Error) => {
  serviceLogger.error('Uncaught Exception during startup', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  serviceLogger.error('Unhandled Rejection during startup', reason);
  process.exit(1);
});

// Server variable is declared at module scope

// Start the server
if (require.main === module) {
  startServer().catch((error) => {
    serviceLogger.error('Failed to start application', error);
    process.exit(1);
  });
}

export { app, startServer };