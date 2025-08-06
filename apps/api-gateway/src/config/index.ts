import { config } from 'dotenv';
import Joi from 'joi';

// Load environment variables
config();

// Configuration schema for validation
const configSchema = Joi.object({
  // Server configuration
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),
  HOST: Joi.string().hostname().default('0.0.0.0'),
  
  // JWT configuration
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  
  // CORS configuration
  CORS_ENABLED: Joi.boolean().default(true),
  CORS_ORIGIN: Joi.string().default('*'),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
  
  // Security
  HELMET_ENABLED: Joi.boolean().default(true),
  TRUST_PROXY: Joi.boolean().default(true),
  
  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FORMAT: Joi.string().valid('json', 'simple').default('json'),
  
  // Monitoring
  ENABLE_METRICS: Joi.boolean().default(true),
  METRICS_PORT: Joi.number().port().default(9090),
  HEALTH_CHECK_TIMEOUT: Joi.number().default(5000),
  
  // Service URLs
  USER_SERVICE_URL: Joi.string().uri().required(),
  CONNECTION_SERVICE_URL: Joi.string().uri().optional(),
  SCHEMA_SERVICE_URL: Joi.string().uri().optional(),
  VIEW_SERVICE_URL: Joi.string().uri().optional(),
  VERSIONING_SERVICE_URL: Joi.string().uri().optional(),
  DOCUMENTATION_SERVICE_URL: Joi.string().uri().optional(),
  
  // Cache configuration
  REDIS_URL: Joi.string().uri().optional(),
  CACHE_TTL_SECONDS: Joi.number().default(300), // 5 minutes
  
  // API Documentation
  API_TITLE: Joi.string().default('pgai API Gateway'),
  API_VERSION: Joi.string().default('0.1.0'),
  API_DESCRIPTION: Joi.string().default('API Gateway for PostgREST AI Orchestration Platform'),
  
  // Request/Response configuration
  MAX_REQUEST_SIZE: Joi.string().default('10mb'),
  REQUEST_TIMEOUT_MS: Joi.number().default(30000), // 30 seconds
  
  // Service Discovery
  SERVICE_DISCOVERY_ENABLED: Joi.boolean().default(false),
  CONSUL_URL: Joi.string().uri().optional(),
}).unknown();

// Validate and extract configuration
const { error, value: envVars } = configSchema.validate(process.env);

if (error) {
  throw new Error(`Configuration validation error: ${error.message}`);
}

// Export typed configuration
export const gatewayConfig = {
  // Server
  env: envVars.NODE_ENV as 'development' | 'production' | 'test',
  isProduction: envVars.NODE_ENV === 'production',
  isDevelopment: envVars.NODE_ENV === 'development',
  isTest: envVars.NODE_ENV === 'test',
  port: envVars.PORT as number,
  host: envVars.HOST as string,
  
  // JWT
  jwt: {
    secret: envVars.JWT_SECRET as string,
    expiresIn: envVars.JWT_EXPIRES_IN as string,
    refreshExpiresIn: envVars.JWT_REFRESH_EXPIRES_IN as string,
  },
  
  // CORS
  cors: {
    enabled: envVars.CORS_ENABLED as boolean,
    origin: envVars.CORS_ORIGIN as string,
  },
  
  // Security
  security: {
    rateLimit: {
      windowMs: envVars.RATE_LIMIT_WINDOW_MS as number,
      maxRequests: envVars.RATE_LIMIT_MAX_REQUESTS as number,
    },
    helmet: {
      enabled: envVars.HELMET_ENABLED as boolean,
    },
    trustProxy: envVars.TRUST_PROXY as boolean,
  },
  
  // Logging
  logging: {
    level: envVars.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug',
    format: envVars.LOG_FORMAT as 'json' | 'simple',
  },
  
  // Monitoring
  monitoring: {
    enableMetrics: envVars.ENABLE_METRICS as boolean,
    metricsPort: envVars.METRICS_PORT as number,
    healthCheckTimeout: envVars.HEALTH_CHECK_TIMEOUT as number,
  },
  
  // Services
  services: {
    user: {
      url: envVars.USER_SERVICE_URL as string,
      timeout: envVars.REQUEST_TIMEOUT_MS as number,
    },
    connection: {
      url: envVars.CONNECTION_SERVICE_URL as string,
      timeout: envVars.REQUEST_TIMEOUT_MS as number,
    },
    schema: {
      url: envVars.SCHEMA_SERVICE_URL as string,
      timeout: envVars.REQUEST_TIMEOUT_MS as number,
    },
    view: {
      url: envVars.VIEW_SERVICE_URL as string,
      timeout: envVars.REQUEST_TIMEOUT_MS as number,
    },
    versioning: {
      url: envVars.VERSIONING_SERVICE_URL as string,
      timeout: envVars.REQUEST_TIMEOUT_MS as number,
    },
    documentation: {
      url: envVars.DOCUMENTATION_SERVICE_URL as string,
      timeout: envVars.REQUEST_TIMEOUT_MS as number,
    },
  },
  
  // Cache
  cache: {
    redisUrl: envVars.REDIS_URL as string,
    ttlSeconds: envVars.CACHE_TTL_SECONDS as number,
  },
  
  // API Documentation
  api: {
    title: envVars.API_TITLE as string,
    version: envVars.API_VERSION as string,
    description: envVars.API_DESCRIPTION as string,
  },
  
  // Request/Response
  request: {
    maxSize: envVars.MAX_REQUEST_SIZE as string,
    timeoutMs: envVars.REQUEST_TIMEOUT_MS as number,
  },
  
  // Service Discovery
  serviceDiscovery: {
    enabled: envVars.SERVICE_DISCOVERY_ENABLED as boolean,
    consulUrl: envVars.CONSUL_URL as string,
  },
} as const;

// Validate required service URLs
const requiredServices = ['user'] as const;

for (const serviceName of requiredServices) {
  if (!gatewayConfig.services[serviceName].url) {
    throw new Error(`Missing required service URL for: ${serviceName.toUpperCase()}_SERVICE_URL`);
  }
}

export default gatewayConfig;