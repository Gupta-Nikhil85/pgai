import { config } from 'dotenv';
import Joi from 'joi';

// Load environment variables
config();

// Configuration schema for validation
const configSchema = Joi.object({
  // Server configuration
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3002),
  HOST: Joi.string().hostname().default('0.0.0.0'),
  
  // Database configuration (for service metadata)
  DATABASE_URL: Joi.string().uri().required(),
  DATABASE_POOL_MIN: Joi.number().default(2),
  DATABASE_POOL_MAX: Joi.number().default(20),
  
  // Redis configuration (for caching and session management)
  REDIS_URL: Joi.string().uri().required(),
  REDIS_TTL_SECONDS: Joi.number().default(3600), // 1 hour
  
  // Encryption configuration
  ENCRYPTION_KEY: Joi.string().min(32).required(),
  ENCRYPTION_ALGORITHM: Joi.string().default('aes-256-gcm'),
  
  // JWT configuration
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  
  // Security configuration
  CORS_ENABLED: Joi.boolean().default(true),
  CORS_ORIGIN: Joi.string().default('*'),
  HELMET_ENABLED: Joi.boolean().default(true),
  TRUST_PROXY: Joi.boolean().default(true),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
  
  // Connection management
  MAX_CONNECTIONS_PER_USER: Joi.number().default(10),
  MAX_CONNECTIONS_PER_TEAM: Joi.number().default(50),
  CONNECTION_TEST_TIMEOUT_MS: Joi.number().default(10000),
  CONNECTION_POOL_IDLE_TIMEOUT_MS: Joi.number().default(30000),
  
  // Health check configuration
  HEALTH_CHECK_INTERVAL_MS: Joi.number().default(60000), // 1 minute
  HEALTH_CHECK_TIMEOUT_MS: Joi.number().default(5000),
  
  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FORMAT: Joi.string().valid('json', 'simple').default('json'),
  
  // Monitoring
  ENABLE_METRICS: Joi.boolean().default(true),
  METRICS_PORT: Joi.number().port().default(9091),
  
  // SSH tunnel configuration
  SSH_TUNNEL_ENABLED: Joi.boolean().default(false),
  SSH_TUNNEL_TIMEOUT_MS: Joi.number().default(30000),
  
  // Connection pooling
  GLOBAL_POOL_MAX_SIZE: Joi.number().default(100),
  GLOBAL_POOL_MIN_SIZE: Joi.number().default(10),
  
  // Service URLs (for inter-service communication)
  USER_SERVICE_URL: Joi.string().uri().optional(),
  SCHEMA_SERVICE_URL: Joi.string().uri().optional(),
  
  // Webhook configuration
  WEBHOOK_ENABLED: Joi.boolean().default(false),
  WEBHOOK_SECRET: Joi.string().optional(),
  
  // Backup configuration
  CONNECTION_BACKUP_ENABLED: Joi.boolean().default(true),
  CONNECTION_BACKUP_INTERVAL_HOURS: Joi.number().default(24),
}).unknown();

// Validate and extract configuration
const { error, value: envVars } = configSchema.validate(process.env);

if (error) {
  throw new Error(`Configuration validation error: ${error.message}`);
}

// Export typed configuration
export const appConfig = {
  // Environment
  env: envVars.NODE_ENV as 'development' | 'production' | 'test',
  isDevelopment: envVars.NODE_ENV === 'development',
  isProduction: envVars.NODE_ENV === 'production',
  isTest: envVars.NODE_ENV === 'test',
  
  // Server
  port: envVars.PORT as number,
  host: envVars.HOST as string,
  
  // Service
  service: {
    name: 'connection-service',
    version: '0.1.0',
  },
  
  // Database
  database: {
    url: envVars.DATABASE_URL as string,
    pool: {
      min: envVars.DATABASE_POOL_MIN as number,
      max: envVars.DATABASE_POOL_MAX as number,
    },
  },
  
  // Redis
  redis: {
    url: envVars.REDIS_URL as string,
    ttlSeconds: envVars.REDIS_TTL_SECONDS as number,
  },
  
  // Encryption
  encryption: {
    key: envVars.ENCRYPTION_KEY as string,
    algorithm: envVars.ENCRYPTION_ALGORITHM as string,
  },
  
  // JWT
  jwt: {
    secret: envVars.JWT_SECRET as string,
    expiresIn: envVars.JWT_EXPIRES_IN as string,
  },
  
  // Security
  cors: {
    enabled: envVars.CORS_ENABLED as boolean,
    origin: envVars.CORS_ORIGIN as string,
  },
  security: {
    helmet: {
      enabled: envVars.HELMET_ENABLED as boolean,
    },
    trustProxy: envVars.TRUST_PROXY as boolean,
    rateLimit: {
      windowMs: envVars.RATE_LIMIT_WINDOW_MS as number,
      maxRequests: envVars.RATE_LIMIT_MAX_REQUESTS as number,
    },
  },
  
  // Connection management
  connections: {
    maxPerUser: envVars.MAX_CONNECTIONS_PER_USER as number,
    maxPerTeam: envVars.MAX_CONNECTIONS_PER_TEAM as number,
    testTimeoutMs: envVars.CONNECTION_TEST_TIMEOUT_MS as number,
    poolIdleTimeoutMs: envVars.CONNECTION_POOL_IDLE_TIMEOUT_MS as number,
    globalPool: {
      maxSize: envVars.GLOBAL_POOL_MAX_SIZE as number,
      minSize: envVars.GLOBAL_POOL_MIN_SIZE as number,
    },
  },
  
  // Health checks
  healthCheck: {
    intervalMs: envVars.HEALTH_CHECK_INTERVAL_MS as number,
    timeoutMs: envVars.HEALTH_CHECK_TIMEOUT_MS as number,
  },
  
  // Logging
  logging: {
    level: envVars.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug',
    format: envVars.LOG_FORMAT as 'json' | 'simple',
  },
  
  // Monitoring
  monitoring: {
    enableMetrics: envVars.ENABLE_METRICS as boolean,
    port: envVars.METRICS_PORT as number,
  },
  
  // SSH tunnels
  sshTunnel: {
    enabled: envVars.SSH_TUNNEL_ENABLED as boolean,
    timeoutMs: envVars.SSH_TUNNEL_TIMEOUT_MS as number,
  },
  
  // External services
  services: {
    user: {
      url: envVars.USER_SERVICE_URL as string,
    },
    schema: {
      url: envVars.SCHEMA_SERVICE_URL as string,
    },
  },
  
  // Webhooks
  webhooks: {
    enabled: envVars.WEBHOOK_ENABLED as boolean,
    secret: envVars.WEBHOOK_SECRET as string,
  },
  
  // Backup
  backup: {
    enabled: envVars.CONNECTION_BACKUP_ENABLED as boolean,
    intervalHours: envVars.CONNECTION_BACKUP_INTERVAL_HOURS as number,
  },
} as const;

export default appConfig;