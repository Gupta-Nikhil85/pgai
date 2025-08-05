import { HttpMethod, ApiResponse, PaginationParams, PaginatedResponse } from './common';

// API-specific types and utilities

// Request context passed through middleware
export interface RequestContext {
  userId: string;
  teamId: string;
  role: string;
  permissions: string[];
  ipAddress: string;
  userAgent: string;
  requestId: string;
  traceId: string;
}

// Standardized error responses
export interface ApiError {
  code: string;
  message: string;
  details?: any;
  field?: string;
  timestamp: string;
  requestId: string;
}

export interface ValidationErrorResponse extends ApiResponse {
  success: false;
  error: {
    code: 'VALIDATION_ERROR';
    message: string;
    details: ValidationFieldError[];
  };
}

export interface ValidationFieldError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

// Service response types
export interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// OpenAPI specification types
export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: {
    url: string;
    description: string;
  }[];
  paths: Record<string, PathItem>;
  components: {
    schemas: Record<string, SchemaObject>;
    securitySchemes: Record<string, SecurityScheme>;
  };
}

export interface PathItem {
  summary?: string;
  description?: string;
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
}

export interface Operation {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, Response>;
  security?: SecurityRequirement[];
  deprecated?: boolean;
}

export interface Parameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema: SchemaObject;
  example?: any;
}

export interface RequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, MediaType>;
}

export interface Response {
  description: string;
  headers?: Record<string, Header>;
  content?: Record<string, MediaType>;
}

export interface MediaType {
  schema?: SchemaObject;
  example?: any;
  examples?: Record<string, Example>;
}

export interface Example {
  summary?: string;
  description?: string;
  value: any;
}

export interface Header {
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema: SchemaObject;
}

export interface SchemaObject {
  type?: string;
  format?: string;
  title?: string;
  description?: string;
  enum?: any[];
  properties?: Record<string, SchemaObject>;
  required?: string[];
  items?: SchemaObject;
  additionalProperties?: boolean | SchemaObject;
  example?: any;
}

export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  description?: string;
  name?: string;
  in?: 'query' | 'header' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
}

export interface SecurityRequirement {
  [name: string]: string[];
}

// Webhook types
export interface WebhookEvent {
  id: string;
  type: string;
  timestamp: Date;
  data: any;
  teamId: string;
  userId?: string;
}

export interface WebhookEndpoint {
  id: string;
  teamId: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDelivery {
  id: string;
  webhookEndpointId: string;
  eventId: string;
  attempts: number;
  status: 'pending' | 'success' | 'failed';
  responseCode?: number;
  responseBody?: string;
  nextRetry?: Date;
  createdAt: Date;
  deliveredAt?: Date;
}