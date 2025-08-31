import { Pool, PoolClient } from 'pg';
import { appConfig } from '../config';
import { logger, logError } from '../utils/logger';
import { 
  DatabaseConnection, 
  ConnectionEvent, 
  ConnectionSecret, 
  ConnectionHealthCheck,
  ConnectionUsageMetrics 
} from '../types/connection.types';

export class DatabaseService {
  private pool: Pool;
  private isInitialized = false;

  constructor() {
    this.pool = new Pool({
      connectionString: appConfig.database.url,
      min: appConfig.database.pool.min,
      max: appConfig.database.pool.max,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.pool.on('error', (err) => {
      logError(logger, 'Database pool error', err);
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.createTables();
      this.isInitialized = true;
      logger.info('Database service initialized successfully');
    } catch (error) {
      logError(logger, 'Failed to initialize database service', error as Error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Connections table already exists, skip creation
      // The existing connections table has the schema we need

      // Create connection_events table
      await client.query(`
        CREATE TABLE IF NOT EXISTS connection_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
          event_type VARCHAR(50) NOT NULL,
          event_data JSONB DEFAULT '{}',
          user_id UUID NOT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          ip_address INET,
          user_agent TEXT
        )
      `);

      // Create connection_secrets table
      await client.query(`
        CREATE TABLE IF NOT EXISTS connection_secrets (
          connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
          secret_type VARCHAR(50) NOT NULL,
          encrypted_value TEXT NOT NULL,
          encryption_algorithm VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP,
          PRIMARY KEY (connection_id, secret_type)
        )
      `);

      // Create connection_health_checks table
      await client.query(`
        CREATE TABLE IF NOT EXISTS connection_health_checks (
          connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
          status VARCHAR(20) NOT NULL,
          response_time_ms INTEGER NOT NULL,
          last_check_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          error_message TEXT,
          consecutive_failures INTEGER DEFAULT 0,
          next_check_at TIMESTAMP NOT NULL,
          PRIMARY KEY (connection_id)
        )
      `);

      // Create connection_usage_metrics table
      await client.query(`
        CREATE TABLE IF NOT EXISTS connection_usage_metrics (
          connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
          total_queries INTEGER DEFAULT 0,
          avg_query_time_ms DECIMAL DEFAULT 0,
          active_connections INTEGER DEFAULT 0,
          peak_connections INTEGER DEFAULT 0,
          error_count INTEGER DEFAULT 0,
          last_24h_usage JSONB DEFAULT '{"queries": 0, "errors": 0, "avg_response_time_ms": 0}',
          uptime_percentage DECIMAL DEFAULT 100,
          collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (connection_id)
        )
      `);

      // Create indexes (only for tables we created, not the existing connections table)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_connection_events_connection_id ON connection_events(connection_id);
        CREATE INDEX IF NOT EXISTS idx_connection_events_timestamp ON connection_events(timestamp);
        CREATE INDEX IF NOT EXISTS idx_connection_health_checks_next_check ON connection_health_checks(next_check_at);
      `);

      await client.query('COMMIT');
      logger.info('Database tables created successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Connection CRUD operations
  async createConnection(connection: Omit<DatabaseConnection, 'created_at' | 'updated_at'>): Promise<DatabaseConnection> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        INSERT INTO connections (
          id, user_id, team_id, name, description, connection_type,
          host, port, database_name, username, password_encrypted,
          ssl_enabled, ssl_config, connection_options, tags, status,
          connection_pool_config
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *, created_at, updated_at
      `;
      
      const values = [
        connection.id,
        connection.user_id,
        connection.team_id,
        connection.name,
        connection.description,
        connection.connection_type,
        connection.host,
        connection.port,
        connection.database,
        connection.username,
        connection.password_encrypted,
        connection.ssl_enabled,
        JSON.stringify(connection.ssl_config),
        JSON.stringify(connection.connection_options),
        connection.tags,
        connection.status,
        JSON.stringify(connection.connection_pool_config),
      ];
      
      const result = await client.query(query, values);
      return this.mapDbRowToConnection(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async getConnection(id: string, userId: string): Promise<DatabaseConnection | null> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      
      return result.rows.length > 0 ? this.mapDbRowToConnection(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async updateConnection(id: string, userId: string, updates: Partial<DatabaseConnection>): Promise<DatabaseConnection | null> {
    const client = await this.pool.connect();
    
    try {
      const setClause = [];
      const values = [];
      let paramCount = 1;

      // Build dynamic update query
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'id' || key === 'user_id' || key === 'created_at') continue;
        
        setClause.push(`${key === 'database' ? 'database_name' : key} = $${paramCount}`);
        
        if (key === 'ssl_config' || key === 'connection_options' || key === 'connection_pool_config') {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
        paramCount++;
      }

      if (setClause.length === 0) {
        return await this.getConnection(id, userId);
      }

      setClause.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id, userId);

      const query = `
        UPDATE connections 
        SET ${setClause.join(', ')}
        WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
        RETURNING *, created_at, updated_at
      `;

      const result = await client.query(query, values);
      return result.rows.length > 0 ? this.mapDbRowToConnection(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async deleteConnection(id: string, userId: string): Promise<boolean> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'DELETE FROM connections WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      
      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  async listConnections(
    userId: string,
    filters: {
      teamId?: string;
      connectionType?: string;
      status?: string;
      search?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<DatabaseConnection[]> {
    const client = await this.pool.connect();
    
    try {
      const conditions = ['user_id = $1'];
      const values: any[] = [userId];
      let paramCount = 2;

      if (filters.teamId) {
        conditions.push(`team_id = $${paramCount}`);
        values.push(filters.teamId);
        paramCount++;
      }

      if (filters.connectionType) {
        conditions.push(`connection_type = $${paramCount}`);
        values.push(filters.connectionType);
        paramCount++;
      }

      if (filters.status) {
        conditions.push(`status = $${paramCount}`);
        values.push(filters.status);
        paramCount++;
      }

      if (filters.search) {
        conditions.push(`(name ILIKE $${paramCount} OR description ILIKE $${paramCount})`);
        values.push(`%${filters.search}%`);
        paramCount++;
      }

      const query = `
        SELECT * FROM connections 
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `;

      values.push(filters.limit || 50, filters.offset || 0);

      const result = await client.query(query, values);
      return result.rows.map(row => this.mapDbRowToConnection(row));
    } finally {
      client.release();
    }
  }

  // Event logging
  async logConnectionEvent(event: Omit<ConnectionEvent, 'id'>): Promise<ConnectionEvent> {
    const client = await this.pool.connect();
    
    try {
      const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      
      const query = `
        INSERT INTO connection_events (
          id, connection_id, event_type, event_data, user_id, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *, timestamp
      `;
      
      const values = [
        eventId,
        event.connection_id,
        event.event_type,
        JSON.stringify(event.event_data),
        event.user_id,
        event.ip_address,
        event.user_agent,
      ];
      
      const result = await client.query(query, values);
      return {
        id: result.rows[0].id,
        connection_id: result.rows[0].connection_id,
        event_type: result.rows[0].event_type,
        event_data: result.rows[0].event_data,
        user_id: result.rows[0].user_id,
        timestamp: result.rows[0].timestamp.toISOString(),
        ip_address: result.rows[0].ip_address,
        user_agent: result.rows[0].user_agent,
      };
    } finally {
      client.release();
    }
  }

  // Health check operations
  async updateHealthCheck(healthCheck: ConnectionHealthCheck): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        INSERT INTO connection_health_checks (
          connection_id, status, response_time_ms, error_message, 
          consecutive_failures, next_check_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (connection_id) 
        DO UPDATE SET 
          status = EXCLUDED.status,
          response_time_ms = EXCLUDED.response_time_ms,
          last_check_at = CURRENT_TIMESTAMP,
          error_message = EXCLUDED.error_message,
          consecutive_failures = EXCLUDED.consecutive_failures,
          next_check_at = EXCLUDED.next_check_at
      `;
      
      const values = [
        healthCheck.connection_id,
        healthCheck.status,
        healthCheck.response_time_ms,
        healthCheck.error_message,
        healthCheck.consecutive_failures,
        new Date(healthCheck.next_check_at),
      ];
      
      await client.query(query, values);
    } finally {
      client.release();
    }
  }

  async getHealthChecks(): Promise<ConnectionHealthCheck[]> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query('SELECT * FROM connection_health_checks');
      return result.rows.map(row => ({
        connection_id: row.connection_id,
        status: row.status,
        response_time_ms: row.response_time_ms,
        last_check_at: row.last_check_at.toISOString(),
        error_message: row.error_message,
        consecutive_failures: row.consecutive_failures,
        next_check_at: row.next_check_at.toISOString(),
      }));
    } finally {
      client.release();
    }
  }

  private mapDbRowToConnection(row: any): DatabaseConnection {
    return {
      id: row.id,
      user_id: row.user_id,
      team_id: row.team_id,
      name: row.name,
      description: row.description,
      connection_type: row.connection_type,
      host: row.host,
      port: row.port,
      database: row.database_name,
      username: row.username,
      password_encrypted: row.password_encrypted,
      ssl_enabled: row.ssl_enabled,
      ssl_config: row.ssl_config,
      connection_options: row.connection_options,
      tags: row.tags,
      status: row.status,
      last_tested_at: row.last_tested_at?.toISOString(),
      last_used_at: row.last_used_at?.toISOString(),
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      connection_pool_config: row.connection_pool_config,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database service closed');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch (error) {
      logError(logger, 'Database health check failed', error as Error);
      return false;
    }
  }
}