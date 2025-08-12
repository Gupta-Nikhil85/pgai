import { createHash } from 'crypto';
import { DatabaseSchema, SchemaChange, SchemaDiscoveryRequest } from '../types/schema.types';
import { SchemaDiscoveryService } from './schema-discovery.service';
import { SchemaCacheService } from './schema-cache.service';
import { WebSocketService } from './websocket.service';
import { createLogger } from '../utils/logger';
import { schemaConfig } from '../config';

const logger = createLogger('SchemaChangeDetectionService');

interface ChangeDetectionJob {
  connectionId: string;
  lastChecked: Date;
  lastHash: string;
  checkCount: number;
  errorCount: number;
}

export class SchemaChangeDetectionService {
  private discoveryService: SchemaDiscoveryService;
  private cacheService: SchemaCacheService;
  private websocketService?: WebSocketService;
  private activeJobs = new Map<string, ChangeDetectionJob>();
  private detectionInterval?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    discoveryService: SchemaDiscoveryService,
    cacheService: SchemaCacheService,
    websocketService?: WebSocketService
  ) {
    this.discoveryService = discoveryService;
    this.cacheService = cacheService;
    this.websocketService = websocketService;
  }

  /**
   * Start change detection for a connection
   */
  public startDetection(connectionId: string): void {
    if (this.activeJobs.has(connectionId)) {
      logger.debug('Change detection already active', { connectionId });
      return;
    }

    const job: ChangeDetectionJob = {
      connectionId,
      lastChecked: new Date(),
      lastHash: '',
      checkCount: 0,
      errorCount: 0,
    };

    this.activeJobs.set(connectionId, job);

    logger.info('Started change detection', { connectionId });

    // Start the detection loop if not already running
    if (!this.isRunning) {
      this.startDetectionLoop();
    }
  }

  /**
   * Stop change detection for a connection
   */
  public stopDetection(connectionId: string): void {
    if (this.activeJobs.delete(connectionId)) {
      logger.info('Stopped change detection', { connectionId });
    }

    // Stop the detection loop if no jobs remain
    if (this.activeJobs.size === 0 && this.isRunning) {
      this.stopDetectionLoop();
    }
  }

  /**
   * Stop all change detection
   */
  public stopAllDetection(): void {
    const activeConnections = Array.from(this.activeJobs.keys());
    this.activeJobs.clear();

    logger.info('Stopped all change detection', {
      stoppedConnections: activeConnections.length,
    });

    this.stopDetectionLoop();
  }

  /**
   * Get detection status for all connections
   */
  public getDetectionStatus() {
    const jobs = Array.from(this.activeJobs.entries()).map(([connectionId, job]) => ({
      connection_id: connectionId,
      last_checked: job.lastChecked.toISOString(),
      last_hash: job.lastHash,
      check_count: job.checkCount,
      error_count: job.errorCount,
    }));

    return {
      is_running: this.isRunning,
      active_jobs: jobs.length,
      jobs,
    };
  }

  /**
   * Manually trigger change detection for a connection
   */
  public async triggerDetection(connectionId: string): Promise<SchemaChange[]> {
    const job = this.activeJobs.get(connectionId);
    if (!job) {
      throw new Error(`No active change detection job for connection ${connectionId}`);
    }

    logger.info('Manually triggering change detection', { connectionId });
    return this.detectChangesForConnection(job);
  }

  private startDetectionLoop(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    const intervalMs = schemaConfig.discovery_config.refresh_interval_ms;

    logger.info('Starting change detection loop', {
      intervalMs,
      activeJobs: this.activeJobs.size,
    });

    this.detectionInterval = setInterval(async () => {
      await this.runDetectionCycle();
    }, intervalMs);
  }

  private stopDetectionLoop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = undefined;
    }

    logger.info('Stopped change detection loop');
  }

  private async runDetectionCycle(): Promise<void> {
    if (this.activeJobs.size === 0) {
      return;
    }

    logger.debug('Running change detection cycle', {
      activeJobs: this.activeJobs.size,
    });

    // Process jobs in parallel, but limit concurrency
    const jobEntries = Array.from(this.activeJobs.entries());
    const batchSize = 3; // Process 3 connections at a time

    for (let i = 0; i < jobEntries.length; i += batchSize) {
      const batch = jobEntries.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(([connectionId, job]) => 
          this.detectChangesForConnection(job).catch(error => {
            logger.error('Change detection failed for connection', error, {
              connectionId,
            });
          })
        )
      );
    }
  }

  private async detectChangesForConnection(job: ChangeDetectionJob): Promise<SchemaChange[]> {
    const startTime = Date.now();
    const changes: SchemaChange[] = [];

    try {
      // Get current schema
      const request: SchemaDiscoveryRequest = {
        connection_id: job.connectionId,
        force_refresh: true,
        include_system_schemas: false,
        include_functions: true,
        include_types: true,
      };

      const currentSchema = await this.discoveryService.discoverSchema(request);
      const currentHash = this.generateSchemaHash(currentSchema);

      job.checkCount++;
      job.lastChecked = new Date();

      // First run - just store the hash
      if (!job.lastHash) {
        job.lastHash = currentHash;
        logger.debug('Initial schema hash stored', {
          connectionId: job.connectionId,
          hash: currentHash,
        });
        return changes;
      }

      // Check if schema changed
      if (currentHash !== job.lastHash) {
        logger.info('Schema change detected', {
          connectionId: job.connectionId,
          oldHash: job.lastHash,
          newHash: currentHash,
        });

        // Get previous schema from cache for comparison
        const cachedSchema = await this.cacheService.get(job.connectionId);
        
        if (cachedSchema) {
          const detectedChanges = this.compareSchemas(cachedSchema, currentSchema);
          changes.push(...detectedChanges);

          // Update cache with new schema
          await this.cacheService.set(job.connectionId, currentSchema);

          // Broadcast changes via WebSocket
          if (this.websocketService) {
            for (const change of detectedChanges) {
              this.websocketService.broadcastSchemaChange(job.connectionId, change);
            }
          }
        }

        // Update job with new hash
        job.lastHash = currentHash;
        job.errorCount = 0; // Reset error count on successful detection
      }

      const duration = Date.now() - startTime;
      logger.debug('Change detection completed', {
        connectionId: job.connectionId,
        changesFound: changes.length,
        duration,
      });

    } catch (error) {
      job.errorCount++;
      logger.error('Change detection failed', error as Error, {
        connectionId: job.connectionId,
        errorCount: job.errorCount,
      });

      // Stop detection if too many consecutive errors
      if (job.errorCount >= 5) {
        logger.warn('Too many errors, stopping change detection', {
          connectionId: job.connectionId,
          errorCount: job.errorCount,
        });
        this.stopDetection(job.connectionId);
      }
    }

    return changes;
  }

  private generateSchemaHash(schema: DatabaseSchema): string {
    // Create a hash based on essential schema structure
    const hashInput = {
      schemas: schema.schemas.map(s => ({
        name: s.name,
        type: s.type,
        schema: s.schema,
        columns: s.columns.map(c => ({
          name: c.name,
          type: c.type,
          nullable: c.nullable,
          default_value: c.default_value,
        })),
        constraints: s.constraints,
        indexes: s.indexes,
      })),
      relationships: schema.relationships,
    };

    return createHash('sha256')
      .update(JSON.stringify(hashInput))
      .digest('hex');
  }

  private compareSchemas(oldSchema: DatabaseSchema, newSchema: DatabaseSchema): SchemaChange[] {
    const changes: SchemaChange[] = [];

    // Create maps for easier lookup
    const oldObjects = new Map(oldSchema.schemas.map(s => [`${s.schema}.${s.name}`, s]));
    const newObjects = new Map(newSchema.schemas.map(s => [`${s.schema}.${s.name}`, s]));

    // Detect added objects
    for (const [key, newObj] of newObjects) {
      if (!oldObjects.has(key)) {
        changes.push({
          id: `change_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          connection_id: newSchema.connection_id,
          change_type: 'addition',
          object_type: this.mapObjectType(newObj.type),
          object_identifier: `${newObj.schema}.${newObj.name}`,
          new_definition: newObj,
          impact_level: 'potentially_breaking',
          detected_at: new Date().toISOString(),
          reviewed: false,
        });
      }
    }

    // Detect removed objects
    for (const [key, oldObj] of oldObjects) {
      if (!newObjects.has(key)) {
        changes.push({
          id: `change_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          connection_id: newSchema.connection_id,
          change_type: 'removal',
          object_type: this.mapObjectType(oldObj.type),
          object_identifier: `${oldObj.schema}.${oldObj.name}`,
          old_definition: oldObj,
          impact_level: 'breaking',
          detected_at: new Date().toISOString(),
          reviewed: false,
        });
      }
    }

    // Detect modified objects
    for (const [key, newObj] of newObjects) {
      const oldObj = oldObjects.get(key);
      if (oldObj) {
        const objectChanges = this.compareSchemaObjects(oldObj, newObj);
        if (objectChanges.length > 0) {
          changes.push({
            id: `change_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            connection_id: newSchema.connection_id,
            change_type: 'modification',
            object_type: this.mapObjectType(newObj.type),
            object_identifier: `${newObj.schema}.${newObj.name}`,
            old_definition: oldObj,
            new_definition: newObj,
            impact_level: 'potentially_breaking',
            detected_at: new Date().toISOString(),
            reviewed: false,
          });
        }
      }
    }

    return changes;
  }

  private compareSchemaObjects(oldObj: any, newObj: any): string[] {
    const changes: string[] = [];

    // Compare columns
    const oldColumns = new Map(oldObj.columns.map((c: any) => [c.name, c]));
    const newColumns = new Map(newObj.columns.map((c: any) => [c.name, c]));

    // Added columns
    for (const [colName, newCol] of newColumns) {
      if (!oldColumns.has(colName)) {
        changes.push(`Added column: ${colName} (${(newCol as any).type})`);
      }
    }

    // Removed columns
    for (const [colName] of oldColumns) {
      if (!newColumns.has(colName)) {
        changes.push(`Removed column: ${colName}`);
      }
    }

    // Modified columns
    for (const [colName, newCol] of newColumns) {
      const oldCol = oldColumns.get(colName);
      if (oldCol) {
        const newColumn = newCol as any;
        const oldColumn = oldCol as any;
        if (oldColumn.type !== newColumn.type) {
          changes.push(`Changed column type: ${colName} (${oldColumn.type} -> ${newColumn.type})`);
        }
        if (oldColumn.nullable !== newColumn.nullable) {
          changes.push(`Changed column nullable: ${colName} (${oldColumn.nullable} -> ${newColumn.nullable})`);
        }
        if (oldColumn.default_value !== newColumn.default_value) {
          changes.push(`Changed column default: ${colName}`);
        }
      }
    }

    // Compare constraints (simplified)
    if (JSON.stringify(oldObj.constraints) !== JSON.stringify(newObj.constraints)) {
      changes.push('Constraints modified');
    }

    // Compare indexes (simplified)
    if (JSON.stringify(oldObj.indexes) !== JSON.stringify(newObj.indexes)) {
      changes.push('Indexes modified');
    }

    return changes;
  }

  private mapObjectType(type: string): 'table' | 'view' | 'function' | 'type' | 'column' | 'constraint' | 'index' {
    switch (type) {
      case 'sequence':
        return 'table'; // Map sequence to table for now
      default:
        return type as 'table' | 'view' | 'function' | 'type' | 'column' | 'constraint' | 'index';
    }
  }

  /**
   * Cleanup and shutdown
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down schema change detection service');
    this.stopAllDetection();
    logger.info('Schema change detection service shutdown completed');
  }
}