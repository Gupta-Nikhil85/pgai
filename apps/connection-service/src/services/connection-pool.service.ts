import { Pool, PoolClient, PoolConfig } from 'pg';
import { DatabaseConnection, ConnectionPool } from '../types/connection.types';
import { decrypt } from '../utils/encryption';
import { poolLogger, logError, logPerformance } from '../utils/logger';
import { updatePoolMetrics, recordError } from '../utils/metrics';
import { appConfig } from '../config';

interface ManagedPool {
  pool: Pool;
  connection: DatabaseConnection;
  lastActivity: Date;
  activeConnections: number;
  createdAt: Date;
}

export class ConnectionPoolService {
  private pools: Map<string, ManagedPool> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly maxPoolsPerUser: number;
  private readonly globalMaxPools: number;

  constructor() {
    this.maxPoolsPerUser = appConfig.connections.maxPerUser;
    this.globalMaxPools = appConfig.connections.globalPool.maxSize;
    
    // Start cleanup interval
    this.startCleanupInterval();
    
    poolLogger.info('Connection pool service initialized', {
      maxPoolsPerUser: this.maxPoolsPerUser,
      globalMaxPools: this.globalMaxPools,
    });
  }

  /**
   * Get or create a connection pool for a database connection
   */
  async getPool(connection: DatabaseConnection): Promise<Pool> {
    const poolKey = this.getPoolKey(connection);
    
    try {
      // Check if pool already exists
      let managedPool = this.pools.get(poolKey);
      
      if (managedPool) {
        // Update last activity
        managedPool.lastActivity = new Date();
        
        poolLogger.debug('Using existing connection pool', {
          connectionId: connection.id,
          poolKey,
          activeConnections: managedPool.activeConnections,
        });
        
        return managedPool.pool;
      }

      // Check global pool limit
      if (this.pools.size >= this.globalMaxPools) {
        await this.cleanupIdlePools();
        
        if (this.pools.size >= this.globalMaxPools) {
          throw new Error('Global connection pool limit reached');
        }
      }

      // Check user pool limit
      const userPools = this.getUserPools(connection.user_id);
      if (userPools.length >= this.maxPoolsPerUser) {
        // Remove oldest user pool
        const oldestPool = userPools.sort((a, b) => 
          a.lastActivity.getTime() - b.lastActivity.getTime()
        )[0];
        
        await this.removePool(oldestPool.connection.id);
      }

      // Create new pool
      managedPool = await this.createPool(connection);
      this.pools.set(poolKey, managedPool);

      poolLogger.info('Created new connection pool', {
        connectionId: connection.id,
        poolKey,
        poolConfig: managedPool.pool.options,
      });

      return managedPool.pool;

    } catch (error) {
      logError(poolLogger, 'Failed to get connection pool', error as Error, {
        connectionId: connection.id,
      });
      
      recordError('pool_creation_error', 'get_pool');
      throw error;
    }
  }

  /**
   * Create a new connection pool
   */
  private async createPool(connection: DatabaseConnection): Promise<ManagedPool> {
    const startTime = Date.now();
    
    try {
      // Decrypt password
      const password = decrypt(JSON.parse(connection.password_encrypted));
      
      // Build pool configuration
      const poolConfig: PoolConfig = {
        host: connection.host,
        port: connection.port,
        database: connection.database,
        user: connection.username,
        password,
        ssl: connection.ssl_enabled ? (connection.ssl_config || true) : false,
        
        // Pool settings from connection config
        min: connection.connection_pool_config.min,
        max: connection.connection_pool_config.max,
        idleTimeoutMillis: connection.connection_pool_config.idle_timeout_ms,
        connectionTimeoutMillis: connection.connection_pool_config.connection_timeout_ms,
        
        // Additional pool settings
        allowExitOnIdle: true,
        ...connection.connection_options,
      };

      const pool = new Pool(poolConfig);
      
      // Set up pool event listeners
      pool.on('connect', (client: PoolClient) => {
        const managedPool = this.pools.get(this.getPoolKey(connection));
        if (managedPool) {
          managedPool.activeConnections++;
          this.updatePoolMetrics(connection.id, managedPool);
        }
        
        poolLogger.debug('Pool client connected', {
          connectionId: connection.id,
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount,
        });
      });

      pool.on('remove', () => {
        const managedPool = this.pools.get(this.getPoolKey(connection));
        if (managedPool) {
          managedPool.activeConnections = Math.max(0, managedPool.activeConnections - 1);
          this.updatePoolMetrics(connection.id, managedPool);
        }
        
        poolLogger.debug('Pool client removed', {
          connectionId: connection.id,
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount,
        });
      });

      pool.on('error', (err: Error) => {
        logError(poolLogger, 'Pool error', err, {
          connectionId: connection.id,
        });
        
        recordError('pool_error', 'pool_operation');
      });

      // Test the pool with a simple query
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }

      const managedPool: ManagedPool = {
        pool,
        connection,
        lastActivity: new Date(),
        activeConnections: 0,
        createdAt: new Date(),
      };

      logPerformance(
        poolLogger,
        'Pool created',
        Date.now() - startTime,
        {
          connectionId: connection.id,
          host: connection.host,
          database: connection.database,
        }
      );

      return managedPool;

    } catch (error) {
      logError(poolLogger, 'Failed to create connection pool', error as Error, {
        connectionId: connection.id,
        host: connection.host,
        database: connection.database,
      });
      
      throw error;
    }
  }

  /**
   * Remove a connection pool
   */
  async removePool(connectionId: string): Promise<boolean> {
    const poolKey = this.getPoolKeyById(connectionId);
    const managedPool = this.pools.get(poolKey);
    
    if (!managedPool) {
      poolLogger.warn('Attempted to remove non-existent pool', { connectionId });
      return false;
    }

    try {
      // End the pool
      await managedPool.pool.end();
      
      // Remove from maps
      this.pools.delete(poolKey);
      
      poolLogger.info('Connection pool removed', {
        connectionId,
        activeConnections: managedPool.activeConnections,
      });
      
      return true;

    } catch (error) {
      logError(poolLogger, 'Failed to remove connection pool', error as Error, {
        connectionId,
      });
      
      return false;
    }
  }

  /**
   * Get connection from pool
   */
  async getConnection(connectionId: string): Promise<PoolClient> {
    const poolKey = this.getPoolKeyById(connectionId);
    const managedPool = this.pools.get(poolKey);
    
    if (!managedPool) {
      throw new Error(`No pool found for connection: ${connectionId}`);
    }

    try {
      const client = await managedPool.pool.connect();
      managedPool.lastActivity = new Date();
      
      poolLogger.debug('Pool client acquired', {
        connectionId,
        totalCount: managedPool.pool.totalCount,
        idleCount: managedPool.pool.idleCount,
        waitingCount: managedPool.pool.waitingCount,
      });
      
      return client;

    } catch (error) {
      logError(poolLogger, 'Failed to get connection from pool', error as Error, {
        connectionId,
      });
      
      recordError('pool_connection_error', 'get_connection');
      throw error;
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats(connectionId: string): ConnectionPool | null {
    const poolKey = this.getPoolKeyById(connectionId);
    const managedPool = this.pools.get(poolKey);
    
    if (!managedPool) {
      return null;
    }

    return {
      connection_id: connectionId,
      pool_size: managedPool.pool.totalCount,
      active_connections: managedPool.pool.totalCount - managedPool.pool.idleCount,
      idle_connections: managedPool.pool.idleCount,
      waiting_count: managedPool.pool.waitingCount,
      total_count: managedPool.pool.totalCount,
      created_at: managedPool.createdAt.toISOString(),
      last_activity_at: managedPool.lastActivity.toISOString(),
    };
  }

  /**
   * Get all pool statistics
   */
  getAllPoolStats(): ConnectionPool[] {
    return Array.from(this.pools.entries()).map(([poolKey, managedPool]) => ({
      connection_id: managedPool.connection.id,
      pool_size: managedPool.pool.totalCount,
      active_connections: managedPool.pool.totalCount - managedPool.pool.idleCount,
      idle_connections: managedPool.pool.idleCount,
      waiting_count: managedPool.pool.waitingCount,
      total_count: managedPool.pool.totalCount,
      created_at: managedPool.createdAt.toISOString(),
      last_activity_at: managedPool.lastActivity.toISOString(),
    }));
  }

  /**
   * Cleanup idle pools
   */
  private async cleanupIdlePools(): Promise<void> {
    const idleThreshold = Date.now() - appConfig.connections.poolIdleTimeoutMs;
    const poolsToRemove: string[] = [];

    for (const [poolKey, managedPool] of this.pools.entries()) {
      // Skip pools with active connections
      if (managedPool.activeConnections > 0) {
        continue;
      }

      // Check if pool is idle
      if (managedPool.lastActivity.getTime() < idleThreshold) {
        poolsToRemove.push(managedPool.connection.id);
      }
    }

    // Remove idle pools
    for (const connectionId of poolsToRemove) {
      await this.removePool(connectionId);
    }

    if (poolsToRemove.length > 0) {
      poolLogger.info('Cleaned up idle pools', {
        removedCount: poolsToRemove.length,
        totalPools: this.pools.size,
      });
    }
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdlePools().catch(error => {
        logError(poolLogger, 'Pool cleanup failed', error);
      });
    }, 60000); // Run every minute
  }

  /**
   * Get pool key for a connection
   */
  private getPoolKey(connection: DatabaseConnection): string {
    return `${connection.user_id}:${connection.id}`;
  }

  /**
   * Get pool key by connection ID (assumes user_id prefix)
   */
  private getPoolKeyById(connectionId: string): string {
    // Find the pool by connection ID
    for (const [poolKey, managedPool] of this.pools.entries()) {
      if (managedPool.connection.id === connectionId) {
        return poolKey;
      }
    }
    return connectionId; // Fallback
  }

  /**
   * Get pools for a specific user
   */
  private getUserPools(userId: string): ManagedPool[] {
    return Array.from(this.pools.values()).filter(
      managedPool => managedPool.connection.user_id === userId
    );
  }

  /**
   * Update pool metrics
   */
  private updatePoolMetrics(connectionId: string, managedPool: ManagedPool): void {
    updatePoolMetrics(
      connectionId,
      managedPool.pool.totalCount,
      managedPool.pool.totalCount - managedPool.pool.idleCount,
      managedPool.pool.idleCount,
      managedPool.pool.waitingCount
    );
  }

  /**
   * Shutdown all pools
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    const shutdownPromises = Array.from(this.pools.keys()).map(poolKey => {
      const managedPool = this.pools.get(poolKey);
      return managedPool ? managedPool.pool.end() : Promise.resolve();
    });

    await Promise.allSettled(shutdownPromises);
    this.pools.clear();

    poolLogger.info('Connection pool service shutdown completed');
  }

  /**
   * Health check for all pools
   */
  async healthCheck(): Promise<{ healthy: number; total: number; details: any[] }> {
    const details: any[] = [];
    let healthy = 0;

    for (const [poolKey, managedPool] of this.pools.entries()) {
      try {
        const client = await managedPool.pool.connect();
        await client.query('SELECT 1');
        client.release();
        
        details.push({
          connectionId: managedPool.connection.id,
          status: 'healthy',
          poolSize: managedPool.pool.totalCount,
          activeConnections: managedPool.pool.totalCount - managedPool.pool.idleCount,
        });
        
        healthy++;
      } catch (error) {
        details.push({
          connectionId: managedPool.connection.id,
          status: 'unhealthy',
          error: (error as Error).message,
        });
      }
    }

    return {
      healthy,
      total: this.pools.size,
      details,
    };
  }
}