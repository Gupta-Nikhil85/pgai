import { app } from './app';
import { appConfig } from './config';
import { logger, createLogger } from './utils/logger';
import { DatabaseService } from './services/database.service';
import { ConnectionPoolService } from './services/connection-pool.service';
import { ConnectionTestingService } from './services/connection-testing.service';

const serviceLogger = createLogger('ConnectionService');

// Service instances
let databaseService: DatabaseService;
let poolService: ConnectionPoolService;
let testingService: ConnectionTestingService;

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
      // Shutdown services in reverse order of initialization
      if (testingService) {
        serviceLogger.info('Shutting down connection testing service...');
        await testingService.shutdown();
      }

      if (poolService) {
        serviceLogger.info('Shutting down connection pool service...');
        await poolService.shutdown();
      }

      if (databaseService) {
        serviceLogger.info('Shutting down database service...');
        await databaseService.close();
      }

      serviceLogger.info('All services shut down successfully');

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

// Initialize services
const initializeServices = async (): Promise<void> => {
  serviceLogger.info('Initializing services...');

  try {
    // Initialize database service
    databaseService = new DatabaseService();
    await databaseService.initialize();
    serviceLogger.info('Database service initialized');

    // Initialize connection pool service
    poolService = new ConnectionPoolService();
    serviceLogger.info('Connection pool service initialized');

    // Initialize connection testing service
    testingService = new ConnectionTestingService();
    serviceLogger.info('Connection testing service initialized');

    // Make services available globally for dependency injection
    (global as any).services = {
      database: databaseService,
      connectionPool: poolService,
      connectionTesting: testingService,
    };

    serviceLogger.info('All services initialized successfully');
  } catch (error) {
    serviceLogger.error('Failed to initialize services', error as Error);
    throw error;
  }
};

// Startup function
const startServer = async (): Promise<void> => {
  try {
    // Initialize services
    await initializeServices();

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
        database: {
          pool: {
            min: appConfig.database.pool.min,
            max: appConfig.database.pool.max,
          }
        },
        connections: {
          maxPerUser: appConfig.connections.maxPerUser,
          testTimeoutMs: appConfig.connections.testTimeoutMs,
        }
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

// Start the server
if (require.main === module) {
  startServer().catch((error) => {
    serviceLogger.error('Failed to start application', error);
    process.exit(1);
  });
}

export { app, startServer };