import { config } from 'dotenv';
import Joi from 'joi';
import { SchemaServiceConfig } from '../types/schema.types';

// Load environment variables
config();

// Configuration schema for validation
const configSchema = Joi.object({
  // Server configuration
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3003),
  HOST: Joi.string().hostname().default('0.0.0.0'),
  
  // Database configuration
  DATABASE_URL: Joi.string().uri().required(),
  
  // Redis configuration
  REDIS_URL: Joi.string().uri().required(),
  
  // JWT configuration
  JWT_SECRET: Joi.string().min(32).required(),
  
  // Service configuration
  SERVICE_NAME: Joi.string().default('schema-service'),
  SERVICE_VERSION: Joi.string().default('0.1.0'),
  
  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FORMAT: Joi.string().valid('json', 'simple').default('json'),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
  
  // Schema discovery configuration
  SCHEMA_CACHE_TTL: Joi.number().default(300), // 5 minutes
  SCHEMA_REFRESH_INTERVAL: Joi.number().default(30), // 30 seconds
  MAX_SCHEMA_OBJECTS: Joi.number().default(10000),
  
  // Monitoring
  ENABLE_METRICS: Joi.boolean().default(true),
  METRICS_PORT: Joi.number().port().default(9093),
}).unknown();

// Validate and extract configuration
const { error, value: envVars } = configSchema.validate(process.env);

if (error) {
  throw new Error(`Schema Service configuration validation error: ${error.message}`);
}

// Export typed configuration
export const schemaConfig: SchemaServiceConfig = {
  port: envVars.PORT,
  host: envVars.HOST,
  database_url: envVars.DATABASE_URL,
  redis_url: envVars.REDIS_URL,
  
  cache_config: {
    ttl_seconds: envVars.SCHEMA_CACHE_TTL,
    max_entries: 1000,
    enable_compression: true,
    eviction_policy: 'lru',
  },
  
  discovery_config: {
    default_timeout_ms: 30000, // 30 seconds
    max_concurrent_discoveries: 5,
    include_system_schemas: false,
    enable_change_detection: true,
    refresh_interval_ms: envVars.SCHEMA_REFRESH_INTERVAL * 1000,
  },
  
  security_config: {
    enable_authentication: true,
    jwt_secret: envVars.JWT_SECRET,
    rate_limit: {
      window_ms: envVars.RATE_LIMIT_WINDOW_MS,
      max_requests: envVars.RATE_LIMIT_MAX_REQUESTS,
    },
  },
};

// Additional environment configuration
export const appConfig = {
  env: envVars.NODE_ENV as 'development' | 'production' | 'test',
  environment: envVars.NODE_ENV,
  isProduction: envVars.NODE_ENV === 'production',
  isDevelopment: envVars.NODE_ENV === 'development',
  isTest: envVars.NODE_ENV === 'test',
  
  server: {
    port: envVars.PORT,
    host: envVars.HOST,
  },
  
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0,
  },
  
  service: {
    name: envVars.SERVICE_NAME,
    version: envVars.SERVICE_VERSION,
  },
  
  cors: {
    origins: envVars.NODE_ENV === 'production' ? [] : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  },
  
  logging: {
    level: envVars.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug',
    format: envVars.LOG_FORMAT as 'json' | 'simple',
  },
  
  monitoring: {
    enableMetrics: envVars.ENABLE_METRICS,
    enableTracing: false,
    metricsPort: envVars.METRICS_PORT,
  },
  
  limits: {
    maxSchemaObjects: envVars.MAX_SCHEMA_OBJECTS,
  },
  
  schemaConfig,
};

export default schemaConfig;