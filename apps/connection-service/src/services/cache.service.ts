import { createClient, RedisClientType } from 'redis';
import { DatabaseConnection, ConnectionUsageMetrics } from '../types/connection.types';
import { logger, logError } from '../utils/logger';
import { recordCacheOperation } from '../utils/metrics';
import { appConfig } from '../config';

export class CacheService {
  private redis: RedisClientType;
  private isConnected = false;

  constructor() {
    this.redis = createClient({ 
      url: appConfig.redis.url,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500),
      },
    });

    this.redis.on('connect', () => {
      this.isConnected = true;
      logger.info('Redis cache connected');
    });

    this.redis.on('error', (err: Error) => {
      this.isConnected = false;
      logError(logger, 'Redis cache error', err);
    });

    this.redis.on('end', () => {
      this.isConnected = false;
      logger.warn('Redis cache connection ended');
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.redis.connect();
      logger.info('Cache service initialized successfully');
    } catch (error) {
      logError(logger, 'Failed to initialize cache service', error as Error);
      throw error;
    }
  }

  /**
   * Connection caching methods
   */
  async cacheConnection(connection: DatabaseConnection): Promise<void> {
    if (!this.isConnected) return;

    try {
      const key = this.getConnectionKey(connection.id);
      const ttl = appConfig.redis.ttlSeconds;
      
      // Cache without sensitive data
      const cacheData = {
        ...connection,
        password_encrypted: '[REDACTED]', // Don't cache encrypted passwords
      };
      
      await this.redis.setEx(key, ttl, JSON.stringify(cacheData));
      recordCacheOperation('set', 'success');
      
      logger.debug('Connection cached', { connectionId: connection.id });
    } catch (error) {
      recordCacheOperation('set', 'failure');
      logError(logger, 'Failed to cache connection', error as Error, {
        connectionId: connection.id,
      });
    }
  }

  async getCachedConnection(connectionId: string): Promise<DatabaseConnection | null> {
    if (!this.isConnected) return null;

    try {
      const key = this.getConnectionKey(connectionId);
      const cached = await this.redis.get(key);
      
      if (cached) {
        recordCacheOperation('get', 'hit');
        logger.debug('Connection cache hit', { connectionId });
        return JSON.parse(cached) as DatabaseConnection;
      }
      
      recordCacheOperation('get', 'miss');
      return null;
    } catch (error) {
      recordCacheOperation('get', 'failure');
      logError(logger, 'Failed to get cached connection', error as Error, {
        connectionId,
      });
      return null;
    }
  }

  async invalidateConnection(connectionId: string): Promise<void> {
    if (!this.isConnected) return;

    try {
      const key = this.getConnectionKey(connectionId);
      await this.redis.del(key);
      recordCacheOperation('delete', 'success');
      
      logger.debug('Connection cache invalidated', { connectionId });
    } catch (error) {
      recordCacheOperation('delete', 'failure');
      logError(logger, 'Failed to invalidate connection cache', error as Error, {
        connectionId,
      });
    }
  }

  /**
   * Connection list caching
   */
  async cacheConnectionList(userId: string, filters: any, connections: DatabaseConnection[]): Promise<void> {
    if (!this.isConnected) return;

    try {
      const key = this.getConnectionListKey(userId, filters);
      const ttl = 300; // 5 minutes for lists
      
      // Cache without sensitive data
      const cacheData = connections.map(conn => ({
        ...conn,
        password_encrypted: '[REDACTED]',
      }));
      
      await this.redis.setEx(key, ttl, JSON.stringify(cacheData));
      recordCacheOperation('set', 'success');
      
      logger.debug('Connection list cached', { userId, filtersHash: this.hashFilters(filters) });
    } catch (error) {
      recordCacheOperation('set', 'failure');
      logError(logger, 'Failed to cache connection list', error as Error, { userId });
    }
  }

  async getCachedConnectionList(userId: string, filters: any): Promise<DatabaseConnection[] | null> {
    if (!this.isConnected) return null;

    try {
      const key = this.getConnectionListKey(userId, filters);
      const cached = await this.redis.get(key);
      
      if (cached) {
        recordCacheOperation('get', 'hit');
        logger.debug('Connection list cache hit', { userId });
        return JSON.parse(cached) as DatabaseConnection[];
      }
      
      recordCacheOperation('get', 'miss');
      return null;
    } catch (error) {
      recordCacheOperation('get', 'failure');
      logError(logger, 'Failed to get cached connection list', error as Error, { userId });
      return null;
    }
  }

  async invalidateConnectionList(userId: string): Promise<void> {
    if (!this.isConnected) return;

    try {
      const pattern = `conn_list:${userId}:*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(keys);
        recordCacheOperation('delete', 'success');
        logger.debug('Connection list cache invalidated', { userId, keysDeleted: keys.length });
      }
    } catch (error) {
      recordCacheOperation('delete', 'failure');
      logError(logger, 'Failed to invalidate connection list cache', error as Error, { userId });
    }
  }

  /**
   * Usage metrics caching
   */
  async cacheUsageMetrics(connectionId: string, metrics: ConnectionUsageMetrics): Promise<void> {
    if (!this.isConnected) return;

    try {
      const key = this.getUsageMetricsKey(connectionId);
      const ttl = 3600; // 1 hour for metrics
      
      await this.redis.setEx(key, ttl, JSON.stringify(metrics));
      recordCacheOperation('set', 'success');
      
      logger.debug('Usage metrics cached', { connectionId });
    } catch (error) {
      recordCacheOperation('set', 'failure');
      logError(logger, 'Failed to cache usage metrics', error as Error, { connectionId });
    }
  }

  async getCachedUsageMetrics(connectionId: string): Promise<ConnectionUsageMetrics | null> {
    if (!this.isConnected) return null;

    try {
      const key = this.getUsageMetricsKey(connectionId);
      const cached = await this.redis.get(key);
      
      if (cached) {
        recordCacheOperation('get', 'hit');
        return JSON.parse(cached) as ConnectionUsageMetrics;
      }
      
      recordCacheOperation('get', 'miss');
      return null;
    } catch (error) {
      recordCacheOperation('get', 'failure');
      logError(logger, 'Failed to get cached usage metrics', error as Error, { connectionId });
      return null;
    }
  }

  /**
   * Session and temporary data caching
   */
  async cacheTemporary(key: string, data: any, ttlSeconds: number = 300): Promise<void> {
    if (!this.isConnected) return;

    try {
      const fullKey = `temp:${key}`;
      await this.redis.setEx(fullKey, ttlSeconds, JSON.stringify(data));
      recordCacheOperation('set', 'success');
    } catch (error) {
      recordCacheOperation('set', 'failure');
      logError(logger, 'Failed to cache temporary data', error as Error, { key });
    }
  }

  async getTemporary(key: string): Promise<any | null> {
    if (!this.isConnected) return null;

    try {
      const fullKey = `temp:${key}`;
      const cached = await this.redis.get(fullKey);
      
      if (cached) {
        recordCacheOperation('get', 'hit');
        return JSON.parse(cached);
      }
      
      recordCacheOperation('get', 'miss');
      return null;
    } catch (error) {
      recordCacheOperation('get', 'failure');
      logError(logger, 'Failed to get temporary data', error as Error, { key });
      return null;
    }
  }

  async deleteTemporary(key: string): Promise<void> {
    if (!this.isConnected) return;

    try {
      const fullKey = `temp:${key}`;
      await this.redis.del(fullKey);
      recordCacheOperation('delete', 'success');
    } catch (error) {
      recordCacheOperation('delete', 'failure');
      logError(logger, 'Failed to delete temporary data', error as Error, { key });
    }
  }

  /**
   * Rate limiting helpers
   */
  async incrementRateLimit(key: string, windowSeconds: number): Promise<number> {
    if (!this.isConnected) return 0;

    try {
      const fullKey = `rate_limit:${key}`;
      const current = await this.redis.incr(fullKey);
      
      if (current === 1) {
        await this.redis.expire(fullKey, windowSeconds);
      }
      
      return current;
    } catch (error) {
      logError(logger, 'Failed to increment rate limit', error as Error, { key });
      return 0;
    }
  }

  async getRateLimit(key: string): Promise<number> {
    if (!this.isConnected) return 0;

    try {
      const fullKey = `rate_limit:${key}`;
      const current = await this.redis.get(fullKey);
      return current ? parseInt(current, 10) : 0;
    } catch (error) {
      logError(logger, 'Failed to get rate limit', error as Error, { key });
      return 0;
    }
  }

  /**
   * Lock mechanisms for preventing race conditions
   */
  async acquireLock(resource: string, ttlSeconds: number = 30): Promise<string | null> {
    if (!this.isConnected) return null;

    try {
      const lockKey = `lock:${resource}`;
      const lockValue = `${Date.now()}_${Math.random()}`;
      
      const result = await this.redis.set(lockKey, lockValue, {
        EX: ttlSeconds,
        NX: true, // Only set if key doesn't exist
      });
      
      if (result === 'OK') {
        logger.debug('Lock acquired', { resource, lockValue });
        return lockValue;
      }
      
      return null;
    } catch (error) {
      logError(logger, 'Failed to acquire lock', error as Error, { resource });
      return null;
    }
  }

  async releaseLock(resource: string, lockValue: string): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      const lockKey = `lock:${resource}`;
      
      // Lua script to atomically check and delete lock
      const script = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;
      
      const result = await this.redis.eval(script, {
        keys: [lockKey],
        arguments: [lockValue]
      });
      const released = result === 1;
      
      if (released) {
        logger.debug('Lock released', { resource, lockValue });
      }
      
      return released;
    } catch (error) {
      logError(logger, 'Failed to release lock', error as Error, { resource });
      return false;
    }
  }

  /**
   * Cache key generators
   */
  private getConnectionKey(connectionId: string): string {
    return `conn:${connectionId}`;
  }

  private getConnectionListKey(userId: string, filters: any): string {
    const filtersHash = this.hashFilters(filters);
    return `conn_list:${userId}:${filtersHash}`;
  }

  private getUsageMetricsKey(connectionId: string): string {
    return `metrics:${connectionId}`;
  }

  private hashFilters(filters: any): string {
    // Simple hash of filters for cache key
    const str = JSON.stringify(filters);
    let hash = 0;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  /**
   * Cache statistics
   */
  async getCacheStats(): Promise<any> {
    if (!this.isConnected) return null;

    try {
      const info = await this.redis.info('memory');
      const keyspace = await this.redis.info('keyspace');
      
      return {
        connected: this.isConnected,
        memory: info,
        keyspace: keyspace,
      };
    } catch (error) {
      logError(logger, 'Failed to get cache stats', error as Error);
      return null;
    }
  }

  /**
   * Clear all cache (use with caution)
   */
  async clearAll(): Promise<void> {
    if (!this.isConnected) return;

    try {
      await this.redis.flushDb();
      logger.warn('All cache cleared');
    } catch (error) {
      logError(logger, 'Failed to clear cache', error as Error);
    }
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    try {
      await this.redis.quit();
      logger.info('Cache service shutdown completed');
    } catch (error) {
      logError(logger, 'Error during cache service shutdown', error as Error);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      const pong = await this.redis.ping();
      return pong === 'PONG';
    } catch (error) {
      logError(logger, 'Cache health check failed', error as Error);
      return false;
    }
  }
}