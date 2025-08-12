import {
  DatabaseSchema,
  SchemaDiscoveryRequest,
  SchemaDiscoveryResponse,
  SchemaSearchRequest,
  SchemaSearchResponse,
  SchemaChange,
  SchemaServiceHealth,
} from '../types/schema.types';
import { SchemaDiscoveryService } from './schema-discovery.service';
import { SchemaCacheService } from './schema-cache.service';
import { WebSocketService } from './websocket.service';
import { SchemaChangeDetectionService } from './schema-change-detection.service';
import { DatabaseService } from './database.service.mock';
import { createLogger } from '../utils/logger';
import { 
  recordSchemaDiscovery, 
  recordCacheOperation, 
  updateServiceHealth,
  updateCacheMetrics,
} from '../utils/metrics';

const logger = createLogger('SchemaService');

export class SchemaService {
  private discoveryService: SchemaDiscoveryService;
  private cacheService: SchemaCacheService;
  private websocketService?: WebSocketService;
  private changeDetectionService: SchemaChangeDetectionService;
  private databaseService: DatabaseService;
  private changeDetectionInterval?: NodeJS.Timeout;

  constructor(websocketService?: WebSocketService) {
    this.discoveryService = new SchemaDiscoveryService();
    this.cacheService = new SchemaCacheService();
    this.websocketService = websocketService;
    this.databaseService = new DatabaseService();
    this.changeDetectionService = new SchemaChangeDetectionService(
      this.discoveryService,
      this.cacheService,
      this.websocketService
    );
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Schema Service');
    
    try {
      // Connect to database
      await this.databaseService.connect();
      updateServiceHealth('database', true);
      
      // Connect to cache
      await this.cacheService.connect();
      updateServiceHealth('cache', true);
      
      // Change detection is now managed per-connection
      
      logger.info('Schema Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Schema Service', error as Error);
      updateServiceHealth('cache', false);
      updateServiceHealth('database', false);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Schema Service');
    
    try {
      // Stop change detection
      if (this.changeDetectionInterval) {
        clearInterval(this.changeDetectionInterval);
      }
      await this.changeDetectionService.shutdown();
      
      // Close connections
      await Promise.all([
        this.cacheService.disconnect(),
        this.databaseService.disconnect(),
        this.discoveryService.closeConnectionPools(),
      ]);
      
      logger.info('Schema Service shutdown completed');
    } catch (error) {
      logger.error('Error during Schema Service shutdown', error as Error);
    }
  }

  async discoverSchema(request: SchemaDiscoveryRequest): Promise<SchemaDiscoveryResponse> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    logger.info('Schema discovery requested', {
      connectionId: request.connection_id,
      forceRefresh: request.force_refresh,
      requestId,
    });

    const discoveryMetrics = recordSchemaDiscovery.start(request.connection_id);

    try {
      let schema: DatabaseSchema | null = null;
      let fromCache = false;

      // Try cache first (unless force refresh is requested)
      if (!request.force_refresh) {
        const cacheMetrics = recordCacheOperation.start('get');
        
        try {
          schema = await this.cacheService.get(request.connection_id);
          fromCache = !!schema;
          cacheMetrics.success();
          
          if (schema) {
            logger.debug('Schema retrieved from cache', {
              connectionId: request.connection_id,
              requestId,
            });
          }
        } catch (error) {
          cacheMetrics.failure();
          logger.warn('Cache retrieval failed, falling back to discovery', {
            connectionId: request.connection_id,
            error: (error as Error).message,
            requestId,
          });
        }
      }

      // Discover from database if not in cache or force refresh
      if (!schema) {
        schema = await this.discoveryService.discoverSchema(request);
        fromCache = false;

        // Record discovery metrics
        recordSchemaDiscovery.objects(request.connection_id, 'tables', schema.object_count.tables);
        recordSchemaDiscovery.objects(request.connection_id, 'views', schema.object_count.views);
        recordSchemaDiscovery.objects(request.connection_id, 'functions', schema.object_count.functions);
        recordSchemaDiscovery.objects(request.connection_id, 'types', schema.object_count.types);

        // Cache the result
        const cacheMetrics = recordCacheOperation.start('set');
        try {
          await this.cacheService.set(request.connection_id, schema);
          cacheMetrics.success();
        } catch (error) {
          cacheMetrics.failure();
          logger.warn('Failed to cache schema data', {
            connectionId: request.connection_id,
            error: (error as Error).message,
            requestId,
          });
        }

        // Save schema snapshot to database
        try {
          const snapshotId = await this.databaseService.saveSchemaSnapshot(request.connection_id, schema);
          logger.debug('Schema snapshot saved to database', {
            snapshotId,
            connectionId: request.connection_id,
            requestId,
          });
        } catch (error) {
          logger.warn('Failed to save schema snapshot to database', {
            connectionId: request.connection_id,
            error: (error as Error).message,
            requestId,
          });
        }

        // Broadcast schema discovery completion via WebSocket
        if (this.websocketService) {
          this.websocketService.broadcastSchemaDiscovered(request.connection_id, schema);
        }
      }

      discoveryMetrics.success();

      const duration = Date.now() - startTime;
      
      logger.info('Schema discovery completed', {
        connectionId: request.connection_id,
        duration,
        fromCache,
        objectCount: schema.object_count,
        requestId,
      });

      return {
        success: true,
        data: schema,
        meta: {
          timestamp: new Date().toISOString(),
          duration_ms: duration,
          from_cache: fromCache,
          request_id: requestId,
          version: '0.1.0',
        },
      };
    } catch (error) {
      discoveryMetrics.failure();
      
      const duration = Date.now() - startTime;
      
      logger.error('Schema discovery failed', error as Error, {
        connectionId: request.connection_id,
        duration,
        requestId,
      });

      return {
        success: false,
        error: {
          code: 'DISCOVERY_FAILED',
          message: (error as Error).message,
          details: error,
        },
        meta: {
          timestamp: new Date().toISOString(),
          duration_ms: duration,
          from_cache: false,
          request_id: requestId,
          version: '0.1.0',
        },
      };
    }
  }

  async searchSchema(request: SchemaSearchRequest): Promise<SchemaSearchResponse> {
    const requestId = this.generateRequestId();
    
    logger.info('Schema search requested', {
      connectionId: request.connection_id,
      query: request.query,
      requestId,
    });

    try {
      // Get schema data from cache or discovery
      const schemaResponse = await this.discoverSchema({
        connection_id: request.connection_id,
        force_refresh: false,
      });

      if (!schemaResponse.success || !schemaResponse.data) {
        throw new Error('Failed to retrieve schema for search');
      }

      const schema = schemaResponse.data;
      const results = this.performSchemaSearch(schema, request);

      logger.info('Schema search completed', {
        connectionId: request.connection_id,
        query: request.query,
        resultCount: results.length,
        requestId,
      });

      return {
        results,
        total_count: results.length,
        facets: this.generateSearchFacets(schema, request),
        suggestions: this.generateSearchSuggestions(schema, request.query),
      };
    } catch (error) {
      logger.error('Schema search failed', error as Error, {
        connectionId: request.connection_id,
        query: request.query,
        requestId,
      });

      return {
        results: [],
        total_count: 0,
        facets: {
          object_types: {},
          schemas: {},
        },
        suggestions: [],
      };
    }
  }

  async invalidateCache(connectionId: string): Promise<void> {
    logger.info('Cache invalidation requested', { connectionId });
    
    try {
      await this.cacheService.invalidate(connectionId);
      
      // Broadcast cache invalidation via WebSocket
      if (this.websocketService) {
        this.websocketService.broadcastCacheInvalidated(connectionId);
      }
      
      logger.info('Cache invalidated successfully', { connectionId });
    } catch (error) {
      logger.error('Cache invalidation failed', error as Error, { connectionId });
      throw error;
    }
  }

  async getHealthStatus(): Promise<SchemaServiceHealth> {
    try {
      // Check cache health
      const cacheHealth = await this.cacheService.healthCheck();
      const cacheHealthy = cacheHealth.status === 'healthy';

      // Check if cache service is available
      const cacheAvailable = await this.cacheService.isCacheAvailable();

      // Get cache statistics
      const cacheStats = await this.cacheService.getCacheStats();
      
      // Update metrics
      updateCacheMetrics(
        cacheStats.hit_rate,
        cacheStats.memory_usage_bytes,
        cacheStats.total_entries
      );

      const overallHealthy = cacheHealthy && cacheAvailable;

      return {
        status: overallHealthy ? 'healthy' : 'unhealthy',
        database_connection: true, // Would check actual database connections
        redis_connection: cacheHealthy,
        active_discoveries: 0, // Would track active discovery operations
        cache_size: cacheStats.total_entries,
        memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        uptime_seconds: Math.floor(process.uptime()),
      };
    } catch (error) {
      logger.error('Health check failed', error as Error);
      
      return {
        status: 'unhealthy',
        database_connection: false,
        redis_connection: false,
        active_discoveries: 0,
        cache_size: 0,
        memory_usage_mb: 0,
        uptime_seconds: 0,
      };
    }
  }

  private performSchemaSearch(schema: DatabaseSchema, request: SchemaSearchRequest) {
    const query = request.query.toLowerCase();
    const results = [];

    for (const obj of schema.schemas) {
      // Skip if object type not requested
      if (request.object_types && !request.object_types.includes(obj.type as any)) {
        continue;
      }

      // Skip if schema not requested
      if (request.schemas && !request.schemas.includes(obj.schema)) {
        continue;
      }

      let relevanceScore = 0;
      const matchDetails = [];

      // Name matching
      if (obj.name.toLowerCase().includes(query)) {
        relevanceScore += obj.name.toLowerCase() === query ? 100 : 50;
        matchDetails.push(`name: ${obj.name}`);
      }

      // Description matching
      if (obj.metadata.description?.toLowerCase().includes(query)) {
        relevanceScore += 20;
        matchDetails.push(`description: ${obj.metadata.description}`);
      }

      // Column matching
      for (const column of obj.columns) {
        if (column.name.toLowerCase().includes(query)) {
          relevanceScore += 10;
          matchDetails.push(`column: ${column.name}`);
        }
        if (column.description?.toLowerCase().includes(query)) {
          relevanceScore += 5;
          matchDetails.push(`column_description: ${column.description}`);
        }
      }

      // Tag matching
      for (const tag of obj.metadata.tags) {
        if (tag.toLowerCase().includes(query)) {
          relevanceScore += 15;
          matchDetails.push(`tag: ${tag}`);
        }
      }

      if (relevanceScore > 0) {
        results.push({
          object: obj,
          relevance_score: relevanceScore,
          match_type: matchDetails[0]?.split(':')[0] as any || 'name',
          match_details: matchDetails,
        });
      }
    }

    // Sort by relevance score (descending)
    results.sort((a, b) => b.relevance_score - a.relevance_score);

    // Apply pagination
    const offset = request.offset || 0;
    const limit = request.limit || 50;
    
    return results.slice(offset, offset + limit);
  }

  private generateSearchFacets(schema: DatabaseSchema, request: SchemaSearchRequest) {
    const objectTypes: Record<string, number> = {};
    const schemas: Record<string, number> = {};

    for (const obj of schema.schemas) {
      objectTypes[obj.type] = (objectTypes[obj.type] || 0) + 1;
      schemas[obj.schema] = (schemas[obj.schema] || 0) + 1;
    }

    return { object_types: objectTypes, schemas };
  }

  private generateSearchSuggestions(schema: DatabaseSchema, query: string): string[] {
    const suggestions = new Set<string>();
    const queryLower = query.toLowerCase();

    // Suggest object names that are similar
    for (const obj of schema.schemas) {
      if (obj.name.toLowerCase().startsWith(queryLower) && obj.name.toLowerCase() !== queryLower) {
        suggestions.add(obj.name);
      }
      
      // Suggest column names
      for (const column of obj.columns) {
        if (column.name.toLowerCase().startsWith(queryLower) && column.name.toLowerCase() !== queryLower) {
          suggestions.add(column.name);
        }
      }
    }

    return Array.from(suggestions).slice(0, 10);
  }


  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  // Change Detection Methods

  /**
   * Start schema change detection for a connection
   */
  public startChangeDetection(connectionId: string): void {
    this.changeDetectionService.startDetection(connectionId);
  }

  /**
   * Stop schema change detection for a connection
   */
  public stopChangeDetection(connectionId: string): void {
    this.changeDetectionService.stopDetection(connectionId);
  }

  /**
   * Get change detection status
   */
  public getChangeDetectionStatus() {
    return this.changeDetectionService.getDetectionStatus();
  }

  /**
   * Manually trigger change detection for a connection
   */
  public async triggerChangeDetection(connectionId: string): Promise<SchemaChange[]> {
    return this.changeDetectionService.triggerDetection(connectionId);
  }

  // WebSocket Methods

  /**
   * Get WebSocket connection statistics
   */
  public getWebSocketStats() {
    return this.websocketService?.getConnectionStats() || {
      total_clients: 0,
      total_connections_monitored: 0,
      connection_subscribers: {},
      active_subscriptions: [],
    };
  }

  /**
   * Send message to specific WebSocket client
   */
  public sendToWebSocketClient(socketId: string, event: string, data: any): boolean {
    return this.websocketService?.sendToClient(socketId, event, data) || false;
  }

  /**
   * Disconnect a WebSocket client
   */
  public disconnectWebSocketClient(socketId: string, reason?: string): boolean {
    return this.websocketService?.disconnectClient(socketId, reason) || false;
  }

  // Database Methods

  /**
   * Get schema history for a connection
   */
  public async getSchemaHistory(connectionId: string, limit: number = 10) {
    return this.databaseService.getSchemaHistory(connectionId, limit);
  }

  /**
   * Get schema changes for a connection
   */
  public async getSchemaChanges(
    connectionId: string,
    options: {
      limit?: number;
      offset?: number;
      reviewed?: boolean;
      changeType?: string[];
      objectType?: string[];
      since?: Date;
    } = {}
  ) {
    return this.databaseService.getSchemaChanges(connectionId, options);
  }

  /**
   * Mark a schema change as reviewed
   */
  public async markChangeReviewed(changeId: string, reviewedBy: string, notes?: string): Promise<void> {
    return this.databaseService.markChangeReviewed(changeId, reviewedBy, notes);
  }

  /**
   * Create a schema discovery job
   */
  public async createDiscoveryJob(data: {
    connectionId: string;
    requestedBy: string;
    forceRefresh: boolean;
    includeSystem: boolean;
  }): Promise<string> {
    return this.databaseService.createDiscoveryJob(data);
  }

  /**
   * Get discovery jobs for a connection
   */
  public async getDiscoveryJobs(
    connectionId: string,
    options: { limit?: number; status?: string } = {}
  ) {
    return this.databaseService.getDiscoveryJobs(connectionId, options);
  }

  /**
   * Get schema change statistics
   */
  public async getSchemaChangeStats(connectionId: string, days: number = 30) {
    return this.databaseService.getSchemaChangeStats(connectionId, days);
  }

  /**
   * Get discovery performance statistics
   */
  public async getDiscoveryPerformanceStats(days: number = 30) {
    return this.databaseService.getDiscoveryPerformanceStats(days);
  }

  /**
   * Update connection change detection settings
   */
  public async updateConnectionChangeDetection(
    connectionId: string,
    enabled: boolean,
    interval?: number
  ): Promise<void> {
    await this.databaseService.updateConnectionChangeDetection(connectionId, enabled, interval);
    
    if (enabled) {
      this.startChangeDetection(connectionId);
    } else {
      this.stopChangeDetection(connectionId);
    }
  }
}