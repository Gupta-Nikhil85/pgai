import { Pool, Client } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { 
  DatabaseConnection, 
  ConnectionTestRequest, 
  ConnectionTestResult,
  SSHTunnelConfig 
} from '../types/connection.types';
import { decrypt, maskSensitiveData } from '../utils/encryption';
import { connectionLogger, logError, logPerformance } from '../utils/logger';
import { recordConnectionTest, recordError } from '../utils/metrics';
import { appConfig } from '../config';

export class ConnectionTestingService {
  private readonly testCache: Map<string, ConnectionTestResult> = new Map();
  private readonly redis: RedisClientType;

  constructor() {
    // Initialize Redis for caching test results
    this.redis = createClient({ url: appConfig.redis.url });
    this.redis.on('error', (err: Error) => {
      logError(connectionLogger, 'Redis connection error', err);
    });
    this.redis.connect().catch((err: Error) => {
      logError(connectionLogger, 'Failed to connect to Redis', err);
    });
  }

  /**
   * Test database connection
   */
  async testConnection(request: ConnectionTestRequest): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    let connectionConfig: Partial<DatabaseConnection>;

    try {
      // Get connection configuration
      if (request.connection_id) {
        const cacheKey = `test_result:${request.connection_id}`;
        const cachedResult = await this.getCachedTestResult(cacheKey);
        if (cachedResult) {
          connectionLogger.info('Returning cached test result', { 
            connection_id: request.connection_id 
          });
          return cachedResult;
        }
        
        // In a real implementation, would fetch from database
        throw new Error('Connection ID lookup not implemented in this demo');
      } else if (request.connection_config) {
        connectionConfig = request.connection_config;
      } else {
        throw new Error('Either connection_id or connection_config must be provided');
      }

      connectionLogger.info('Testing database connection', {
        host: connectionConfig.host,
        port: connectionConfig.port,
        database: connectionConfig.database,
        connection_type: connectionConfig.connection_type,
      });

      let testResult: ConnectionTestResult;

      // Test based on connection type
      switch (connectionConfig.connection_type) {
        case 'postgresql':
          testResult = await this.testPostgreSQLConnection(connectionConfig);
          break;
        case 'mysql':
          testResult = await this.testMySQLConnection(connectionConfig);
          break;
        case 'sqlite':
          testResult = await this.testSQLiteConnection(connectionConfig);
          break;
        case 'mongodb':
          testResult = await this.testMongoDBConnection(connectionConfig);
          break;
        default:
          throw new Error(`Unsupported connection type: ${connectionConfig.connection_type}`);
      }

      // Cache successful test results
      if (testResult.success && request.connection_id) {
        await this.cacheTestResult(request.connection_id, testResult);
      }

      // Record metrics
      recordConnectionTest(
        connectionConfig.connection_type!,
        testResult.success ? 'success' : 'failure',
        testResult.connection_time_ms / 1000
      );

      logPerformance(
        connectionLogger,
        'Connection test completed',
        Date.now() - startTime,
        {
          success: testResult.success,
          connection_type: connectionConfig.connection_type,
          host: connectionConfig.host,
        }
      );

      return testResult;

    } catch (error) {
      const connectionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logError(connectionLogger, 'Connection test failed', error as Error, {
        connection_config: connectionConfig ? {
          host: connectionConfig.host,
          port: connectionConfig.port,
          database: connectionConfig.database,
          connection_type: connectionConfig.connection_type,
        } : undefined,
      });

      recordConnectionTest(
        connectionConfig?.connection_type || 'unknown',
        'failure',
        connectionTime / 1000
      );

      recordError('connection_test_error', 'test_connection');

      return {
        success: false,
        connection_time_ms: connectionTime,
        error_message: errorMessage,
        error_code: this.getErrorCode(error as Error),
        tested_at: new Date().toISOString(),
      };
    }
  }

  /**
   * Test PostgreSQL connection
   */
  private async testPostgreSQLConnection(config: Partial<DatabaseConnection>): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    let client: Client | null = null;

    try {
      // Build connection configuration
      const connectionConfig = {
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password_encrypted ? decrypt(JSON.parse(config.password_encrypted)) : '',
        ssl: config.ssl_enabled ? (config.ssl_config || true) : false,
        connectionTimeoutMillis: appConfig.connections.testTimeoutMs,
        ...config.connection_options,
      };

      client = new Client(connectionConfig);
      await client.connect();

      // Test basic query
      const versionResult = await client.query('SELECT version() as version');
      const databaseVersion = versionResult.rows[0]?.version || 'Unknown';

      // Get additional connection details
      const protocolResult = await client.query('SHOW server_version_num');
      const protocolVersion = parseInt(protocolResult.rows[0]?.server_version_num || '0');

      // Get available schemas
      const schemasResult = await client.query(`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        ORDER BY schema_name
      `);
      const availableSchemas = schemasResult.rows.map(row => row.schema_name);

      // Get database size
      const sizeResult = await client.query(`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `);
      const databaseSize = sizeResult.rows[0]?.size || 'Unknown';

      const connectionTime = Date.now() - startTime;

      return {
        success: true,
        connection_time_ms: connectionTime,
        database_version: databaseVersion,
        tested_at: new Date().toISOString(),
        connection_details: {
          server_version: databaseVersion,
          protocol_version: protocolVersion,
          database_size: databaseSize,
          available_schemas: availableSchemas,
        },
      };

    } finally {
      if (client) {
        try {
          await client.end();
        } catch (error) {
          connectionLogger.warn('Error closing test connection', { error: (error as Error).message });
        }
      }
    }
  }

  /**
   * Test MySQL connection (placeholder implementation)
   */
  private async testMySQLConnection(config: Partial<DatabaseConnection>): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    
    // For demo purposes, simulate a MySQL connection test
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      success: true,
      connection_time_ms: Date.now() - startTime,
      database_version: 'MySQL 8.0.33 (simulated)',
      tested_at: new Date().toISOString(),
      connection_details: {
        server_version: 'MySQL 8.0.33',
        protocol_version: 10,
        database_size: 'Unknown',
        available_schemas: ['mysql', 'information_schema', 'performance_schema'],
      },
    };
  }

  /**
   * Test SQLite connection (placeholder implementation)
   */
  private async testSQLiteConnection(config: Partial<DatabaseConnection>): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    
    // For demo purposes, simulate a SQLite connection test
    await new Promise(resolve => setTimeout(resolve, 50));
    
    return {
      success: true,
      connection_time_ms: Date.now() - startTime,
      database_version: 'SQLite 3.42.0 (simulated)',
      tested_at: new Date().toISOString(),
      connection_details: {
        server_version: 'SQLite 3.42.0',
        protocol_version: 1,
        database_size: 'Unknown',
        available_schemas: ['main'],
      },
    };
  }

  /**
   * Test MongoDB connection (placeholder implementation)
   */
  private async testMongoDBConnection(config: Partial<DatabaseConnection>): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    
    // For demo purposes, simulate a MongoDB connection test
    await new Promise(resolve => setTimeout(resolve, 150));
    
    return {
      success: true,
      connection_time_ms: Date.now() - startTime,
      database_version: 'MongoDB 7.0.4 (simulated)',
      tested_at: new Date().toISOString(),
      connection_details: {
        server_version: 'MongoDB 7.0.4',
        protocol_version: 1,
        database_size: 'Unknown',
        available_schemas: ['admin', 'config', 'local'],
      },
    };
  }

  /**
   * Test connection with SSH tunnel
   */
  async testConnectionWithSSHTunnel(
    connectionConfig: Partial<DatabaseConnection>,
    sshConfig: SSHTunnelConfig
  ): Promise<ConnectionTestResult> {
    if (!sshConfig.enabled || !appConfig.sshTunnel.enabled) {
      return await this.testConnection({ connection_config: connectionConfig });
    }

    // SSH tunnel implementation would go here
    // For now, return a simulated result
    connectionLogger.info('SSH tunnel testing not implemented in demo version');
    
    return {
      success: false,
      connection_time_ms: 0,
      error_message: 'SSH tunnel testing not implemented in demo version',
      error_code: 'SSH_NOT_IMPLEMENTED',
      tested_at: new Date().toISOString(),
    };
  }

  /**
   * Batch test multiple connections
   */
  async batchTestConnections(requests: ConnectionTestRequest[]): Promise<ConnectionTestResult[]> {
    connectionLogger.info('Starting batch connection tests', { count: requests.length });
    
    const results = await Promise.allSettled(
      requests.map(request => this.testConnection(request))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        logError(connectionLogger, `Batch test failed for request ${index}`, result.reason);
        return {
          success: false,
          connection_time_ms: 0,
          error_message: result.reason?.message || 'Unknown error',
          error_code: 'BATCH_TEST_FAILED',
          tested_at: new Date().toISOString(),
        };
      }
    });
  }

  /**
   * Get cached test result
   */
  private async getCachedTestResult(cacheKey: string): Promise<ConnectionTestResult | null> {
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ConnectionTestResult;
      }
    } catch (error) {
      connectionLogger.warn('Failed to get cached test result', { 
        cacheKey,
        error: (error as Error).message 
      });
    }
    return null;
  }

  /**
   * Cache test result
   */
  private async cacheTestResult(connectionId: string, result: ConnectionTestResult): Promise<void> {
    try {
      const cacheKey = `test_result:${connectionId}`;
      await this.redis.setEx(
        cacheKey,
        300, // 5 minutes TTL
        JSON.stringify(result)
      );
    } catch (error) {
      connectionLogger.warn('Failed to cache test result', { 
        connectionId,
        error: (error as Error).message 
      });
    }
  }

  /**
   * Get error code from error
   */
  private getErrorCode(error: Error): string {
    if (error.message.includes('ECONNREFUSED')) return 'CONNECTION_REFUSED';
    if (error.message.includes('ENOTFOUND')) return 'HOST_NOT_FOUND';
    if (error.message.includes('ETIMEDOUT')) return 'CONNECTION_TIMEOUT';
    if (error.message.includes('authentication')) return 'AUTHENTICATION_FAILED';
    if (error.message.includes('database') && error.message.includes('does not exist')) return 'DATABASE_NOT_FOUND';
    if (error.message.includes('permission')) return 'PERMISSION_DENIED';
    return 'UNKNOWN_ERROR';
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    try {
      await this.redis.quit();
      connectionLogger.info('Connection testing service shutdown completed');
    } catch (error) {
      logError(connectionLogger, 'Error during connection testing service shutdown', error as Error);
    }
  }
}