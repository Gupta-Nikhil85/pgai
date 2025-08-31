import { config } from 'dotenv';
import Joi from 'joi';

// Load environment variables
config();

// Environment validation schema
const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'staging', 'production', 'test').default('development'),
  PORT: Joi.number().default(3001),
  HOST: Joi.string().default('0.0.0.0'),
  
  // Database
  DATABASE_URL: Joi.string().required(),
  
  // JWT
  JWT_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  
  // Security
  BCRYPT_ROUNDS: Joi.number().default(12),
  RATE_LIMIT_WINDOW_MS: Joi.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
  
  // Monitoring
  ENABLE_METRICS: Joi.boolean().default(true),
  METRICS_PORT: Joi.number().default(9001),
  
  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  
  // CORS
  CORS_ORIGIN: Joi.string().default('*'),
  ENABLE_CORS: Joi.boolean().default(true),
}).unknown(true);

const { error, value: env } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export const appConfig = {
  env: env.NODE_ENV,
  port: env.PORT,
  host: env.HOST,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  
  database: {
    url: env.DATABASE_URL,
  },
  
  jwt: {
    secret: env.JWT_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },
  
  security: {
    bcryptRounds: env.BCRYPT_ROUNDS,
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    },
  },
  
  monitoring: {
    enableMetrics: env.ENABLE_METRICS,
    metricsPort: env.METRICS_PORT,
  },
  
  logging: {
    level: env.LOG_LEVEL,
    format: env.LOG_FORMAT || 'json',
  },
  
  cors: {
    origin: env.CORS_ORIGIN,
    enabled: env.ENABLE_CORS,
  },
};

export type AppConfig = typeof appConfig;