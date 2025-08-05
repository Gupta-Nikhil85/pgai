import { BaseEntity, ID } from './common';

// Connection types based on our architecture
export interface DatabaseConnection extends BaseEntity {
  teamId: string;
  name: string;
  type: 'postgresql' | 'postgrest';
  configEncrypted: string;
  status: ConnectionStatus;
  lastHealthCheck: Date | null;
  createdBy: string;
}

export type ConnectionStatus = 'pending' | 'connected' | 'disconnected' | 'error';

export interface ConnectionConfig {
  // PostgreSQL connection config
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: {
    enabled: boolean;
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
  pooling?: {
    min: number;
    max: number;
    idleTimeoutMillis: number;
  };
}

export interface PostgRestConnectionConfig {
  url: string;
  apiKey?: string;
  configAccessMethod: 'file' | 'api';
  configPath?: string;
}

export interface CreateConnectionRequest {
  name: string;
  type: 'postgresql' | 'postgrest';
  config: ConnectionConfig | PostgRestConnectionConfig;
}

export interface UpdateConnectionRequest {
  name?: string;
  config?: ConnectionConfig | PostgRestConnectionConfig;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: {
    version?: string;
    schemas?: string[];
    extensions?: string[];
    responseTime?: number;
  };
  error?: string;
}

export interface ConnectionHealth extends BaseEntity {
  connectionId: string;
  status: ConnectionStatus;
  responseTimeMs: number | null;
  errorMessage: string | null;
  checkedAt: Date;
}

export interface ConnectionWithHealth extends DatabaseConnection {
  health: ConnectionHealth[];
  currentHealth: ConnectionHealth | null;
}