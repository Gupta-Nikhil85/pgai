import { Request, Response } from 'express';
import Joi from 'joi';
import { SchemaService } from '../services/schema.service';
import { 
  SchemaDiscoveryRequest, 
  SchemaSearchRequest,
} from '../types/schema.types';
import { createLogger } from '../utils/logger';

const logger = createLogger('SchemaController');

// Validation schemas
const discoveryRequestSchema = Joi.object({
  connection_id: Joi.string().uuid().required(),
  force_refresh: Joi.boolean().default(false),
  include_system_schemas: Joi.boolean().default(false),
  include_functions: Joi.boolean().default(true),
  include_types: Joi.boolean().default(true),
});

const searchRequestSchema = Joi.object({
  connection_id: Joi.string().uuid().required(),
  query: Joi.string().min(1).max(100).required(),
  object_types: Joi.array().items(Joi.string().valid('table', 'view', 'function', 'type')).optional(),
  schemas: Joi.array().items(Joi.string()).optional(),
  limit: Joi.number().min(1).max(100).default(50),
  offset: Joi.number().min(0).default(0),
});

const connectionIdSchema = Joi.object({
  connectionId: Joi.string().uuid().required(),
});

export class SchemaController {
  constructor(private schemaService: SchemaService) {}

  /**
   * POST /schemas/discover
   * Discover database schema for a connection
   */
  async discoverSchema(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const { error, value } = discoveryRequestSchema.validate(req.body);
      if (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: error.details.map(d => ({
              field: d.path.join('.'),
              message: d.message,
            })),
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: req.requestId,
            version: '0.1.0',
          },
        });
        return;
      }

      const request: SchemaDiscoveryRequest = value;
      
      logger.info('Schema discovery request received', {
        connectionId: request.connection_id,
        forceRefresh: request.force_refresh,
        requestId: req.requestId,
        userId: req.auth?.userId,
      });

      // TODO: Validate user has access to this connection
      // This would integrate with the connection management service
      
      const result = await this.schemaService.discoverSchema(request);
      
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      logger.error('Schema discovery failed', error as Error, {
        requestId: req.requestId,
        userId: req.auth?.userId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred during schema discovery',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    }
  }

  /**
   * POST /schemas/search
   * Search schema objects by query
   */
  async searchSchema(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const { error, value } = searchRequestSchema.validate(req.body);
      if (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid search parameters',
            details: error.details.map(d => ({
              field: d.path.join('.'),
              message: d.message,
            })),
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: req.requestId,
            version: '0.1.0',
          },
        });
        return;
      }

      const request: SchemaSearchRequest = value;
      
      logger.info('Schema search request received', {
        connectionId: request.connection_id,
        query: request.query,
        requestId: req.requestId,
        userId: req.auth?.userId,
      });

      const result = await this.schemaService.searchSchema(request);
      
      res.status(200).json({
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    } catch (error) {
      logger.error('Schema search failed', error as Error, {
        requestId: req.requestId,
        userId: req.auth?.userId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred during schema search',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    }
  }

  /**
   * GET /schemas/connections/:connectionId
   * Get cached schema for a connection
   */
  async getSchema(req: Request, res: Response): Promise<void> {
    try {
      // Validate path parameters
      const { error, value } = connectionIdSchema.validate(req.params);
      if (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid connection ID',
            details: error.details,
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: req.requestId,
            version: '0.1.0',
          },
        });
        return;
      }

      const { connectionId } = value;
      
      logger.info('Get schema request received', {
        connectionId,
        requestId: req.requestId,
        userId: req.auth?.userId,
      });

      // Try to get from cache first, then discover if not available
      const result = await this.schemaService.discoverSchema({
        connection_id: connectionId,
        force_refresh: false,
      });
      
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json({
          success: false,
          error: {
            code: 'SCHEMA_NOT_FOUND',
            message: 'Schema not found for the specified connection',
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: req.requestId,
            version: '0.1.0',
          },
        });
      }
    } catch (error) {
      logger.error('Get schema failed', error as Error, {
        requestId: req.requestId,
        userId: req.auth?.userId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while retrieving schema',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    }
  }

  /**
   * DELETE /schemas/cache/:connectionId
   * Invalidate cached schema for a connection
   */
  async invalidateCache(req: Request, res: Response): Promise<void> {
    try {
      // Validate path parameters
      const { error, value } = connectionIdSchema.validate(req.params);
      if (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid connection ID',
            details: error.details,
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: req.requestId,
            version: '0.1.0',
          },
        });
        return;
      }

      const { connectionId } = value;
      
      logger.info('Cache invalidation request received', {
        connectionId,
        requestId: req.requestId,
        userId: req.auth?.userId,
      });

      await this.schemaService.invalidateCache(connectionId);
      
      res.status(200).json({
        success: true,
        data: {
          message: 'Cache invalidated successfully',
          connection_id: connectionId,
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    } catch (error) {
      logger.error('Cache invalidation failed', error as Error, {
        requestId: req.requestId,
        userId: req.auth?.userId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred during cache invalidation',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    }
  }

  /**
   * GET /schemas/health
   * Get schema service health status
   */
  async getHealth(req: Request, res: Response): Promise<void> {
    try {
      const health = await this.schemaService.getHealthStatus();
      
      const statusCode = health.status === 'healthy' ? 200 : 503;
      
      res.status(statusCode).json({
        success: health.status === 'healthy',
        data: health,
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    } catch (error) {
      logger.error('Health check failed', error as Error, {
        requestId: req.requestId,
      });

      res.status(503).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Unable to determine service health',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    }
  }

  /**
   * GET /schemas/stats
   * Get schema service statistics
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      // This would return various statistics about the service
      const stats = {
        cache_entries: 0, // Would get from cache service
        discovery_operations: 0, // Would track this
        average_discovery_time: 0, // Would calculate this
        most_accessed_connections: [], // Would track this
        error_rate: 0, // Would calculate this
      };

      res.status(200).json({
        success: true,
        data: stats,
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    } catch (error) {
      logger.error('Get stats failed', error as Error, {
        requestId: req.requestId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while retrieving statistics',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    }
  }

  /**
   * POST /changes/start/:connectionId
   * Start change detection for a connection
   */
  async startChangeDetection(req: Request, res: Response): Promise<void> {
    try {
      const { error, value } = connectionIdSchema.validate(req.params);
      if (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid connection ID',
            details: error.details,
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: req.requestId,
            version: '0.1.0',
          },
        });
        return;
      }

      const { connectionId } = value;
      
      this.schemaService.startChangeDetection(connectionId);
      
      res.status(200).json({
        success: true,
        data: {
          message: 'Change detection started successfully',
          connection_id: connectionId,
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    } catch (error) {
      logger.error('Failed to start change detection', error as Error, {
        requestId: req.requestId,
        userId: req.auth?.userId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while starting change detection',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    }
  }

  /**
   * POST /changes/stop/:connectionId
   * Stop change detection for a connection
   */
  async stopChangeDetection(req: Request, res: Response): Promise<void> {
    try {
      const { error, value } = connectionIdSchema.validate(req.params);
      if (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid connection ID',
            details: error.details,
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: req.requestId,
            version: '0.1.0',
          },
        });
        return;
      }

      const { connectionId } = value;
      
      this.schemaService.stopChangeDetection(connectionId);
      
      res.status(200).json({
        success: true,
        data: {
          message: 'Change detection stopped successfully',
          connection_id: connectionId,
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    } catch (error) {
      logger.error('Failed to stop change detection', error as Error, {
        requestId: req.requestId,
        userId: req.auth?.userId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while stopping change detection',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    }
  }

  /**
   * GET /changes/status
   * Get change detection status for all connections
   */
  async getChangeDetectionStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = this.schemaService.getChangeDetectionStatus();
      
      res.status(200).json({
        success: true,
        data: status,
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    } catch (error) {
      logger.error('Failed to get change detection status', error as Error, {
        requestId: req.requestId,
        userId: req.auth?.userId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while retrieving change detection status',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    }
  }

  /**
   * POST /changes/trigger/:connectionId
   * Manually trigger change detection for a connection
   */
  async triggerChangeDetection(req: Request, res: Response): Promise<void> {
    try {
      const { error, value } = connectionIdSchema.validate(req.params);
      if (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid connection ID',
            details: error.details,
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: req.requestId,
            version: '0.1.0',
          },
        });
        return;
      }

      const { connectionId } = value;
      
      const changes = await this.schemaService.triggerChangeDetection(connectionId);
      
      res.status(200).json({
        success: true,
        data: {
          connection_id: connectionId,
          changes_detected: changes.length,
          changes,
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    } catch (error) {
      logger.error('Failed to trigger change detection', error as Error, {
        requestId: req.requestId,
        userId: req.auth?.userId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while triggering change detection',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    }
  }

  /**
   * GET /websocket/stats
   * Get WebSocket connection statistics
   */
  async getWebSocketStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = this.schemaService.getWebSocketStats();
      
      res.status(200).json({
        success: true,
        data: stats,
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    } catch (error) {
      logger.error('Failed to get WebSocket stats', error as Error, {
        requestId: req.requestId,
        userId: req.auth?.userId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while retrieving WebSocket statistics',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    }
  }

  /**
   * GET /history/:connectionId
   * Get schema history for a connection
   */
  async getSchemaHistory(req: Request, res: Response): Promise<void> {
    try {
      const { error, value } = connectionIdSchema.validate(req.params);
      if (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid connection ID',
            details: error.details,
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: req.requestId,
            version: '0.1.0',
          },
        });
        return;
      }

      const { connectionId } = value;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      
      const history = await this.schemaService.getSchemaHistory(connectionId, limit);
      
      res.status(200).json({
        success: true,
        data: {
          connection_id: connectionId,
          snapshots: history,
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    } catch (error) {
      logger.error('Failed to get schema history', error as Error, {
        requestId: req.requestId,
        userId: req.auth?.userId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while retrieving schema history',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    }
  }

  /**
   * GET /changes/:connectionId
   * Get schema changes for a connection
   */
  async getConnectionChanges(req: Request, res: Response): Promise<void> {
    try {
      const { error, value } = connectionIdSchema.validate(req.params);
      if (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid connection ID',
            details: error.details,
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: req.requestId,
            version: '0.1.0',
          },
        });
        return;
      }

      const { connectionId } = value;
      
      // Parse query parameters
      const options = {
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
        reviewed: req.query.reviewed ? req.query.reviewed === 'true' : undefined,
        changeType: req.query.changeType ? (req.query.changeType as string).split(',') : undefined,
        objectType: req.query.objectType ? (req.query.objectType as string).split(',') : undefined,
        since: req.query.since ? new Date(req.query.since as string) : undefined,
      };
      
      const changes = await this.schemaService.getSchemaChanges(connectionId, options);
      
      res.status(200).json({
        success: true,
        data: {
          connection_id: connectionId,
          changes,
          pagination: {
            limit: options.limit,
            offset: options.offset,
            total: changes.length,
          },
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    } catch (error) {
      logger.error('Failed to get schema changes', error as Error, {
        requestId: req.requestId,
        userId: req.auth?.userId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while retrieving schema changes',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    }
  }

  /**
   * POST /changes/:changeId/review
   * Mark a schema change as reviewed
   */
  async reviewSchemaChange(req: Request, res: Response): Promise<void> {
    try {
      const changeId = req.params.changeId;
      if (!changeId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Change ID is required',
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: req.requestId,
            version: '0.1.0',
          },
        });
        return;
      }

      const reviewedBy = req.auth?.userId || 'unknown';
      const notes = req.body.notes;
      
      await this.schemaService.markChangeReviewed(changeId, reviewedBy, notes);
      
      res.status(200).json({
        success: true,
        data: {
          change_id: changeId,
          reviewed_by: reviewedBy,
          reviewed_at: new Date().toISOString(),
          message: 'Schema change marked as reviewed',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    } catch (error) {
      logger.error('Failed to review schema change', error as Error, {
        requestId: req.requestId,
        userId: req.auth?.userId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while reviewing schema change',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    }
  }

  /**
   * GET /analytics/changes/:connectionId
   * Get schema change analytics for a connection
   */
  async getSchemaChangeAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { error, value } = connectionIdSchema.validate(req.params);
      if (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid connection ID',
            details: error.details,
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: req.requestId,
            version: '0.1.0',
          },
        });
        return;
      }

      const { connectionId } = value;
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      
      const stats = await this.schemaService.getSchemaChangeStats(connectionId, days);
      
      res.status(200).json({
        success: true,
        data: {
          connection_id: connectionId,
          period_days: days,
          statistics: stats,
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    } catch (error) {
      logger.error('Failed to get schema change analytics', error as Error, {
        requestId: req.requestId,
        userId: req.auth?.userId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while retrieving schema change analytics',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
          version: '0.1.0',
        },
      });
    }
  }
}