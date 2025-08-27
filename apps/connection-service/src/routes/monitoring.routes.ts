import express, { Router } from 'express';
import { MonitoringController } from '../controllers/monitoring.controller';
import { DatabaseService } from '../services/database.service';
import { ConnectionPoolService } from '../services/connection-pool.service';
import { authenticate, authorize, requireConnectionAccess } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';

// Get services from global registry
const getServices = () => {
  const services = (global as any).services;
  if (!services) {
    throw new Error('Services not initialized');
  }
  return services;
};

// Create router
const router: Router = express.Router();

// Initialize controller with services
let monitoringController: MonitoringController;

// Lazy initialization of controller
const getController = (): MonitoringController => {
  if (!monitoringController) {
    const services = getServices();
    monitoringController = new MonitoringController(
      services.database as DatabaseService,
      services.connectionPool as ConnectionPoolService
    );
  }
  return monitoringController;
};

/**
 * @route   GET /monitoring/pools
 * @desc    Get all connection pool statistics for user
 * @access  Private
 */
router.get(
  '/pools',
  authenticate,
  asyncHandler(async (req, res, next) => {
    const controller = getController();
    return controller.getPoolStats(req, res, next);
  })
);

/**
 * @route   GET /monitoring/connections/:id/stats
 * @desc    Get statistics for a specific connection
 * @access  Private (connection owner)
 */
router.get(
  '/connections/:id/stats',
  authenticate,
  requireConnectionAccess,
  asyncHandler(async (req, res, next) => {
    const controller = getController();
    return controller.getConnectionStats(req, res, next);
  })
);

/**
 * @route   GET /monitoring/health-checks
 * @desc    Get health check status for user's connections
 * @access  Private
 */
router.get(
  '/health-checks',
  authenticate,
  asyncHandler(async (req, res, next) => {
    const controller = getController();
    return controller.getHealthChecks(req, res, next);
  })
);

/**
 * @route   GET /monitoring/service/stats
 * @desc    Get overall service statistics (admin only)
 * @access  Private (admin/owner only)
 */
router.get(
  '/service/stats',
  authenticate,
  authorize('service.monitor'),
  asyncHandler(async (req, res, next) => {
    const controller = getController();
    return controller.getServiceStats(req, res, next);
  })
);

export { router as monitoringRoutes };