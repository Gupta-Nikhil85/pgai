export interface DatabaseConnection {
  id: string;
  user_id: string;
  team_id?: string;
  name: string;
  description?: string;
  connection_type: 'postgresql' | 'mysql' | 'sqlite' | 'mongodb';
  host: string;
  port: number;
  database: string;
  username: string;
  password_encrypted: string;
  ssl_enabled: boolean;
  ssl_config?: {
    ca?: string;
    cert?: string;
    key?: string;
    rejectUnauthorized?: boolean;
  };
  connection_options: Record<string, any>;
  tags: string[];
  status: 'active' | 'inactive' | 'testing' | 'error';
  last_tested_at?: string;
  last_used_at?: string;
  created_at: string;
  updated_at: string;
  connection_pool_config: {
    min: number;
    max: number;
    idle_timeout_ms: number;
    connection_timeout_ms: number;
  };
}

export interface ConnectionTestRequest {
  connection_id?: string;
  connection_config?: Omit<DatabaseConnection, 'id' | 'user_id' | 'team_id' | 'created_at' | 'updated_at' | 'status' | 'last_tested_at' | 'last_used_at'>;
}

export interface ConnectionTestResult {
  success: boolean;
  connection_time_ms: number;
  database_version?: string;
  error_message?: string;
  error_code?: string;
  tested_at: string;
  connection_details?: {
    server_version: string;
    protocol_version: number;
    database_size?: string;
    available_schemas?: string[];
  };
}

export interface ConnectionCreateRequest {
  name: string;
  description?: string;
  connection_type: 'postgresql' | 'mysql' | 'sqlite' | 'mongodb';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl_enabled?: boolean;
  ssl_config?: {
    ca?: string;
    cert?: string;
    key?: string;
    rejectUnauthorized?: boolean;
  };
  connection_options?: Record<string, any>;
  tags?: string[];
  connection_pool_config?: {
    min?: number;
    max?: number;
    idle_timeout_ms?: number;
    connection_timeout_ms?: number;
  };
}

export interface ConnectionUpdateRequest {
  name?: string;
  description?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl_enabled?: boolean;
  ssl_config?: {
    ca?: string;
    cert?: string;
    key?: string;
    rejectUnauthorized?: boolean;
  };
  connection_options?: Record<string, any>;
  tags?: string[];
  connection_pool_config?: {
    min?: number;
    max?: number;
    idle_timeout_ms?: number;
    connection_timeout_ms?: number;
  };
}

export interface ConnectionListRequest {
  user_id?: string;
  team_id?: string;
  connection_type?: string;
  status?: string;
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
  sort_by?: 'name' | 'created_at' | 'updated_at' | 'last_used_at';
  sort_order?: 'asc' | 'desc';
}

export interface ConnectionUsageMetrics {
  connection_id: string;
  total_queries: number;
  avg_query_time_ms: number;
  active_connections: number;
  peak_connections: number;
  error_count: number;
  last_24h_usage: {
    queries: number;
    errors: number;
    avg_response_time_ms: number;
  };
  uptime_percentage: number;
  collected_at: string;
}

export interface SSHTunnelConfig {
  enabled: boolean;
  ssh_host: string;
  ssh_port: number;
  ssh_username: string;
  ssh_password?: string;
  ssh_private_key?: string;
  ssh_private_key_passphrase?: string;
  local_port?: number;
  remote_host?: string;
  remote_port?: number;
}

export interface ConnectionPool {
  connection_id: string;
  pool_size: number;
  active_connections: number;
  idle_connections: number;
  waiting_count: number;
  total_count: number;
  created_at: string;
  last_activity_at: string;
}

export interface ConnectionEvent {
  id: string;
  connection_id: string;
  event_type: 'created' | 'updated' | 'deleted' | 'tested' | 'connected' | 'disconnected' | 'error';
  event_data: Record<string, any>;
  user_id: string;
  timestamp: string;
  ip_address?: string;
  user_agent?: string;
}

export interface ConnectionSecret {
  connection_id: string;
  secret_type: 'password' | 'ssl_cert' | 'ssl_key' | 'ssl_ca' | 'ssh_key';
  encrypted_value: string;
  encryption_algorithm: string;
  created_at: string;
  expires_at?: string;
}

export interface ConnectionHealthCheck {
  connection_id: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  response_time_ms: number;
  last_check_at: string;
  error_message?: string;
  consecutive_failures: number;
  next_check_at: string;
}