import Joi from 'joi';

// Common validation patterns
const uuidSchema = Joi.string().guid({ version: 'uuidv4' });
const nameSchema = Joi.string().min(1).max(255).trim();
const descriptionSchema = Joi.string().max(1000).trim().allow('').optional();
const tagsSchema = Joi.array().items(Joi.string().trim().max(50)).max(10).default([]);
const portSchema = Joi.number().integer().min(1).max(65535);
const hostnameSchema = Joi.string().hostname().max(253);
const ipSchema = Joi.string().ip();
const hostSchema = Joi.alternatives().try(hostnameSchema, ipSchema);

// Connection type enum
const connectionTypeSchema = Joi.string().valid('postgresql', 'mysql', 'sqlite', 'mongodb');

// SSL configuration schema
const sslConfigSchema = Joi.object({
  ca: Joi.string().optional(),
  cert: Joi.string().optional(),
  key: Joi.string().optional(),
  rejectUnauthorized: Joi.boolean().default(true),
}).optional();

// Connection pool configuration schema
const poolConfigSchema = Joi.object({
  min: Joi.number().integer().min(0).max(100).default(1),
  max: Joi.number().integer().min(1).max(100).default(10),
  idle_timeout_ms: Joi.number().integer().min(1000).max(300000).default(30000),
  connection_timeout_ms: Joi.number().integer().min(1000).max(60000).default(10000),
}).default({
  min: 1,
  max: 10,
  idle_timeout_ms: 30000,
  connection_timeout_ms: 10000,
});

// Connection options schema (flexible object for database-specific options)
const connectionOptionsSchema = Joi.object().pattern(
  Joi.string(),
  Joi.alternatives().try(
    Joi.string(),
    Joi.number(),
    Joi.boolean(),
    Joi.object()
  )
).default({});

/**
 * Create connection request validation schema
 */
export const createConnectionSchema = Joi.object({
  name: nameSchema.required(),
  description: descriptionSchema,
  connection_type: connectionTypeSchema.required(),
  host: hostSchema.required(),
  port: portSchema.required(),
  database: Joi.string().min(1).max(255).required(),
  username: Joi.string().min(1).max(255).required(),
  password: Joi.string().min(1).max(1000).required(),
  ssl_enabled: Joi.boolean().default(false),
  ssl_config: sslConfigSchema,
  connection_options: connectionOptionsSchema,
  tags: tagsSchema,
  connection_pool_config: poolConfigSchema,
}).custom((value, helpers) => {
  // If SSL is enabled, ssl_config should be provided
  if (value.ssl_enabled && !value.ssl_config) {
    return helpers.error('any.custom', {
      message: 'ssl_config is required when ssl_enabled is true'
    });
  }
  
  // Pool max should be greater than min
  if (value.connection_pool_config && 
      value.connection_pool_config.max <= value.connection_pool_config.min) {
    return helpers.error('any.custom', {
      message: 'connection_pool_config.max must be greater than min'
    });
  }
  
  return value;
});

/**
 * Update connection request validation schema
 */
export const updateConnectionSchema = Joi.object({
  name: nameSchema,
  description: descriptionSchema,
  host: hostSchema,
  port: portSchema,
  database: Joi.string().min(1).max(255),
  username: Joi.string().min(1).max(255),
  password: Joi.string().min(1).max(1000),
  ssl_enabled: Joi.boolean(),
  ssl_config: sslConfigSchema,
  connection_options: connectionOptionsSchema,
  tags: tagsSchema,
  connection_pool_config: poolConfigSchema,
}).min(1).custom((value, helpers) => {
  // If SSL is being enabled, ssl_config should be provided
  if (value.ssl_enabled === true && !value.ssl_config) {
    return helpers.error('any.custom', {
      message: 'ssl_config is required when ssl_enabled is true'
    });
  }
  
  // Pool validation if being updated
  if (value.connection_pool_config && 
      value.connection_pool_config.max !== undefined &&
      value.connection_pool_config.min !== undefined &&
      value.connection_pool_config.max <= value.connection_pool_config.min) {
    return helpers.error('any.custom', {
      message: 'connection_pool_config.max must be greater than min'
    });
  }
  
  return value;
});

/**
 * Connection test request validation schema
 */
export const testConnectionSchema = Joi.object({
  connection_id: uuidSchema.optional(),
  connection_config: Joi.object({
    connection_type: connectionTypeSchema.required(),
    host: hostSchema.required(),
    port: portSchema.required(),
    database: Joi.string().min(1).max(255).required(),
    username: Joi.string().min(1).max(255).required(),
    password: Joi.string().min(1).max(1000).required(),
    ssl_enabled: Joi.boolean().default(false),
    ssl_config: sslConfigSchema,
    connection_options: connectionOptionsSchema,
  }).optional(),
}).xor('connection_id', 'connection_config');

/**
 * Batch test connections request validation schema
 */
export const batchTestConnectionsSchema = Joi.object({
  connection_ids: Joi.array().items(uuidSchema).min(1).max(10),
  connection_configs: Joi.array().items(Joi.object({
    connection_type: connectionTypeSchema.required(),
    host: hostSchema.required(),
    port: portSchema.required(),
    database: Joi.string().min(1).max(255).required(),
    username: Joi.string().min(1).max(255).required(),
    password: Joi.string().min(1).max(1000).required(),
    ssl_enabled: Joi.boolean().default(false),
    ssl_config: sslConfigSchema,
    connection_options: connectionOptionsSchema,
  })).min(1).max(10),
}).xor('connection_ids', 'connection_configs');

/**
 * List connections query parameters validation schema
 */
export const listConnectionsQuerySchema = Joi.object({
  team_id: uuidSchema.optional(),
  connection_type: connectionTypeSchema.optional(),
  status: Joi.string().valid('active', 'inactive', 'testing', 'error').optional(),
  tags: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string())
  ).optional(),
  search: Joi.string().max(255).optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
  sort_by: Joi.string().valid('name', 'created_at', 'updated_at', 'last_used_at').default('created_at'),
  sort_order: Joi.string().valid('asc', 'desc').default('desc'),
});

/**
 * SSH tunnel configuration validation schema
 */
export const sshTunnelConfigSchema = Joi.object({
  enabled: Joi.boolean().required(),
  ssh_host: hostSchema.when('enabled', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  ssh_port: portSchema.default(22),
  ssh_username: Joi.string().min(1).max(255).when('enabled', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  ssh_password: Joi.string().max(1000).optional(),
  ssh_private_key: Joi.string().optional(),
  ssh_private_key_passphrase: Joi.string().max(1000).optional(),
  local_port: portSchema.optional(),
  remote_host: hostSchema.default('127.0.0.1'),
  remote_port: portSchema.optional(),
}).custom((value, helpers) => {
  if (value.enabled) {
    // Either password or private key must be provided
    if (!value.ssh_password && !value.ssh_private_key) {
      return helpers.error('any.custom', {
        message: 'Either ssh_password or ssh_private_key is required when SSH tunnel is enabled'
      });
    }
  }
  return value;
});

/**
 * Connection with SSH tunnel test schema
 */
export const testConnectionWithSSHSchema = Joi.object({
  connection_config: Joi.object({
    connection_type: connectionTypeSchema.required(),
    host: hostSchema.required(),
    port: portSchema.required(),
    database: Joi.string().min(1).max(255).required(),
    username: Joi.string().min(1).max(255).required(),
    password: Joi.string().min(1).max(1000).required(),
    ssl_enabled: Joi.boolean().default(false),
    ssl_config: sslConfigSchema,
    connection_options: connectionOptionsSchema,
  }).required(),
  ssh_config: sshTunnelConfigSchema.required(),
});

/**
 * Connection statistics query schema
 */
export const connectionStatsQuerySchema = Joi.object({
  period: Joi.string().valid('hour', 'day', 'week', 'month').default('day'),
  include_metrics: Joi.boolean().default(true),
  include_health: Joi.boolean().default(true),
});

/**
 * Health check configuration schema
 */
export const healthCheckConfigSchema = Joi.object({
  enabled: Joi.boolean().default(true),
  interval_ms: Joi.number().integer().min(10000).max(3600000).default(60000),
  timeout_ms: Joi.number().integer().min(1000).max(30000).default(5000),
  failure_threshold: Joi.number().integer().min(1).max(10).default(3),
});

// Parameter validation schemas
export const connectionIdParamSchema = Joi.object({
  id: uuidSchema.required(),
});

export const connectionIdOptionalParamSchema = Joi.object({
  id: uuidSchema.optional(),
  connectionId: uuidSchema.optional(),
}).or('id', 'connectionId');

/**
 * Validation middleware factory
 */
export const validateSchema = (schema: Joi.ObjectSchema) => {
  return (data: any) => {
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    
    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        code: detail.type,
        value: detail.context?.value,
      }));
      
      throw new Error(JSON.stringify(details));
    }
    
    return value;
  };
};

/**
 * Validate single value against schema
 */
export const validateValue = (schema: Joi.Schema) => {
  return (value: any) => {
    const { error, value: validatedValue } = schema.validate(value);
    
    if (error) {
      throw new Error(error.message);
    }
    
    return validatedValue;
  };
};