import express, { Router } from 'express';
import { ConnectionController } from '../controllers/connection.controller';
import { DatabaseService } from '../services/database.service';
import { ConnectionPoolService } from '../services/connection-pool.service';
import { authenticate, requireConnectionAccess } from '../middleware/auth.middleware';
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
let connectionController: ConnectionController;

// Lazy initialization of controller
const getController = (): ConnectionController => {
  if (!connectionController) {
    const services = getServices();
    connectionController = new ConnectionController(
      services.database as DatabaseService,
      services.connectionPool as ConnectionPoolService
    );
  }
  return connectionController;
};

/**
 * @route   GET /connections
 * @desc    List user's connections with optional filtering
 * @access  Private
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res, next) => {
    const controller = getController();
    return controller.listConnections(req, res, next);
  })
);

/**
 * @route   POST /connections
 * @desc    Create a new database connection
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  asyncHandler(async (req, res, next) => {
    const controller = getController();
    return controller.createConnection(req, res, next);
  })
);

/**
 * @route   GET /connections/:id
 * @desc    Get connection details by ID
 * @access  Private (connection owner)
 */
router.get(
  '/:id',
  authenticate,
  requireConnectionAccess,
  asyncHandler(async (req, res, next) => {
    const controller = getController();
    return controller.getConnection(req, res, next);
  })
);

/**
 * @route   PUT /connections/:id
 * @desc    Update connection by ID
 * @access  Private (connection owner)
 */
router.put(
  '/:id',
  authenticate,
  requireConnectionAccess,
  asyncHandler(async (req, res, next) => {
    const controller = getController();
    return controller.updateConnection(req, res, next);
  })
);

/**
 * @route   DELETE /connections/:id
 * @desc    Delete connection by ID
 * @access  Private (connection owner)
 */
router.delete(
  '/:id',
  authenticate,
  requireConnectionAccess,
  asyncHandler(async (req, res, next) => {
    const controller = getController();
    return controller.deleteConnection(req, res, next);
  })
);

export { router as connectionRoutes };