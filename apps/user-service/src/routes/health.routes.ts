import express, { Router, Request, Response } from 'express';
import { databaseService } from '../services/database';
import { SystemHealth, HealthCheckResult, ApiResponse } from '@pgai/types';
import { createLogger } from '../utils/logger';

const router: express.Router = Router();
const logger = createLogger('HealthRoutes');

/**
 * @route   GET /health
 * @desc    Health check endpoint
 * @access  Public
 */
router.get('/', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Check database connection
    const dbHealth = await databaseService.healthCheck();
    
    // Check service dependencies
    const checks: Record<string, HealthCheckResult> = {
      database: {
        status: dbHealth.status,
        message: dbHealth.status === 'healthy' ? 'Database connection successful' : 'Database connection failed',
        details: dbHealth.details,
        timestamp: new Date().toISOString(),
      },
      service: {
        status: 'healthy',
        message: 'User service is running',
        details: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: process.env.SERVICE_VERSION || '0.1.0',
        },
        timestamp: new Date().toISOString(),
      },
    };

    // Determine overall health
    const overallStatus = Object.values(checks).every(check => check.status === 'healthy')
      ? 'healthy'
      : 'unhealthy';

    const health: SystemHealth = {
      status: overallStatus,
      checks,
      uptime: process.uptime(),
      version: process.env.SERVICE_VERSION || '0.1.0',
    };

    const response: ApiResponse<SystemHealth> = {
      success: true,
      data: health,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.get('x-request-id') || 'unknown',
        version: '0.1.0',
      },
    };

    const statusCode = overallStatus === 'healthy' ? 200 : 503;
    const duration = Date.now() - startTime;

    logger.info('Health check completed', {
      status: overallStatus,
      duration,
      checks: Object.keys(checks),
    });

    res.status(statusCode).json(response);
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Health check failed', error as Error, {
      duration,
    });

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: 'Health check failed',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.get('x-request-id') || 'unknown',
        version: '0.1.0',
      },
    };

    res.status(503).json(response);
  }
});

/**
 * @route   GET /health/live
 * @desc    Kubernetes liveness probe
 * @access  Public
 */
router.get('/live', (req: Request, res: Response) => {
  // Simple liveness check - if the service can respond, it's alive
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

/**
 * @route   GET /health/ready
 * @desc    Kubernetes readiness probe
 * @access  Public
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Check if service is ready to serve requests
    const dbHealth = await databaseService.healthCheck();
    
    if (dbHealth.status === 'healthy') {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        reason: 'Database not available',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error('Readiness check failed', error as Error);
    
    res.status(503).json({
      status: 'not_ready',
      reason: 'Service dependencies not available',
      timestamp: new Date().toISOString(),
    });
  }
});

export { router as healthRoutes };