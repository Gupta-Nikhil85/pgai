import { DatabaseSchema, SchemaChange } from '../types/schema.types';
import { createLogger } from '../utils/logger';

const logger = createLogger('DatabaseService');

// Mock database service for development/testing
export class DatabaseService {
  private mockData = new Map<string, any>();

  constructor() {
    logger.info('Database service initialized in mock mode');
  }

  async connect(): Promise<void> {
    logger.info('Database connection established (mock)');
  }

  async disconnect(): Promise<void> {
    logger.info('Database connection closed (mock)');
  }

  // Schema Snapshot Methods

  async saveSchemaSnapshot(connectionId: string, schema: DatabaseSchema): Promise<string> {
    const snapshotId = `snapshot_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    const snapshot = {
      id: snapshotId,
      connectionId,
      versionHash: schema.version_hash,
      schemaData: schema,
      objectCount: schema.object_count,
      discoveryDuration: schema.discovery_duration_ms,
      discoveredAt: new Date(schema.last_updated),
    };

    this.mockData.set(snapshotId, snapshot);
    
    logger.debug('Schema snapshot saved (mock)', {
      snapshotId,
      connectionId,
      versionHash: schema.version_hash,
    });

    return snapshotId;
  }

  async getLatestSchemaSnapshot(connectionId: string) {
    const snapshots = Array.from(this.mockData.values())
      .filter(s => s.connectionId === connectionId)
      .sort((a, b) => new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime());
    
    return snapshots[0] || null;
  }

  async getSchemaHistory(connectionId: string, limit: number = 10) {
    const snapshots = Array.from(this.mockData.values())
      .filter(s => s.connectionId === connectionId)
      .sort((a, b) => new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime())
      .slice(0, limit)
      .map(s => ({
        id: s.id,
        versionHash: s.versionHash,
        objectCount: s.objectCount,
        discoveredAt: s.discoveredAt,
        discoveryDuration: s.discoveryDuration,
      }));

    return snapshots;
  }

  // Schema Change Methods

  async saveSchemaChange(change: SchemaChange & { snapshotId?: string }): Promise<string> {
    const changeId = `change_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    const savedChange = {
      ...change,
      id: changeId,
    };

    this.mockData.set(changeId, savedChange);

    logger.debug('Schema change saved (mock)', {
      changeId,
      connectionId: change.connection_id,
      changeType: change.change_type,
    });

    return changeId;
  }

  async getSchemaChanges(
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
    let changes = Array.from(this.mockData.values())
      .filter(item => item.connection_id === connectionId && item.change_type);

    // Apply filters
    if (options.reviewed !== undefined) {
      changes = changes.filter(c => c.reviewed === options.reviewed);
    }

    if (options.changeType && options.changeType.length > 0) {
      changes = changes.filter(c => options.changeType!.includes(c.change_type));
    }

    if (options.objectType && options.objectType.length > 0) {
      changes = changes.filter(c => options.objectType!.includes(c.object_type));
    }

    if (options.since) {
      changes = changes.filter(c => new Date(c.detected_at) >= options.since!);
    }

    // Sort and paginate
    changes.sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime());
    
    const offset = options.offset || 0;
    const limit = options.limit || 50;
    
    return changes.slice(offset, offset + limit);
  }

  async markChangeReviewed(changeId: string, reviewedBy: string, notes?: string): Promise<void> {
    const change = this.mockData.get(changeId);
    if (change) {
      change.reviewed = true;
      change.reviewed_by = reviewedBy;
      change.reviewed_at = new Date().toISOString();
      change.notes = notes;
      
      this.mockData.set(changeId, change);
      
      logger.debug('Schema change marked as reviewed (mock)', {
        changeId,
        reviewedBy,
      });
    }
  }

  // Schema Discovery Job Methods

  async createDiscoveryJob(data: {
    connectionId: string;
    requestedBy: string;
    forceRefresh: boolean;
    includeSystem: boolean;
  }): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    const job = {
      id: jobId,
      connectionId: data.connectionId,
      requestedBy: data.requestedBy,
      forceRefresh: data.forceRefresh,
      includeSystem: data.includeSystem,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };

    this.mockData.set(jobId, job);

    logger.debug('Schema discovery job created (mock)', {
      jobId,
      connectionId: data.connectionId,
      requestedBy: data.requestedBy,
    });

    return jobId;
  }

  async updateDiscoveryJob(jobId: string, updates: any): Promise<void> {
    const job = this.mockData.get(jobId);
    if (job) {
      Object.assign(job, updates);
      this.mockData.set(jobId, job);
      logger.debug('Discovery job updated (mock)', { jobId, updates });
    }
  }

  async getDiscoveryJobs(connectionId: string, options: { limit?: number; status?: string } = {}) {
    let jobs = Array.from(this.mockData.values())
      .filter(item => item.connectionId === connectionId && item.status);

    if (options.status) {
      jobs = jobs.filter(j => j.status === options.status);
    }

    jobs.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
    
    const limit = options.limit || 20;
    return jobs.slice(0, limit);
  }

  // WebSocket Session Methods

  async createWebSocketSession(data: { socketId: string; userId: string }): Promise<string> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    const session = {
      id: sessionId,
      socketId: data.socketId,
      userId: data.userId,
      connectedAt: new Date().toISOString(),
    };

    this.mockData.set(sessionId, session);
    return sessionId;
  }

  async closeWebSocketSession(socketId: string): Promise<void> {
    const sessions = Array.from(this.mockData.entries())
      .filter(([_, value]) => value.socketId === socketId);
    
    sessions.forEach(([key, session]) => {
      session.disconnectedAt = new Date().toISOString();
      this.mockData.set(key, session);
    });
  }

  async createSubscription(sessionId: string, connectionId: string): Promise<string> {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    const subscription = {
      id: subscriptionId,
      sessionId,
      connectionId,
      subscribedAt: new Date().toISOString(),
    };

    this.mockData.set(subscriptionId, subscription);
    return subscriptionId;
  }

  async removeSubscription(sessionId: string, connectionId: string): Promise<void> {
    const subscriptions = Array.from(this.mockData.entries())
      .filter(([_, value]) => value.sessionId === sessionId && value.connectionId === connectionId);
    
    subscriptions.forEach(([key, sub]) => {
      sub.unsubscribedAt = new Date().toISOString();
      this.mockData.set(key, sub);
    });
  }

  // Metrics Methods

  async saveCacheMetrics(metrics: any): Promise<void> {
    // Mock implementation
    logger.debug('Cache metrics saved (mock)', metrics);
  }

  async saveServiceHealth(health: any): Promise<void> {
    // Mock implementation
    logger.debug('Service health saved (mock)', health);
  }

  // Connection Management

  async getConnection(connectionId: string) {
    // Mock connection data
    return {
      id: connectionId,
      name: 'Mock Connection',
      host: 'localhost',
      port: 5432,
      database: 'mock_db',
      username: 'mock_user',
      isActive: true,
      changeDetectionEnabled: false,
    };
  }

  async updateConnectionChangeDetection(
    connectionId: string,
    enabled: boolean,
    interval?: number
  ): Promise<void> {
    logger.debug('Connection change detection updated (mock)', {
      connectionId,
      enabled,
      interval,
    });
  }

  // Analytics Methods

  async getSchemaChangeStats(connectionId: string, days: number = 30) {
    // Mock statistics
    return [
      {
        changeType: 'addition',
        objectType: 'table',
        impactLevel: 'non_breaking',
        _count: { id: 5 },
      },
      {
        changeType: 'modification',
        objectType: 'column',
        impactLevel: 'potentially_breaking',
        _count: { id: 3 },
      },
    ];
  }

  async getDiscoveryPerformanceStats(days: number = 30) {
    // Mock performance stats
    return {
      _avg: { duration: 2500 },
      _min: { duration: 1200 },
      _max: { duration: 5000 },
      _count: { id: 25 },
    };
  }
}