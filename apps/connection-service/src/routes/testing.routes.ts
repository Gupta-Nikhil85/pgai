import express, { Router } from 'express';
import { TestingController } from '../controllers/testing.controller';
import { DatabaseService } from '../services/database.service';
import { ConnectionTestingService } from '../services/connection-testing.service';
import { authenticate, requireConnectionAccess, optionalAuth } from '../middleware/auth.middleware';
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
let testingController: TestingController;

// Lazy initialization of controller
const getController = (): TestingController => {
  if (!testingController) {
    const services = getServices();
    testingController = new TestingController(
      services.database as DatabaseService,
      services.connectionTesting as ConnectionTestingService
    );
  }
  return testingController;
};

/**
 * @route   POST /testing/connections/:id
 * @desc    Test a specific connection by ID
 * @access  Private (connection owner)
 */
router.post(
  '/connections/:id',
  authenticate,
  requireConnectionAccess,
  asyncHandler(async (req, res, next) => {
    const controller = getController();
    return controller.testConnectionById(req, res, next);
  })
);

/**
 * @route   POST /testing/connections
 * @desc    Test a connection using provided configuration (without saving)
 * @access  Private
 */
router.post(
  '/connections',
  authenticate,
  asyncHandler(async (req, res, next) => {
    const controller = getController();
    return controller.testConnectionConfig(req, res, next);
  })
);

/**
 * @route   POST /testing/batch
 * @desc    Test multiple connections in batch
 * @access  Private
 */
router.post(
  '/batch',
  authenticate,
  asyncHandler(async (req, res, next) => {
    const controller = getController();
    return controller.batchTestConnections(req, res, next);
  })
);

/**
 * @route   POST /testing/ssh-tunnel
 * @desc    Test connection with SSH tunnel
 * @access  Private
 */
router.post(
  '/ssh-tunnel',
  authenticate,
  asyncHandler(async (req, res, next) => {
    const controller = getController();
    return controller.testConnectionWithSSH(req, res, next);
  })
);

/**
 * @route   GET /testing/results/:connectionId
 * @desc    Get cached test results for a connection
 * @access  Private (connection owner)
 */
router.get(
  '/results/:connectionId',
  authenticate,
  asyncHandler(async (req, res, next) => {
    // Map connectionId to id for the middleware
    req.params.id = req.params.connectionId;
    return requireConnectionAccess(req, res, async () => {
      const controller = getController();
      return controller.getTestResults(req, res, next);
    });
  })
);

/**
 * @route   GET /testing/health
 * @desc    Get connection testing service health
 * @access  Public (with optional auth)
 */
router.get(
  '/health',
  optionalAuth,
  asyncHandler(async (req, res, next) => {
    const controller = getController();
    return controller.getTestingHealth(req, res, next);
  })
);

export { router as testingRoutes };