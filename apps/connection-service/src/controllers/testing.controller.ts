import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types/api.types';
import { createLogger } from '../utils/logger';
import { DatabaseService } from '../services/database.service';
import { ConnectionTestingService } from '../services/connection-testing.service';
import { 
  validateSchema, 
  testConnectionSchema,
  batchTestConnectionsSchema,
  testConnectionWithSSHSchema,
  connectionIdParamSchema 
} from '../validation/schemas';
import { 
  ConnectionNotFoundError,
  ForbiddenError,
  ValidationError 
} from '../utils/errors';
import { 
  ConnectionTestRequest,
  ConnectionTestResult 
} from '../types/connection.types';

const logger = createLogger('TestingController');

export class TestingController {
  constructor(
    private databaseService: DatabaseService,
    private testingService: ConnectionTestingService
  ) {}

  /**
   * POST /testing/connections/:id
   * Test a specific connection by ID
   */
  testConnectionById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new ForbiddenError('Authentication context not found');
      }

      const { userId } = req.context;
      const { id: connectionId } = validateSchema(connectionIdParamSchema)(req.params);

      logger.info('Testing connection by ID', {
        userId,
        connectionId,
      });

      // Check if connection exists and user has access
      const connection = await this.databaseService.getConnection(connectionId, userId);
      if (!connection) {
        throw new ConnectionNotFoundError(`Connection '${connectionId}' not found`);
      }

      // Test the connection
      const testRequest: ConnectionTestRequest = {
        connection_id: connectionId,
      };

      const testResult = await this.testingService.testConnection(testRequest);

      // Log connection test event
      await this.databaseService.logConnectionEvent({
        connection_id: connectionId,
        event_type: 'tested',
        event_data: {
          success: testResult.success,
          connection_time_ms: testResult.connection_time_ms,
          error_message: testResult.error_message,
        },
        user_id: userId,
        timestamp: new Date().toISOString(),
        ip_address: req.context.ipAddress,
        user_agent: req.context.userAgent,
      });

      // Update connection's last_tested_at timestamp
      await this.databaseService.updateConnection(connectionId, userId, {
        last_tested_at: new Date().toISOString(),
      });

      const response: ApiResponse = {
        success: true,
        data: testResult,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      logger.info('Connection test completed', {
        userId,
        connectionId,
        testSuccess: testResult.success,
        responseTime: testResult.connection_time_ms,
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /testing/connections
   * Test a connection using provided configuration (without saving)
   */
  testConnectionConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new ForbiddenError('Authentication context not found');
      }

      const { userId } = req.context;
      const testData = validateSchema(testConnectionSchema)(req.body);

      logger.info('Testing connection configuration', {
        userId,
        connectionType: testData.connection_config?.connection_type,
        host: testData.connection_config?.host,
      });

      const testResult = await this.testingService.testConnection(testData);

      const response: ApiResponse = {
        success: true,
        data: testResult,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      logger.info('Connection configuration test completed', {
        userId,
        testSuccess: testResult.success,
        responseTime: testResult.connection_time_ms,
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /testing/batch
   * Test multiple connections in batch
   */
  batchTestConnections = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new ForbiddenError('Authentication context not found');
      }

      const { userId } = req.context;
      const batchData = validateSchema(batchTestConnectionsSchema)(req.body);

      logger.info('Starting batch connection test', {
        userId,
        connectionCount: batchData.connection_ids?.length || batchData.connection_configs?.length,
      });

      let testRequests: ConnectionTestRequest[] = [];

      if (batchData.connection_ids) {
        // Test existing connections by ID
        for (const connectionId of batchData.connection_ids) {
          // Verify user has access to each connection
          const connection = await this.databaseService.getConnection(connectionId, userId);
          if (!connection) {
            throw new ConnectionNotFoundError(`Connection '${connectionId}' not found`);
          }
          
          testRequests.push({ connection_id: connectionId });
        }
      } else if (batchData.connection_configs) {
        // Test connection configurations
        testRequests = batchData.connection_configs.map((config: any) => ({
          connection_config: config,
        }));
      }

      // Execute batch tests
      const testResults = await this.testingService.batchTestConnections(testRequests);

      // Log batch test events for existing connections
      if (batchData.connection_ids) {
        for (let i = 0; i < batchData.connection_ids.length; i++) {
          const connectionId = batchData.connection_ids[i];
          const result = testResults[i];

          await this.databaseService.logConnectionEvent({
            connection_id: connectionId,
            event_type: 'tested',
            event_data: {
              success: result.success,
              connection_time_ms: result.connection_time_ms,
              error_message: result.error_message,
              batch_test: true,
            },
            user_id: userId,
            timestamp: new Date().toISOString(),
            ip_address: req.context.ipAddress,
            user_agent: req.context.userAgent,
          });

          // Update last_tested_at timestamp
          await this.databaseService.updateConnection(connectionId, userId, {
            last_tested_at: new Date().toISOString(),
          });
        }
      }

      const response: ApiResponse = {
        success: true,
        data: {
          total_tests: testResults.length,
          successful_tests: testResults.filter(r => r.success).length,
          failed_tests: testResults.filter(r => !r.success).length,
          results: testResults,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      logger.info('Batch connection test completed', {
        userId,
        totalTests: testResults.length,
        successfulTests: testResults.filter(r => r.success).length,
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /testing/ssh-tunnel
   * Test connection with SSH tunnel
   */
  testConnectionWithSSH = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new ForbiddenError('Authentication context not found');
      }

      const { userId } = req.context;
      const testData = validateSchema(testConnectionWithSSHSchema)(req.body);

      logger.info('Testing connection with SSH tunnel', {
        userId,
        connectionType: testData.connection_config.connection_type,
        host: testData.connection_config.host,
        sshHost: testData.ssh_config.ssh_host,
      });

      const testResult = await this.testingService.testConnectionWithSSHTunnel(
        testData.connection_config,
        testData.ssh_config
      );

      const response: ApiResponse = {
        success: true,
        data: testResult,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      logger.info('SSH tunnel connection test completed', {
        userId,
        testSuccess: testResult.success,
        responseTime: testResult.connection_time_ms,
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /testing/results/:connectionId
   * Get cached test results for a connection
   */
  getTestResults = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new ForbiddenError('Authentication context not found');
      }

      const { userId } = req.context;
      const { connectionId } = req.params;

      logger.info('Getting test results', {
        userId,
        connectionId,
      });

      // Verify user has access to the connection
      const connection = await this.databaseService.getConnection(connectionId, userId);
      if (!connection) {
        throw new ConnectionNotFoundError(`Connection '${connectionId}' not found`);
      }

      // For now, return the basic connection test info
      // In a real implementation, you might cache test results in Redis
      const testInfo = {
        connection_id: connectionId,
        last_tested_at: connection.last_tested_at,
        status: connection.status,
        available: connection.status === 'active',
        message: connection.status === 'active' ? 
          'Connection is active and available' : 
          `Connection status: ${connection.status}`,
      };

      const response: ApiResponse = {
        success: true,
        data: testInfo,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      logger.info('Test results retrieved', {
        userId,
        connectionId,
        status: connection.status,
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /testing/health
   * Get connection testing service health
   */
  getTestingHealth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const healthInfo = {
        service: 'connection-testing',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '0.1.0',
      };

      const response: ApiResponse = {
        success: true,
        data: healthInfo,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context?.requestId || 'unknown',
          version: '0.1.0',
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };
}