import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types/api.types';
import { createLogger } from '../utils/logger';
import { DatabaseService } from '../services/database.service';
import { ConnectionPoolService } from '../services/connection-pool.service';
import { 
  ForbiddenError,
  ConnectionNotFoundError 
} from '../utils/errors';
import { validateSchema, connectionIdParamSchema } from '../validation/schemas';

const logger = createLogger('MonitoringController');

export class MonitoringController {
  constructor(
    private databaseService: DatabaseService,
    private poolService: ConnectionPoolService
  ) {}

  /**
   * GET /monitoring/pools
   * Get all connection pool statistics
   */
  getPoolStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new ForbiddenError('Authentication context not found');
      }

      const { userId } = req.context;

      logger.info('Getting pool statistics', { userId });

      const poolStats = this.poolService.getAllPoolStats();

      // Filter pools to only show user's connections
      const userConnections = await this.databaseService.listConnections(userId);
      const userConnectionIds = new Set(userConnections.map(conn => conn.id));

      const filteredStats = poolStats.filter(stat => 
        userConnectionIds.has(stat.connection_id)
      );

      const response: ApiResponse = {
        success: true,
        data: {
          total_pools: filteredStats.length,
          pools: filteredStats,
          summary: {
            total_connections: filteredStats.reduce((sum, stat) => sum + stat.total_count, 0),
            active_connections: filteredStats.reduce((sum, stat) => sum + stat.active_connections, 0),
            idle_connections: filteredStats.reduce((sum, stat) => sum + stat.idle_connections, 0),
            waiting_count: filteredStats.reduce((sum, stat) => sum + stat.waiting_count, 0),
          },
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /monitoring/connections/:id/stats
   * Get statistics for a specific connection
   */
  getConnectionStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new ForbiddenError('Authentication context not found');
      }

      const { userId } = req.context;
      const { id: connectionId } = validateSchema(connectionIdParamSchema)(req.params);

      logger.info('Getting connection statistics', { userId, connectionId });

      // Verify user has access to connection
      const connection = await this.databaseService.getConnection(connectionId, userId);
      if (!connection) {
        throw new ConnectionNotFoundError(`Connection '${connectionId}' not found`);
      }

      // Get pool statistics
      const poolStats = this.poolService.getPoolStats(connectionId);

      const response: ApiResponse = {
        success: true,
        data: {
          connection_id: connectionId,
          connection_name: connection.name,
          connection_type: connection.connection_type,
          status: connection.status,
          last_tested_at: connection.last_tested_at,
          last_used_at: connection.last_used_at,
          pool_stats: poolStats,
          created_at: connection.created_at,
          updated_at: connection.updated_at,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /monitoring/health-checks
   * Get health check status for user's connections
   */
  getHealthChecks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new ForbiddenError('Authentication context not found');
      }

      const { userId } = req.context;

      logger.info('Getting health checks', { userId });

      // Get user's connections
      const userConnections = await this.databaseService.listConnections(userId);
      const connectionIds = userConnections.map(conn => conn.id);

      // Get all health checks and filter by user's connections
      const allHealthChecks = await this.databaseService.getHealthChecks();
      const userHealthChecks = allHealthChecks.filter(hc => 
        connectionIds.includes(hc.connection_id)
      );

      const response: ApiResponse = {
        success: true,
        data: {
          total_connections: userConnections.length,
          health_checks: userHealthChecks.length,
          healthy: userHealthChecks.filter(hc => hc.status === 'healthy').length,
          unhealthy: userHealthChecks.filter(hc => hc.status === 'unhealthy').length,
          unknown: userHealthChecks.filter(hc => hc.status === 'unknown').length,
          checks: userHealthChecks,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /monitoring/service/stats
   * Get overall service statistics (admin only)
   */
  getServiceStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new ForbiddenError('Authentication context not found');
      }

      const { role } = req.context;

      // Only admins can access service-wide stats
      if (role !== 'admin' && role !== 'owner') {
        throw new ForbiddenError('Admin access required');
      }

      logger.info('Getting service statistics');

      const allPools = this.poolService.getAllPoolStats();
      const allHealthChecks = await this.databaseService.getHealthChecks();

      const response: ApiResponse = {
        success: true,
        data: {
          service: {
            name: 'connection-service',
            version: '0.1.0',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
          },
          pools: {
            total: allPools.length,
            total_connections: allPools.reduce((sum, pool) => sum + pool.total_count, 0),
            active_connections: allPools.reduce((sum, pool) => sum + pool.active_connections, 0),
            idle_connections: allPools.reduce((sum, pool) => sum + pool.idle_connections, 0),
          },
          health_checks: {
            total: allHealthChecks.length,
            healthy: allHealthChecks.filter(hc => hc.status === 'healthy').length,
            unhealthy: allHealthChecks.filter(hc => hc.status === 'unhealthy').length,
            unknown: allHealthChecks.filter(hc => hc.status === 'unknown').length,
          },
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };
}