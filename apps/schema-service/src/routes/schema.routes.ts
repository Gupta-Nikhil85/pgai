import { Router, IRouter } from 'express';
import { SchemaController } from '../controllers/schema.controller';
import { SchemaService } from '../services/schema.service';
import { WebSocketService } from '../services/websocket.service';

// WebSocket service will be injected from app.ts
let websocketService: WebSocketService | undefined;

// Create service and controller instances
const schemaService = new SchemaService(websocketService);
const schemaController = new SchemaController(schemaService);

const router: IRouter = Router();

/**
 * POST /discover
 * Discover database schema for a connection
 */
router.post('/discover', (req, res) => schemaController.discoverSchema(req, res));

/**
 * POST /search
 * Search schema objects by query
 */
router.post('/search', (req, res) => schemaController.searchSchema(req, res));

/**
 * GET /connections/:connectionId
 * Get cached schema for a connection
 */
router.get('/connections/:connectionId', (req, res) => schemaController.getSchema(req, res));

/**
 * DELETE /cache/:connectionId
 * Invalidate cached schema for a connection
 */
router.delete('/cache/:connectionId', (req, res) => schemaController.invalidateCache(req, res));

/**
 * GET /health
 * Get schema service health status
 */
router.get('/health', (req, res) => schemaController.getHealth(req, res));

/**
 * GET /stats
 * Get schema service statistics
 */
router.get('/stats', (req, res) => schemaController.getStats(req, res));

/**
 * POST /changes/start/:connectionId
 * Start change detection for a connection
 */
router.post('/changes/start/:connectionId', (req, res) => schemaController.startChangeDetection(req, res));

/**
 * POST /changes/stop/:connectionId
 * Stop change detection for a connection
 */
router.post('/changes/stop/:connectionId', (req, res) => schemaController.stopChangeDetection(req, res));

/**
 * GET /changes/status
 * Get change detection status for all connections
 */
router.get('/changes/status', (req, res) => schemaController.getChangeDetectionStatus(req, res));

/**
 * POST /changes/trigger/:connectionId
 * Manually trigger change detection for a connection
 */
router.post('/changes/trigger/:connectionId', (req, res) => schemaController.triggerChangeDetection(req, res));

/**
 * GET /websocket/stats
 * Get WebSocket connection statistics
 */
router.get('/websocket/stats', (req, res) => schemaController.getWebSocketStats(req, res));

/**
 * GET /history/:connectionId
 * Get schema history for a connection
 */
router.get('/history/:connectionId', (req, res) => schemaController.getSchemaHistory(req, res));

/**
 * GET /changes/:connectionId
 * Get schema changes for a connection
 */
router.get('/changes/:connectionId', (req, res) => schemaController.getConnectionChanges(req, res));

/**
 * POST /changes/:changeId/review
 * Mark a schema change as reviewed
 */
router.post('/changes/:changeId/review', (req, res) => schemaController.reviewSchemaChange(req, res));

/**
 * GET /analytics/changes/:connectionId
 * Get schema change analytics for a connection
 */
router.get('/analytics/changes/:connectionId', (req, res) => schemaController.getSchemaChangeAnalytics(req, res));

// Function to inject WebSocket service
export const setWebSocketService = (ws: WebSocketService) => {
  websocketService = ws;
};

export { router as schemaRoutes, schemaService };