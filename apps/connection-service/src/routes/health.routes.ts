import express, { Router, Request, Response } from 'express';
import { ApiResponse } from '../types/api.types';
import { DatabaseService } from '../services/database.service';
import { ConnectionPoolService } from '../services/connection-pool.service';
import { ConnectionTestingService } from '../services/connection-testing.service';
import { createLogger } from '../utils/logger';
import { appConfig } from '../config';

const logger = createLogger('HealthRoutes');
const router: Router = express.Router();

// Get services from global registry
const getServices = () => {
  const services = (global as any).services;
  return services;
};

/**
 * @route   GET /health
 * @desc    Basic health check endpoint
 * @access  Public
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const services = getServices();
    
    // Basic health checks
    const healthChecks = {
      database: false,
      redis: false,
      services: false,
    };

    let status = 'healthy';
    const details: any = {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      environment: appConfig.env,
      node_version: process.version,
      memory: process.memoryUsage(),
    };

    // Check database connection
    if (services?.database) {
      try {
        healthChecks.database = await (services.database as DatabaseService).healthCheck();
        details.database = { status: healthChecks.database ? 'connected' : 'disconnected' };
      } catch (error) {
        healthChecks.database = false;
        details.database = { status: 'error', error: (error as Error).message };
      }
    }

    // Check services availability
    healthChecks.services = !!(services?.database && services?.connectionPool && services?.connectionTesting);
    details.services = {
      database: !!services?.database,
      connection_pool: !!services?.connectionPool,
      connection_testing: !!services?.connectionTesting,
    };

    // Set overall status
    if (!healthChecks.database || !healthChecks.services) {
      status = 'unhealthy';
    }

    const response: ApiResponse = {
      success: status === 'healthy',
      data: {
        status,
        checks: healthChecks,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.get('x-request-id') || 'unknown',
        version: '0.1.0',
      },
    };

    const statusCode = status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(response);
  } catch (error) {
    logger.error('Health check failed', error);
    
    const response: ApiResponse = {
      success: false,
      data: {
        status: 'error',
        error: (error as Error).message,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.get('x-request-id') || 'unknown',
        version: '0.1.0',
      },
    };

    res.status(500).json(response);
  }
});

/**
 * @route   GET /health/live
 * @desc    Kubernetes liveness probe endpoint
 * @access  Public
 */
router.get('/live', (req: Request, res: Response) => {
  try {
    // Simple liveness check - if process is running and can respond
    const response: ApiResponse = {
      success: true,
      data: {
        status: 'alive',
        uptime: process.uptime(),
        pid: process.pid,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.get('x-request-id') || 'unknown',
        version: '0.1.0',
      },
    };

    res.json(response);
  } catch (error) {
    logger.error('Liveness check failed', error);
    res.status(500).json({
      success: false,
      data: { status: 'dead' },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.get('x-request-id') || 'unknown',
        version: '0.1.0',
      },
    });
  }
});

/**
 * @route   GET /health/ready
 * @desc    Kubernetes readiness probe endpoint
 * @access  Public
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const services = getServices();
    
    // Check if all critical services are ready
    let ready = true;
    const checks: any = {};

    // Database readiness
    if (services?.database) {
      try {
        checks.database = await (services.database as DatabaseService).healthCheck();
        ready = ready && checks.database;
      } catch (error) {
        checks.database = false;
        ready = false;
      }
    } else {
      checks.database = false;
      ready = false;
    }

    // Services initialization
    checks.services_initialized = !!(services?.database && services?.connectionPool && services?.connectionTesting);
    ready = ready && checks.services_initialized;

    // Connection pool readiness
    if (services?.connectionPool) {
      try {
        const poolHealth = await (services.connectionPool as ConnectionPoolService).healthCheck();
        checks.connection_pool = poolHealth.healthy > 0 || poolHealth.total === 0; // Ready if pools are healthy or no pools exist
      } catch (error) {
        checks.connection_pool = false;
        ready = false;
      }
    } else {
      checks.connection_pool = false;
      ready = false;
    }

    const response: ApiResponse = {
      success: ready,
      data: {
        status: ready ? 'ready' : 'not_ready',
        checks,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.get('x-request-id') || 'unknown',
        version: '0.1.0',
      },
    };

    const statusCode = ready ? 200 : 503;
    res.status(statusCode).json(response);
  } catch (error) {
    logger.error('Readiness check failed', error);
    
    const response: ApiResponse = {
      success: false,
      data: {
        status: 'error',
        error: (error as Error).message,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.get('x-request-id') || 'unknown',
        version: '0.1.0',
      },
    };

    res.status(500).json(response);
  }
});

/**
 * @route   GET /health/detailed
 * @desc    Detailed health check with all service components
 * @access  Public
 */
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const services = getServices();
    const startTime = Date.now();

    const healthData: any = {
      overall_status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '0.1.0',
      environment: appConfig.env,
      checks: {},
      performance: {},
      configuration: {
        max_connections_per_user: appConfig.connections.maxPerUser,
        connection_test_timeout: appConfig.connections.testTimeoutMs,
        pool_settings: {
          global_max: appConfig.connections.globalPool.maxSize,
          global_min: appConfig.connections.globalPool.minSize,
        },
      },
    };

    // Database health
    if (services?.database) {
      const dbStart = Date.now();
      try {
        healthData.checks.database = {
          status: await (services.database as DatabaseService).healthCheck() ? 'healthy' : 'unhealthy',
          response_time_ms: Date.now() - dbStart,
        };
      } catch (error) {
        healthData.checks.database = {
          status: 'error',
          error: (error as Error).message,
          response_time_ms: Date.now() - dbStart,
        };
        healthData.overall_status = 'unhealthy';
      }
    } else {
      healthData.checks.database = { status: 'not_initialized' };
      healthData.overall_status = 'unhealthy';
    }

    // Connection pool health
    if (services?.connectionPool) {
      const poolStart = Date.now();
      try {
        const poolHealth = await (services.connectionPool as ConnectionPoolService).healthCheck();
        healthData.checks.connection_pool = {
          status: poolHealth.healthy === poolHealth.total ? 'healthy' : 'degraded',
          total_pools: poolHealth.total,
          healthy_pools: poolHealth.healthy,
          unhealthy_pools: poolHealth.total - poolHealth.healthy,
          response_time_ms: Date.now() - poolStart,
          details: poolHealth.details,
        };

        if (poolHealth.healthy < poolHealth.total) {
          healthData.overall_status = 'degraded';
        }
      } catch (error) {
        healthData.checks.connection_pool = {
          status: 'error',
          error: (error as Error).message,
          response_time_ms: Date.now() - poolStart,
        };
        healthData.overall_status = 'unhealthy';
      }
    } else {
      healthData.checks.connection_pool = { status: 'not_initialized' };
      healthData.overall_status = 'unhealthy';
    }

    // Memory and performance metrics
    const memUsage = process.memoryUsage();
    healthData.performance = {
      memory: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heap_used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heap_total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
      },
      cpu: process.cpuUsage(),
      health_check_duration_ms: Date.now() - startTime,
    };

    const response: ApiResponse = {
      success: healthData.overall_status !== 'unhealthy',
      data: healthData,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.get('x-request-id') || 'unknown',
        version: '0.1.0',
      },
    };

    const statusCode = healthData.overall_status === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json(response);
  } catch (error) {
    logger.error('Detailed health check failed', error);
    
    const response: ApiResponse = {
      success: false,
      data: {
        overall_status: 'error',
        error: (error as Error).message,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.get('x-request-id') || 'unknown',
        version: '0.1.0',
      },
    };

    res.status(500).json(response);
  }
});

export { router as healthRoutes };