import { server } from './app';
import { schemaService } from './routes/schema.routes';
import { appConfig } from './config';
import { logger } from './utils/logger';

async function startServer() {
  try {
    // Initialize schema service
    logger.info('Initializing Schema Discovery Service...');
    await schemaService.initialize();
    
    // Start the server
    server.listen(appConfig.server.port, appConfig.server.host, () => {
      logger.info('Schema Discovery Service started successfully', {
        host: appConfig.server.host,
        port: appConfig.server.port,
        environment: appConfig.environment,
        version: appConfig.service.version,
        nodeVersion: process.version,
        pid: process.pid,
      });
      
      // Log service configuration
      logger.info('Service configuration', {
        redis: {
          host: appConfig.redis.host,
          port: appConfig.redis.port,
          db: appConfig.redis.db,
        },
        cache: {
          ttlSeconds: appConfig.schemaConfig.cache_config.ttl_seconds,
          maxEntries: appConfig.schemaConfig.cache_config.max_entries,
          compressionEnabled: appConfig.schemaConfig.cache_config.enable_compression,
        },
        monitoring: {
          enableMetrics: appConfig.monitoring.enableMetrics,
          enableTracing: appConfig.monitoring.enableTracing,
        },
      });
    });
    
    server.on('error', (error: any) => {
      if (error.syscall !== 'listen') {
        throw error;
      }
      
      const bind = typeof appConfig.server.port === 'string'
        ? 'Pipe ' + appConfig.server.port
        : 'Port ' + appConfig.server.port;
      
      switch (error.code) {
        case 'EACCES':
          logger.error(`${bind} requires elevated privileges`, error);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          logger.error(`${bind} is already in use`, error);
          process.exit(1);
          break;
        default:
          throw error;
      }
    });
    
  } catch (error) {
    logger.error('Failed to start Schema Discovery Service', error as Error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', error, { fatal: true });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection', reason instanceof Error ? reason : new Error(String(reason)), {
    promise: promise.toString(),
  });
  process.exit(1);
});

// Start the server
startServer();