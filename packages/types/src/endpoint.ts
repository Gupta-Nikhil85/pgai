import { BaseEntity, HttpMethod, ID } from './common';

// API endpoint types
export interface ApiEndpoint extends BaseEntity {
  connectionId: string;
  path: string;
  resource: string;
  methods: HttpMethod[];
  version: string;
  status: EndpointStatus;
  configuration: EndpointConfig;
  documentation: EndpointDocumentation | null;
}

export type EndpointStatus = 'active' | 'deprecated' | 'retired' | 'draft';

export interface EndpointConfig {
  authentication: AuthConfig;
  authorization: AuthzRule[];
  rateLimiting: RateLimitConfig;
  caching: CacheConfig;
  transformations: TransformationRule[];
  cors: CorsConfig;
}

export interface AuthConfig {
  required: boolean;
  methods: ('jwt' | 'api_key' | 'basic')[];
  roles: string[];
}

export interface AuthzRule {
  action: string;
  resource: string;
  conditions: Record<string, any>;
  effect: 'allow' | 'deny';
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  burstSize: number;
  perUser: boolean;
  skipSuccessfulRequests: boolean;
}

export interface CacheConfig {
  enabled: boolean;
  ttlSeconds: number;
  vary: string[];
  conditions: Record<string, any>;
}

export interface TransformationRule {
  type: 'request' | 'response';
  field: string;
  transformation: string;
  parameters: Record<string, any>;
}

export interface CorsConfig {
  origins: string[];
  methods: HttpMethod[];
  headers: string[];
  credentials: boolean;
  maxAge: number;
}

export interface EndpointDocumentation {
  summary: string;
  description: string;
  parameters: ParameterDoc[];
  responses: ResponseDoc[];
  examples: ExampleDoc[];
  tags: string[];
}

export interface ParameterDoc {
  name: string;
  in: 'query' | 'path' | 'header' | 'body';
  description: string;
  required: boolean;
  type: string;
  format?: string;
  example?: any;
}

export interface ResponseDoc {
  statusCode: number;
  description: string;
  schema: Record<string, any>;
  examples: Record<string, any>;
}

export interface ExampleDoc {
  name: string;
  description: string;
  request: {
    method: HttpMethod;
    path: string;
    headers?: Record<string, string>;
    body?: any;
  };
  response: {
    statusCode: number;
    headers?: Record<string, string>;
    body: any;
  };
}

export interface CreateEndpointRequest {
  path: string;
  resource: string;
  methods: HttpMethod[];
  configuration: Partial<EndpointConfig>;
  documentation?: Partial<EndpointDocumentation>;
}

export interface UpdateEndpointRequest {
  path?: string;
  methods?: HttpMethod[];
  status?: EndpointStatus;
  configuration?: Partial<EndpointConfig>;
  documentation?: Partial<EndpointDocumentation>;
}

export interface EndpointTestRequest {
  method: HttpMethod;
  headers?: Record<string, string>;
  query?: Record<string, any>;
  body?: any;
}

export interface EndpointTestResult {
  success: boolean;
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  responseTime: number;
  error?: string;
}