// Schema Discovery Types - Based on feature.md specifications

export interface DatabaseSchema {
  connection_id: string;
  schemas: SchemaObject[];
  relationships: Relationship[];
  last_updated: string;
  version_hash: string;
  discovery_duration_ms: number;
  object_count: {
    tables: number;
    views: number;
    functions: number;
    types: number;
  };
}

export interface SchemaObject {
  type: 'table' | 'view' | 'function' | 'type' | 'sequence' | 'index';
  schema: string;
  name: string;
  columns: Column[];
  constraints: Constraint[];
  indexes: Index[];
  metadata: ObjectMetadata;
  postgrest_config?: PostgRESTConfig;
}

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  default_value: string | null;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  is_unique: boolean;
  description: string | null;
  ordinal_position: number;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
}

export interface Constraint {
  name: string;
  type: 'primary_key' | 'foreign_key' | 'unique' | 'check' | 'not_null';
  columns: string[];
  referenced_table?: string;
  referenced_columns?: string[];
  definition?: string;
}

export interface Index {
  name: string;
  columns: string[];
  is_unique: boolean;
  is_primary: boolean;
  index_type: string;
  definition: string;
}

export interface Relationship {
  from_schema: string;
  from_table: string;
  from_columns: string[];
  to_schema: string;
  to_table: string;
  to_columns: string[];
  relationship_type: 'one_to_one' | 'one_to_many' | 'many_to_many';
  constraint_name: string;
}

export interface ObjectMetadata {
  owner: string;
  created_at: string | null;
  updated_at: string | null;
  size_bytes: number | null;
  row_count: number | null;
  description: string | null;
  tags: string[];
  is_postgrest_enabled: boolean;
}

export interface PostgRESTConfig {
  exposed: boolean;
  path: string;
  methods: string[];
  role_permissions: Record<string, string[]>;
}

// Schema Discovery Request/Response Types
export interface SchemaDiscoveryRequest {
  connection_id: string;
  force_refresh?: boolean;
  include_system_schemas?: boolean;
  include_functions?: boolean;
  include_types?: boolean;
}

export interface SchemaDiscoveryResponse {
  success: boolean;
  data?: DatabaseSchema;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta: {
    timestamp: string;
    duration_ms: number;
    from_cache: boolean;
    request_id: string;
    version: string;
  };
}

// Schema Change Detection Types
export interface SchemaChange {
  id: string;
  connection_id: string;
  change_type: 'addition' | 'modification' | 'removal';
  object_type: 'table' | 'view' | 'function' | 'type' | 'column' | 'constraint' | 'index';
  object_identifier: string;
  old_definition?: any;
  new_definition?: any;
  impact_level: 'breaking' | 'potentially_breaking' | 'non_breaking';
  detected_at: string;
  reviewed: boolean;
  reviewed_by?: string;
  reviewed_at?: string;
}

export interface SchemaChangeNotification {
  connection_id: string;
  team_id: string;
  changes: SchemaChange[];
  notification_type: 'real_time' | 'summary' | 'alert';
  created_at: string;
}

// Cache Management Types
export interface SchemaCacheEntry {
  key: string;
  connection_id: string;
  schema_data: DatabaseSchema;
  cached_at: string;
  expires_at: string;
  access_count: number;
  last_accessed: string;
}

export interface SchemaCacheConfig {
  ttl_seconds: number;
  max_entries: number;
  enable_compression: boolean;
  eviction_policy: 'lru' | 'lfu' | 'ttl';
}

// Search and Filter Types
export interface SchemaSearchRequest {
  connection_id: string;
  query: string;
  object_types?: ('table' | 'view' | 'function' | 'type')[];
  schemas?: string[];
  limit?: number;
  offset?: number;
}

export interface SchemaSearchResult {
  object: SchemaObject;
  relevance_score: number;
  match_type: 'name' | 'description' | 'column' | 'tag';
  match_details: string[];
}

export interface SchemaSearchResponse {
  results: SchemaSearchResult[];
  total_count: number;
  facets: {
    object_types: Record<string, number>;
    schemas: Record<string, number>;
  };
  suggestions: string[];
}

// Performance and Monitoring Types
export interface SchemaDiscoveryMetrics {
  connection_id: string;
  discovery_duration_ms: number;
  object_counts: Record<string, number>;
  cache_hit_rate: number;
  error_count: number;
  last_discovery: string;
  average_discovery_time: number;
}

export interface SchemaServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database_connection: boolean;
  redis_connection: boolean;
  active_discoveries: number;
  cache_size: number;
  memory_usage_mb: number;
  uptime_seconds: number;
}

// Error Types
export interface SchemaDiscoveryError extends Error {
  code: 'CONNECTION_FAILED' | 'QUERY_TIMEOUT' | 'PERMISSION_DENIED' | 'INVALID_SCHEMA' | 'CACHE_ERROR' | 'INTERNAL_ERROR';
  connection_id?: string;
  query?: string;
  details?: any;
}

// Configuration Types
export interface SchemaServiceConfig {
  port: number;
  host: string;
  database_url: string;
  redis_url: string;
  cache_config: SchemaCacheConfig;
  discovery_config: {
    default_timeout_ms: number;
    max_concurrent_discoveries: number;
    include_system_schemas: boolean;
    enable_change_detection: boolean;
    refresh_interval_ms: number;
  };
  security_config: {
    enable_authentication: boolean;
    jwt_secret: string;
    rate_limit: {
      window_ms: number;
      max_requests: number;
    };
  };
}