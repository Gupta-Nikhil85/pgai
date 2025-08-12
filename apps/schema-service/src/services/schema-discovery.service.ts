import { Pool } from 'pg';
import { createHash } from 'crypto';
import {
  DatabaseSchema,
  SchemaObject,
  Column,
  Constraint,
  Index,
  Relationship,
  ObjectMetadata,
  SchemaDiscoveryRequest,
  SchemaDiscoveryError,
  SchemaDiscoveryMetrics,
} from '../types/schema.types';
import { createLogger } from '../utils/logger';

const logger = createLogger('SchemaDiscoveryService');

export class SchemaDiscoveryService {
  private connectionPools = new Map<string, Pool>();

  async discoverSchema(request: SchemaDiscoveryRequest): Promise<DatabaseSchema> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting schema discovery', { 
        connectionId: request.connection_id,
        forceRefresh: request.force_refresh 
      });

      const pool = await this.getConnectionPool(request.connection_id);
      
      // Parallel discovery of different object types
      const [tables, views, functions, types, relationships] = await Promise.all([
        this.discoverTables(pool, request),
        this.discoverViews(pool, request),
        request.include_functions ? this.discoverFunctions(pool, request) : Promise.resolve([]),
        request.include_types ? this.discoverTypes(pool, request) : Promise.resolve([]),
        this.discoverRelationships(pool, request),
      ]);

      const allObjects = [...tables, ...views, ...functions, ...types];
      const discoveryDuration = Date.now() - startTime;

      const schema: DatabaseSchema = {
        connection_id: request.connection_id,
        schemas: allObjects,
        relationships,
        last_updated: new Date().toISOString(),
        version_hash: this.generateVersionHash(allObjects, relationships),
        discovery_duration_ms: discoveryDuration,
        object_count: {
          tables: tables.length,
          views: views.length,
          functions: functions.length,
          types: types.length,
        },
      };

      logger.info('Schema discovery completed', {
        connectionId: request.connection_id,
        duration: discoveryDuration,
        objectCount: schema.object_count,
      });

      return schema;
    } catch (error) {
      logger.error('Schema discovery failed', error as Error, {
        connectionId: request.connection_id,
        duration: Date.now() - startTime,
      });
      
      throw this.createSchemaError('INTERNAL_ERROR', 'Schema discovery failed', {
        connection_id: request.connection_id,
        original_error: error,
      });
    }
  }

  private async discoverTables(pool: Pool, request: SchemaDiscoveryRequest): Promise<SchemaObject[]> {
    const query = `
      SELECT 
        t.table_schema,
        t.table_name,
        t.table_type,
        obj_description(c.oid) as table_comment,
        pg_size_pretty(pg_total_relation_size(c.oid)) as size,
        pg_stat_get_tuples_inserted(c.oid) + pg_stat_get_tuples_updated(c.oid) + pg_stat_get_tuples_deleted(c.oid) as activity,
        EXTRACT(EPOCH FROM NOW() - pg_stat_get_last_autoanalyze_time(c.oid)) as last_analyzed
      FROM information_schema.tables t
      LEFT JOIN pg_class c ON c.relname = t.table_name
      LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
      WHERE t.table_type = 'BASE TABLE'
        AND t.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        ${request.include_system_schemas ? '' : "AND t.table_schema NOT LIKE 'pg_%'"}
      ORDER BY t.table_schema, t.table_name;
    `;

    const result = await pool.query(query);
    const tables: SchemaObject[] = [];

    for (const row of result.rows) {
      const columns = await this.discoverTableColumns(pool, row.table_schema, row.table_name);
      const constraints = await this.discoverTableConstraints(pool, row.table_schema, row.table_name);
      const indexes = await this.discoverTableIndexes(pool, row.table_schema, row.table_name);

      tables.push({
        type: 'table',
        schema: row.table_schema,
        name: row.table_name,
        columns,
        constraints,
        indexes,
        metadata: {
          owner: '', // Will be populated separately if needed
          created_at: null,
          updated_at: null,
          size_bytes: null,
          row_count: null,
          description: row.table_comment,
          tags: [],
          is_postgrest_enabled: this.isPostgRESTEnabled(row.table_schema, row.table_name),
        },
      });
    }

    return tables;
  }

  private async discoverTableColumns(pool: Pool, schemaName: string, tableName: string): Promise<Column[]> {
    const query = `
      SELECT 
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.ordinal_position,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        col_description(pgc.oid, c.ordinal_position) as column_comment,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
        CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as is_foreign_key,
        CASE WHEN uk.column_name IS NOT NULL THEN true ELSE false END as is_unique
      FROM information_schema.columns c
      LEFT JOIN pg_class pgc ON pgc.relname = c.table_name
      LEFT JOIN pg_namespace pgn ON pgn.oid = pgc.relnamespace AND pgn.nspname = c.table_schema
      LEFT JOIN (
        SELECT kcu.column_name, kcu.table_name, kcu.table_schema
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
      ) pk ON pk.column_name = c.column_name AND pk.table_name = c.table_name AND pk.table_schema = c.table_schema
      LEFT JOIN (
        SELECT kcu.column_name, kcu.table_name, kcu.table_schema
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
      ) fk ON fk.column_name = c.column_name AND fk.table_name = c.table_name AND fk.table_schema = c.table_schema
      LEFT JOIN (
        SELECT kcu.column_name, kcu.table_name, kcu.table_schema
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'UNIQUE'
      ) uk ON uk.column_name = c.column_name AND uk.table_name = c.table_name AND uk.table_schema = c.table_schema
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position;
    `;

    const result = await pool.query(query, [schemaName, tableName]);
    
    return result.rows.map(row => ({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
      default_value: row.column_default,
      is_primary_key: row.is_primary_key,
      is_foreign_key: row.is_foreign_key,
      is_unique: row.is_unique,
      description: row.column_comment,
      ordinal_position: row.ordinal_position,
      character_maximum_length: row.character_maximum_length,
      numeric_precision: row.numeric_precision,
      numeric_scale: row.numeric_scale,
    }));
  }

  private async discoverTableConstraints(pool: Pool, schemaName: string, tableName: string): Promise<Constraint[]> {
    const query = `
      SELECT 
        tc.constraint_name,
        tc.constraint_type,
        string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) as columns,
        ccu.table_schema as referenced_table_schema,
        ccu.table_name as referenced_table,
        string_agg(ccu.column_name, ',' ORDER BY kcu.ordinal_position) as referenced_columns,
        cc.check_clause
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      LEFT JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
      WHERE tc.table_schema = $1 AND tc.table_name = $2
      GROUP BY tc.constraint_name, tc.constraint_type, ccu.table_schema, ccu.table_name, cc.check_clause;
    `;

    const result = await pool.query(query, [schemaName, tableName]);
    
    return result.rows.map(row => ({
      name: row.constraint_name,
      type: row.constraint_type.toLowerCase().replace(' ', '_') as any,
      columns: row.columns ? row.columns.split(',') : [],
      referenced_table: row.referenced_table,
      referenced_columns: row.referenced_columns ? row.referenced_columns.split(',') : [],
      definition: row.check_clause,
    }));
  }

  private async discoverTableIndexes(pool: Pool, schemaName: string, tableName: string): Promise<Index[]> {
    const query = `
      SELECT 
        i.relname as index_name,
        string_agg(a.attname, ',' ORDER BY a.attnum) as columns,
        ix.indisunique as is_unique,
        ix.indisprimary as is_primary,
        am.amname as index_type,
        pg_get_indexdef(i.oid) as definition
      FROM pg_class t
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_am am ON i.relam = am.oid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE n.nspname = $1 AND t.relname = $2
      GROUP BY i.relname, ix.indisunique, ix.indisprimary, am.amname, i.oid
      ORDER BY i.relname;
    `;

    const result = await pool.query(query, [schemaName, tableName]);
    
    return result.rows.map(row => ({
      name: row.index_name,
      columns: row.columns.split(','),
      is_unique: row.is_unique,
      is_primary: row.is_primary,
      index_type: row.index_type,
      definition: row.definition,
    }));
  }

  private async discoverViews(pool: Pool, request: SchemaDiscoveryRequest): Promise<SchemaObject[]> {
    const query = `
      SELECT 
        v.table_schema,
        v.table_name,
        v.view_definition,
        obj_description(c.oid) as view_comment
      FROM information_schema.views v
      LEFT JOIN pg_class c ON c.relname = v.table_name
      LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = v.table_schema
      WHERE v.table_schema NOT IN ('information_schema', 'pg_catalog')
        ${request.include_system_schemas ? '' : "AND v.table_schema NOT LIKE 'pg_%'"}
      ORDER BY v.table_schema, v.table_name;
    `;

    const result = await pool.query(query);
    const views: SchemaObject[] = [];

    for (const row of result.rows) {
      const columns = await this.discoverTableColumns(pool, row.table_schema, row.table_name);

      views.push({
        type: 'view',
        schema: row.table_schema,
        name: row.table_name,
        columns,
        constraints: [],
        indexes: [],
        metadata: {
          owner: '',
          created_at: null,
          updated_at: null,
          size_bytes: null,
          row_count: null,
          description: row.view_comment,
          tags: [],
          is_postgrest_enabled: this.isPostgRESTEnabled(row.table_schema, row.table_name),
        },
      });
    }

    return views;
  }

  private async discoverFunctions(pool: Pool, request: SchemaDiscoveryRequest): Promise<SchemaObject[]> {
    const query = `
      SELECT 
        n.nspname as schema_name,
        p.proname as function_name,
        pg_get_function_result(p.oid) as return_type,
        pg_get_function_arguments(p.oid) as arguments,
        obj_description(p.oid) as function_comment,
        l.lanname as language
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog')
        ${request.include_system_schemas ? '' : "AND n.nspname NOT LIKE 'pg_%'"}
        AND p.prokind = 'f'
      ORDER BY n.nspname, p.proname;
    `;

    const result = await pool.query(query);
    
    return result.rows.map(row => ({
      type: 'function' as const,
      schema: row.schema_name,
      name: row.function_name,
      columns: [], // Functions don't have columns in the traditional sense
      constraints: [],
      indexes: [],
      metadata: {
        owner: '',
        created_at: null,
        updated_at: null,
        size_bytes: null,
        row_count: null,
        description: row.function_comment,
        tags: [`language:${row.language}`, `returns:${row.return_type}`],
        is_postgrest_enabled: this.isPostgRESTEnabled(row.schema_name, row.function_name),
      },
    }));
  }

  private async discoverTypes(pool: Pool, request: SchemaDiscoveryRequest): Promise<SchemaObject[]> {
    const query = `
      SELECT 
        n.nspname as schema_name,
        t.typname as type_name,
        t.typtype as type_type,
        obj_description(t.oid) as type_comment
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog')
        ${request.include_system_schemas ? '' : "AND n.nspname NOT LIKE 'pg_%'"}
        AND t.typtype IN ('e', 'c', 'd') -- enum, composite, domain
      ORDER BY n.nspname, t.typname;
    `;

    const result = await pool.query(query);
    
    return result.rows.map(row => ({
      type: 'type' as const,
      schema: row.schema_name,
      name: row.type_name,
      columns: [],
      constraints: [],
      indexes: [],
      metadata: {
        owner: '',
        created_at: null,
        updated_at: null,
        size_bytes: null,
        row_count: null,
        description: row.type_comment,
        tags: [`type:${row.type_type}`],
        is_postgrest_enabled: false,
      },
    }));
  }

  private async discoverRelationships(pool: Pool, request: SchemaDiscoveryRequest): Promise<Relationship[]> {
    const query = `
      SELECT 
        tc.table_schema as from_schema,
        tc.table_name as from_table,
        string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) as from_columns,
        ccu.table_schema as to_schema,
        ccu.table_name as to_table,
        string_agg(ccu.column_name, ',' ORDER BY kcu.ordinal_position) as to_columns,
        tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema NOT IN ('information_schema', 'pg_catalog')
        ${request.include_system_schemas ? '' : "AND tc.table_schema NOT LIKE 'pg_%'"}
      GROUP BY tc.table_schema, tc.table_name, ccu.table_schema, ccu.table_name, tc.constraint_name;
    `;

    const result = await pool.query(query);
    
    return result.rows.map(row => ({
      from_schema: row.from_schema,
      from_table: row.from_table,
      from_columns: row.from_columns.split(','),
      to_schema: row.to_schema,
      to_table: row.to_table,
      to_columns: row.to_columns.split(','),
      relationship_type: 'one_to_many' as const, // Simplified for now
      constraint_name: row.constraint_name,
    }));
  }

  private async getConnectionPool(connectionId: string): Promise<Pool> {
    if (!this.connectionPools.has(connectionId)) {
      // In a real implementation, we would fetch connection details from the connection service
      // For now, using the default database connection
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
      
      this.connectionPools.set(connectionId, pool);
    }
    
    return this.connectionPools.get(connectionId)!;
  }

  private isPostgRESTEnabled(schemaName: string, objectName: string): boolean {
    // This would integrate with PostgREST configuration
    // For now, return true for public schema objects
    return schemaName === 'public';
  }

  private generateVersionHash(objects: SchemaObject[], relationships: Relationship[]): string {
    const content = JSON.stringify({ objects: objects.length, relationships: relationships.length, timestamp: Date.now() });
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  private createSchemaError(code: string, message: string, details?: any): SchemaDiscoveryError {
    const error = new Error(message) as SchemaDiscoveryError;
    error.code = code as any;
    error.details = details;
    return error;
  }

  async getDiscoveryMetrics(connectionId: string): Promise<SchemaDiscoveryMetrics> {
    // This would be implemented with actual metrics collection
    return {
      connection_id: connectionId,
      discovery_duration_ms: 0,
      object_counts: {},
      cache_hit_rate: 0,
      error_count: 0,
      last_discovery: new Date().toISOString(),
      average_discovery_time: 0,
    };
  }

  async closeConnectionPools(): Promise<void> {
    for (const [connectionId, pool] of this.connectionPools) {
      await pool.end();
      logger.info('Closed connection pool', { connectionId });
    }
    this.connectionPools.clear();
  }
}