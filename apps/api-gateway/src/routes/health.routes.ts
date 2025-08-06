import express, { Router, Request, Response } from 'express';
import { SystemHealth, HealthCheckResult, ApiResponse } from '@pgai/types';
import { logger } from '../utils/logger';
import { gatewayConfig } from '../config';
import { proxyService } from '../services/proxy.service';
import { asyncHandler } from '../middleware/error.middleware';

const router: express.Router = Router();

/**
 * @route   GET /health
 * @desc    Comprehensive health check endpoint
 * @access  Public
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Check gateway health
    const gatewayHealth: HealthCheckResult = {
      status: 'healthy',
      message: 'API Gateway is running',
      details: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: gatewayConfig.api.version,
        environment: gatewayConfig.env,
        nodeVersion: process.version,
      },
      timestamp: new Date().toISOString(),
    };

    // Check all registered services
    const servicesHealth = await proxyService.getAllServicesHealth();
    
    // Build health checks object
    const checks: Record<string, HealthCheckResult> = {
      gateway: gatewayHealth,
    };

    // Add service health checks
    Object.entries(servicesHealth).forEach(([serviceName, health]) => {
      checks[serviceName] = {
        status: health.status as 'healthy' | 'unhealthy',
        message: health.status === 'healthy' 
          ? `${serviceName} is healthy` 
          : `${serviceName} is unhealthy`,
        details: health.details,
        timestamp: new Date().toISOString(),
      };
    });

    // Determine overall health
    const overallStatus = Object.values(checks).every(check => check.status === 'healthy')
      ? 'healthy'
      : 'unhealthy';

    const systemHealth: SystemHealth = {
      status: overallStatus,
      checks,
      uptime: process.uptime(),
      version: gatewayConfig.api.version,
    };

    const response: ApiResponse<SystemHealth> = {
      success: true,
      data: systemHealth,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId || 'unknown',
        version: gatewayConfig.api.version,
      },
    };

    const statusCode = overallStatus === 'healthy' ? 200 : 503;
    const duration = Date.now() - startTime;

    logger.info('Health check completed', {
      status: overallStatus,
      duration,
      checks: Object.keys(checks),
      requestId: req.requestId,
    });

    res.status(statusCode).json(response);
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Health check failed', error as Error, {
      duration,
      requestId: req.requestId,
    });

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: 'Health check failed',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId || 'unknown',
        version: gatewayConfig.api.version,
      },
    };

    res.status(503).json(response);
  }
}));

/**
 * @route   GET /health/live
 * @desc    Kubernetes liveness probe
 * @access  Public
 */
router.get('/live', (req: Request, res: Response) => {
  // Simple liveness check - if the gateway can respond, it's alive
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    version: gatewayConfig.api.version,
  });
});

/**
 * @route   GET /health/ready
 * @desc    Kubernetes readiness probe
 * @access  Public
 */
router.get('/ready', asyncHandler(async (req: Request, res: Response) => {
  try {
    // Check if critical services are available
    const criticalServices = ['user-service']; // Add other critical services as needed
    
    const healthChecks = await Promise.allSettled(
      criticalServices.map(serviceName => proxyService.getServiceHealth(serviceName))
    );

    const allCriticalServicesHealthy = healthChecks.every(check => 
      check.status === 'fulfilled' && check.value.status === 'healthy'
    );

    if (allCriticalServicesHealthy) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        version: gatewayConfig.api.version,
        criticalServices,
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        reason: 'Critical services not available',
        timestamp: new Date().toISOString(),
        version: gatewayConfig.api.version,
        criticalServices,
      });
    }
  } catch (error) {
    logger.error('Readiness check failed', error as Error, {
      requestId: req.requestId,
    });
    
    res.status(503).json({
      status: 'not_ready',
      reason: 'Readiness check failed',
      timestamp: new Date().toISOString(),
      version: gatewayConfig.api.version,
    });
  }
}));

/**
 * @route   GET /health/services
 * @desc    Detailed health check for all services
 * @access  Public (or could be restricted to admin)
 */
router.get('/services', asyncHandler(async (req: Request, res: Response) => {
  try {
    const servicesHealth = await proxyService.getAllServicesHealth();
    
    const response: ApiResponse = {
      success: true,
      data: {
        services: servicesHealth,
        totalServices: Object.keys(servicesHealth).length,
        healthyServices: Object.values(servicesHealth).filter(h => h.status === 'healthy').length,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId || 'unknown',
        version: gatewayConfig.api.version,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Services health check failed', error as Error, {
      requestId: req.requestId,
    });

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'SERVICES_HEALTH_CHECK_FAILED',
        message: 'Failed to check services health',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId || 'unknown',
        version: gatewayConfig.api.version,
      },
    };

    res.status(500).json(response);
  }
}));

/**
 * @route   GET /health/metrics
 * @desc    Health metrics endpoint
 * @access  Public
 */
router.get('/metrics', (req: Request, res: Response) => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  const metrics = {
    uptime: process.uptime(),
    memory: {
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      usage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
    },
    process: {
      pid: process.pid,
      version: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    gateway: {
      version: gatewayConfig.api.version,
      environment: gatewayConfig.env,
      startTime: new Date(Date.now() - (process.uptime() * 1000)).toISOString(),
    },
  };

  const response: ApiResponse = {
    success: true,
    data: metrics,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.requestId || 'unknown',
      version: gatewayConfig.api.version,
    },
  };

  res.status(200).json(response);
});

export { router as healthRoutes };