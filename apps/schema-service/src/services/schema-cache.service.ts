import { createClient, RedisClientType } from 'redis';
import { createHash } from 'crypto';
import {
  DatabaseSchema,
  SchemaCacheEntry,
  SchemaCacheConfig,
} from '../types/schema.types';
import { schemaConfig } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('SchemaCacheService');

export class SchemaCacheService {
  private client: RedisClientType;
  private config: SchemaCacheConfig;
  private isConnected = false;

  constructor() {
    this.config = schemaConfig.cache_config;
    this.client = createClient({
      url: schemaConfig.redis_url,
      socket: {
        connectTimeout: 10000,
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Connected to Redis');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      logger.error('Redis connection error', error);
      this.isConnected = false;
    });

    this.client.on('end', () => {
      logger.info('Redis connection ended');
      this.isConnected = false;
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
    }
  }

  async get(connectionId: string): Promise<DatabaseSchema | null> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const cacheKey = this.generateCacheKey(connectionId);
      const cachedData = await this.client.get(cacheKey);

      if (!cachedData) {
        logger.debug('Cache miss', { connectionId, cacheKey });
        return null;
      }

      // Update access tracking
      await this.updateAccessTracking(cacheKey);

      const parsed = this.config.enable_compression 
        ? this.decompress(cachedData)
        : JSON.parse(cachedData);

      logger.debug('Cache hit', { connectionId, cacheKey });
      return parsed as DatabaseSchema;
    } catch (error) {
      logger.error('Failed to get from cache', error as Error, { connectionId });
      return null; // Return null on cache errors to allow fallback to discovery
    }
  }

  async set(connectionId: string, schema: DatabaseSchema): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const cacheKey = this.generateCacheKey(connectionId);
      const serialized = this.config.enable_compression
        ? this.compress(schema)
        : JSON.stringify(schema);

      // Set with TTL
      await this.client.setEx(cacheKey, this.config.ttl_seconds, serialized);

      // Create cache entry metadata
      const entryMetadata: SchemaCacheEntry = {
        key: cacheKey,
        connection_id: connectionId,
        schema_data: schema,
        cached_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + this.config.ttl_seconds * 1000).toISOString(),
        access_count: 1,
        last_accessed: new Date().toISOString(),
      };

      // Store metadata separately for cache management
      const metadataKey = `${cacheKey}:meta`;
      await this.client.setEx(
        metadataKey, 
        this.config.ttl_seconds + 300, // Metadata expires 5 minutes after data
        JSON.stringify(entryMetadata)
      );

      logger.debug('Cached schema data', {
        connectionId,
        cacheKey,
        sizeBytes: serialized.length,
        ttlSeconds: this.config.ttl_seconds,
      });

      // Perform cache cleanup if needed
      await this.performCacheCleanup();
    } catch (error) {
      logger.error('Failed to set cache', error as Error, { connectionId });
      // Don't throw error to avoid disrupting the main flow
    }
  }

  async invalidate(connectionId: string): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const cacheKey = this.generateCacheKey(connectionId);
      const metadataKey = `${cacheKey}:meta`;

      await Promise.all([
        this.client.del(cacheKey),
        this.client.del(metadataKey),
      ]);

      logger.info('Invalidated cache', { connectionId, cacheKey });
    } catch (error) {
      logger.error('Failed to invalidate cache', error as Error, { connectionId });
    }
  }

  async invalidateAll(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const pattern = this.generateCacheKey('*');
      const keys = await this.client.keys(pattern);

      if (keys.length > 0) {
        await this.client.del(keys);
        logger.info('Invalidated all cache entries', { keyCount: keys.length });
      }
    } catch (error) {
      logger.error('Failed to invalidate all cache', error as Error);
    }
  }

  async getCacheStats(): Promise<{
    total_entries: number;
    memory_usage_bytes: number;
    hit_rate: number;
    eviction_count: number;
    oldest_entry: string | null;
    newest_entry: string | null;
  }> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const pattern = this.generateCacheKey('*');
      const keys = await this.client.keys(pattern);
      const metadataKeys = keys.filter(key => key.endsWith(':meta'));

      // Get memory usage info (Redis 4.x doesn't have direct memory command)
      const memoryInfo = 0; // Would need to implement custom memory tracking
      
      // Get metadata for all entries to calculate stats
      const metadataPromises = metadataKeys.map(key => 
        this.client.get(key).then(data => data ? JSON.parse(data) : null)
      );
      const allMetadata = (await Promise.all(metadataPromises)).filter(Boolean) as SchemaCacheEntry[];

      // Sort by cached_at to find oldest and newest
      allMetadata.sort((a, b) => new Date(a.cached_at).getTime() - new Date(b.cached_at).getTime());

      return {
        total_entries: keys.length / 2, // Divide by 2 because we have data + metadata keys
        memory_usage_bytes: memoryInfo,
        hit_rate: this.calculateHitRate(allMetadata),
        eviction_count: 0, // Would need to track this separately
        oldest_entry: allMetadata.length > 0 ? allMetadata[0].cached_at : null,
        newest_entry: allMetadata.length > 0 ? allMetadata[allMetadata.length - 1].cached_at : null,
      };
    } catch (error) {
      logger.error('Failed to get cache stats', error as Error);
      return {
        total_entries: 0,
        memory_usage_bytes: 0,
        hit_rate: 0,
        eviction_count: 0,
        oldest_entry: null,
        newest_entry: null,
      };
    }
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latency_ms: number }> {
    try {
      const start = Date.now();
      
      if (!this.isConnected) {
        await this.connect();
      }

      await this.client.ping();
      const latency = Date.now() - start;

      return {
        status: latency < 100 ? 'healthy' : 'unhealthy',
        latency_ms: latency,
      };
    } catch (error) {
      logger.error('Cache health check failed', error as Error);
      return {
        status: 'unhealthy',
        latency_ms: -1,
      };
    }
  }

  private generateCacheKey(connectionId: string): string {
    return `schema:v1:${connectionId}`;
  }

  private async updateAccessTracking(cacheKey: string): Promise<void> {
    try {
      const metadataKey = `${cacheKey}:meta`;
      const metadata = await this.client.get(metadataKey);
      
      if (metadata) {
        const parsed = JSON.parse(metadata) as SchemaCacheEntry;
        parsed.access_count += 1;
        parsed.last_accessed = new Date().toISOString();
        
        // Update metadata with new access info
        await this.client.setEx(
          metadataKey,
          this.config.ttl_seconds + 300,
          JSON.stringify(parsed)
        );
      }
    } catch (error) {
      // Log but don't throw - access tracking is not critical
      logger.debug('Failed to update access tracking', { cacheKey });
    }
  }

  private async performCacheCleanup(): Promise<void> {
    try {
      const stats = await this.getCacheStats();
      
      if (stats.total_entries > this.config.max_entries) {
        logger.info('Starting cache cleanup', { 
          currentEntries: stats.total_entries, 
          maxEntries: this.config.max_entries 
        });
        
        // Implement LRU eviction
        await this.evictLeastRecentlyUsed();
      }
    } catch (error) {
      logger.error('Cache cleanup failed', error as Error);
    }
  }

  private async evictLeastRecentlyUsed(): Promise<void> {
    try {
      const pattern = this.generateCacheKey('*');
      const keys = await this.client.keys(pattern);
      const metadataKeys = keys.filter(key => key.endsWith(':meta'));

      // Get all metadata to find LRU entries
      const metadataPromises = metadataKeys.map(async key => {
        const data = await this.client.get(key);
        return data ? { key, metadata: JSON.parse(data) as SchemaCacheEntry } : null;
      });
      
      const allEntries = (await Promise.all(metadataPromises)).filter(Boolean);
      
      // Sort by last accessed (ascending = least recently used first)
      allEntries.sort((a, b) => 
        new Date(a!.metadata.last_accessed).getTime() - new Date(b!.metadata.last_accessed).getTime()
      );

      // Evict oldest 20% of entries
      const evictCount = Math.ceil(allEntries.length * 0.2);
      const toEvict = allEntries.slice(0, evictCount);

      for (const entry of toEvict) {
        if (entry) {
          const dataKey = entry.key.replace(':meta', '');
          await Promise.all([
            this.client.del(dataKey),
            this.client.del(entry.key),
          ]);
        }
      }

      logger.info('Cache cleanup completed', { evictedEntries: evictCount });
    } catch (error) {
      logger.error('LRU eviction failed', error as Error);
    }
  }

  private calculateHitRate(metadata: SchemaCacheEntry[]): number {
    if (metadata.length === 0) return 0;
    
    const totalAccess = metadata.reduce((sum, entry) => sum + entry.access_count, 0);
    return totalAccess > 0 ? (totalAccess / metadata.length) : 0;
  }

  private compress(data: any): string {
    // Simple JSON compression - in production, consider using a proper compression library
    return JSON.stringify(data);
  }

  private decompress(data: string): any {
    return JSON.parse(data);
  }

  // Utility method to check if caching is enabled and healthy
  async isCacheAvailable(): Promise<boolean> {
    try {
      const health = await this.healthCheck();
      return health.status === 'healthy';
    } catch {
      return false;
    }
  }
}