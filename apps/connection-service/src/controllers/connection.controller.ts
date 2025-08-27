import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types/api.types';
import { createLogger } from '../utils/logger';
import { DatabaseService } from '../services/database.service';
import { ConnectionPoolService } from '../services/connection-pool.service';
import { 
  validateSchema, 
  validateValue,
  createConnectionSchema,
  updateConnectionSchema,
  listConnectionsQuerySchema,
  connectionIdParamSchema 
} from '../validation/schemas';
import { 
  ConnectionNotFoundError,
  ConnectionExistsError,
  ConnectionLimitError,
  ValidationError,
  ForbiddenError 
} from '../utils/errors';
import { 
  DatabaseConnection, 
  ConnectionCreateRequest, 
  ConnectionUpdateRequest,
  ConnectionListRequest 
} from '../types/connection.types';
import { encrypt } from '../utils/encryption';
import { appConfig } from '../config';

const logger = createLogger('ConnectionController');

export class ConnectionController {
  constructor(
    private databaseService: DatabaseService,
    private poolService: ConnectionPoolService
  ) {}

  /**
   * GET /connections
   * List user's connections with optional filtering
   */
  listConnections = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new ForbiddenError('Authentication context not found');
      }

      const { userId, teamId } = req.context;
      const queryParams = validateSchema(listConnectionsQuerySchema)(req.query);

      logger.info('Listing connections', {
        userId,
        teamId,
        queryParams,
      });

      // Build filter criteria
      const filters = {
        teamId: queryParams.team_id || teamId,
        connectionType: queryParams.connection_type,
        status: queryParams.status,
        search: queryParams.search,
        limit: queryParams.limit,
        offset: queryParams.offset,
      };

      const connections = await this.databaseService.listConnections(userId, filters);

      // Remove sensitive data from response
      const sanitizedConnections = connections.map(conn => ({
        ...conn,
        password_encrypted: '[HIDDEN]',
      }));

      const response: ApiResponse = {
        success: true,
        data: {
          connections: sanitizedConnections,
          total: sanitizedConnections.length,
          limit: queryParams.limit,
          offset: queryParams.offset,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      logger.info('Connections listed successfully', {
        userId,
        count: sanitizedConnections.length,
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /connections
   * Create a new database connection
   */
  createConnection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new ForbiddenError('Authentication context not found');
      }

      const { userId, teamId } = req.context;
      const connectionData = validateSchema(createConnectionSchema)(req.body);

      logger.info('Creating new connection', {
        userId,
        teamId,
        connectionName: connectionData.name,
        connectionType: connectionData.connection_type,
      });

      // Check user connection limits
      const existingConnections = await this.databaseService.listConnections(userId, {
        user_id: userId,
        limit: appConfig.connections.maxPerUser + 1,
      });

      if (existingConnections.length >= appConfig.connections.maxPerUser) {
        throw new ConnectionLimitError(
          `Maximum connections per user exceeded (${appConfig.connections.maxPerUser})`
        );
      }

      // Check for duplicate connection names
      const duplicateConnection = existingConnections.find(
        conn => conn.name.toLowerCase() === connectionData.name.toLowerCase()
      );

      if (duplicateConnection) {
        throw new ConnectionExistsError(
          `Connection with name '${connectionData.name}' already exists`
        );
      }

      // Generate connection ID
      const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      // Encrypt password
      const encryptedPassword = JSON.stringify(encrypt(connectionData.password));

      // Create connection object
      const newConnection: Omit<DatabaseConnection, 'created_at' | 'updated_at'> = {
        id: connectionId,
        user_id: userId,
        team_id: teamId,
        name: connectionData.name,
        description: connectionData.description,
        connection_type: connectionData.connection_type,
        host: connectionData.host,
        port: connectionData.port,
        database: connectionData.database,
        username: connectionData.username,
        password_encrypted: encryptedPassword,
        ssl_enabled: connectionData.ssl_enabled,
        ssl_config: connectionData.ssl_config,
        connection_options: connectionData.connection_options,
        tags: connectionData.tags,
        status: 'active',
        last_tested_at: undefined,
        last_used_at: undefined,
        connection_pool_config: connectionData.connection_pool_config,
      };

      // Save to database
      const createdConnection = await this.databaseService.createConnection(newConnection);

      // Log connection creation event
      await this.databaseService.logConnectionEvent({
        connection_id: connectionId,
        event_type: 'created',
        event_data: {
          connection_name: connectionData.name,
          connection_type: connectionData.connection_type,
          host: connectionData.host,
          port: connectionData.port,
        },
        user_id: userId,
        timestamp: new Date().toISOString(),
        ip_address: req.context.ipAddress,
        user_agent: req.context.userAgent,
      });

      // Remove sensitive data from response
      const sanitizedConnection = {
        ...createdConnection,
        password_encrypted: '[HIDDEN]',
      };

      const response: ApiResponse = {
        success: true,
        data: sanitizedConnection,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      logger.info('Connection created successfully', {
        userId,
        connectionId,
        connectionName: connectionData.name,
      });

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /connections/:id
   * Get connection details by ID
   */
  getConnection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new ForbiddenError('Authentication context not found');
      }

      const { userId } = req.context;
      const { id: connectionId } = validateSchema(connectionIdParamSchema)(req.params);

      logger.info('Getting connection details', {
        userId,
        connectionId,
      });

      const connection = await this.databaseService.getConnection(connectionId, userId);

      if (!connection) {
        throw new ConnectionNotFoundError(`Connection '${connectionId}' not found`);
      }

      // Check if user has access to this connection
      if (connection.user_id !== userId && 
          (!req.context.teamId || connection.team_id !== req.context.teamId)) {
        throw new ForbiddenError('Access denied to this connection');
      }

      // Remove sensitive data from response
      const sanitizedConnection = {
        ...connection,
        password_encrypted: '[HIDDEN]',
      };

      const response: ApiResponse = {
        success: true,
        data: sanitizedConnection,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      logger.info('Connection details retrieved successfully', {
        userId,
        connectionId,
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PUT /connections/:id
   * Update connection by ID
   */
  updateConnection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new ForbiddenError('Authentication context not found');
      }

      const { userId } = req.context;
      const { id: connectionId } = validateSchema(connectionIdParamSchema)(req.params);
      const updateData = validateSchema(updateConnectionSchema)(req.body);

      logger.info('Updating connection', {
        userId,
        connectionId,
        updateFields: Object.keys(updateData),
      });

      // Check if connection exists and user has access
      const existingConnection = await this.databaseService.getConnection(connectionId, userId);
      if (!existingConnection) {
        throw new ConnectionNotFoundError(`Connection '${connectionId}' not found`);
      }

      // Check for name conflicts if name is being updated
      if (updateData.name && updateData.name !== existingConnection.name) {
        const existingConnections = await this.databaseService.listConnections(userId);
        const duplicateConnection = existingConnections.find(
          conn => conn.id !== connectionId && 
                  conn.name.toLowerCase() === updateData.name!.toLowerCase()
        );

        if (duplicateConnection) {
          throw new ConnectionExistsError(
            `Connection with name '${updateData.name}' already exists`
          );
        }
      }

      // Encrypt password if provided
      const updatePayload = { ...updateData };
      if (updateData.password) {
        updatePayload.password_encrypted = encrypt(updateData.password);
        delete updatePayload.password;
      }

      // Update connection
      const updatedConnection = await this.databaseService.updateConnection(
        connectionId,
        userId,
        updatePayload
      );

      if (!updatedConnection) {
        throw new ConnectionNotFoundError(`Connection '${connectionId}' not found`);
      }

      // Log connection update event
      await this.databaseService.logConnectionEvent({
        connection_id: connectionId,
        event_type: 'updated',
        event_data: {
          updated_fields: Object.keys(updateData),
          connection_name: updatedConnection.name,
        },
        user_id: userId,
        timestamp: new Date().toISOString(),
        ip_address: req.context.ipAddress,
        user_agent: req.context.userAgent,
      });

      // Remove existing pool if connection details changed
      if (updateData.host || updateData.port || updateData.database || 
          updateData.username || updateData.password) {
        await this.poolService.removePool(connectionId);
        logger.info('Connection pool removed due to connection update', {
          connectionId,
        });
      }

      // Remove sensitive data from response
      const sanitizedConnection = {
        ...updatedConnection,
        password_encrypted: '[HIDDEN]',
      };

      const response: ApiResponse = {
        success: true,
        data: sanitizedConnection,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      logger.info('Connection updated successfully', {
        userId,
        connectionId,
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /connections/:id
   * Delete connection by ID
   */
  deleteConnection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new ForbiddenError('Authentication context not found');
      }

      const { userId } = req.context;
      const { id: connectionId } = validateSchema(connectionIdParamSchema)(req.params);

      logger.info('Deleting connection', {
        userId,
        connectionId,
      });

      // Check if connection exists and user has access
      const existingConnection = await this.databaseService.getConnection(connectionId, userId);
      if (!existingConnection) {
        throw new ConnectionNotFoundError(`Connection '${connectionId}' not found`);
      }

      // Remove connection pool if exists
      await this.poolService.removePool(connectionId);
      logger.info('Connection pool removed for deleted connection', {
        connectionId,
      });

      // Delete connection from database
      const deleted = await this.databaseService.deleteConnection(connectionId, userId);

      if (!deleted) {
        throw new ConnectionNotFoundError(`Connection '${connectionId}' not found`);
      }

      // Log connection deletion event
      await this.databaseService.logConnectionEvent({
        connection_id: connectionId,
        event_type: 'deleted',
        event_data: {
          connection_name: existingConnection.name,
          connection_type: existingConnection.connection_type,
        },
        user_id: userId,
        timestamp: new Date().toISOString(),
        ip_address: req.context.ipAddress,
        user_agent: req.context.userAgent,
      });

      const response: ApiResponse = {
        success: true,
        data: {
          message: 'Connection deleted successfully',
          connection_id: connectionId,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      logger.info('Connection deleted successfully', {
        userId,
        connectionId,
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  };
}