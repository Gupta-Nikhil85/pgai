import { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware, Options, responseInterceptor } from 'http-proxy-middleware';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { gatewayConfig } from '../config';
import { createDownstreamHeaders, AuthContext } from '../utils/auth';
import { 
  ServiceUnavailableError, 
  GatewayTimeoutError, 
  ServiceError,
  errorToApiResponse 
} from '../utils/errors';
import { routingLogger } from '../utils/logger';
import { 
  recordServiceProxyRequest, 
  recordServiceProxyError,
  activeConnections 
} from '../utils/metrics';

export interface ServiceConfig {
  name: string;
  url: string;
  timeout: number;
  retries?: number;
  circuitBreaker?: {
    enabled: boolean;
    failureThreshold: number;
    resetTimeout: number;
  };
}

// Service registry
export class ServiceRegistry {
  private services: Map<string, ServiceConfig> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor() {
    this.initializeServices();
  }

  private initializeServices(): void {
    // Register services from configuration
    const services: ServiceConfig[] = [
      {
        name: 'user-service',
        url: gatewayConfig.services.user.url,
        timeout: gatewayConfig.services.user.timeout,
        retries: 3,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          resetTimeout: 30000, // 30 seconds
        },
      },
      {
        name: 'connection-service',
        url: gatewayConfig.services.connection.url,
        timeout: gatewayConfig.services.connection.timeout,
        retries: 3,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          resetTimeout: 30000,
        },
      },
      {
        name: 'schema-service',
        url: gatewayConfig.services.schema.url,
        timeout: gatewayConfig.services.schema.timeout,
        retries: 3,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          resetTimeout: 30000,
        },
      },
      {
        name: 'view-service',
        url: gatewayConfig.services.view.url,
        timeout: gatewayConfig.services.view.timeout,
        retries: 3,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          resetTimeout: 30000,
        },
      },
      {
        name: 'versioning-service',
        url: gatewayConfig.services.versioning.url,
        timeout: gatewayConfig.services.versioning.timeout,
        retries: 3,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          resetTimeout: 30000,
        },
      },
      {
        name: 'documentation-service',
        url: gatewayConfig.services.documentation.url,
        timeout: gatewayConfig.services.documentation.timeout,
        retries: 3,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          resetTimeout: 30000,
        },
      },
    ].filter(service => service.url); // Only register services with URLs

    for (const service of services) {
      this.services.set(service.name, service);
      
      if (service.circuitBreaker?.enabled) {
        this.circuitBreakers.set(service.name, new CircuitBreaker(
          service.circuitBreaker.failureThreshold,
          service.circuitBreaker.resetTimeout
        ));
      }
    }

    routingLogger.info('Service registry initialized', {
      services: Array.from(this.services.keys()),
    });
  }

  getService(name: string): ServiceConfig | undefined {
    return this.services.get(name);
  }

  getCircuitBreaker(serviceName: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(serviceName);
  }

  getAllServices(): ServiceConfig[] {
    return Array.from(this.services.values());
  }
}

// Circuit breaker implementation
class CircuitBreaker {
  private failureCount = 0;
  private nextAttempt = Date.now();
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private failureThreshold: number,
    private resetTimeout: number
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new ServiceUnavailableError('Circuit breaker is OPEN');
      } else {
        this.state = 'HALF_OPEN';
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failureCount++;
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
    }
  }

  getState(): string {
    return this.state;
  }
}

// Proxy service
export class ProxyService {
  private registry: ServiceRegistry;

  constructor() {
    this.registry = new ServiceRegistry();
  }

  getService(name: string): ServiceConfig | undefined {
    return this.registry.getService(name);
  }

  // Create proxy middleware for a specific service
  createProxy(serviceName: string, pathRewrite?: Record<string, string>): any {
    const service = this.registry.getService(serviceName);
    
    if (!service) {
      throw new Error(`Service not found: ${serviceName}`);
    }

    const options: Options = {
      target: service.url,
      changeOrigin: true,
      timeout: service.timeout,
      pathRewrite: pathRewrite || {},
      selfHandleResponse: true,
      
      // Add authentication headers
      onProxyReq: (proxyReq, req: Request) => {
        const requestId = req.requestId || 'unknown';
        // Add request ID
        proxyReq.setHeader('x-request-id', requestId);
        
        // Add gateway identification
        proxyReq.setHeader('x-forwarded-by', 'pgai-gateway');
        proxyReq.setHeader('x-gateway-version', gatewayConfig.api.version);
        
        // Add downstream headers if user is authenticated
        if (req.auth) {
          const downstreamHeaders = createDownstreamHeaders(req.auth, requestId);
          
          Object.entries(downstreamHeaders).forEach(([key, value]) => {
            proxyReq.setHeader(key, value);
          });
        }

        // Handle body re-writing for JSON requests that were parsed by Express
        if (
          !proxyReq.writableEnded &&
          req.body &&
          Object.keys(req.body).length &&
          (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')
        ) {
            const bodyData = JSON.stringify(req.body);
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
        }

        activeConnections.inc();
        
        routingLogger.debug('Proxying request', {
          service: serviceName,
          method: req.method,
          path: req.path,
          target: service.url,
          requestId,
          userId: req.auth?.userId,
        });
      },

      // Handle proxy response
      onProxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
        const requestId = (req as any).requestId || 'unknown';
        const startTime = (req as any).startTime || Date.now();
        const duration = (Date.now() - startTime) / 1000;

        activeConnections.dec();

        // Record metrics
        recordServiceProxyRequest(
          serviceName,
          (req as any).method,
          proxyRes.statusCode || 0,
          duration
        );

        routingLogger.debug('Proxy response received', {
          service: serviceName,
          method: (req as any).method,
          path: (req as any).path,
          statusCode: proxyRes.statusCode,
          duration,
          requestId,
        });

        return responseBuffer;
      }),

      // Handle proxy errors
      onError: (err: any, req: Request, res: Response) => {
        const requestId = req.requestId || 'unknown';
        
        activeConnections.dec();
        recordServiceProxyError(serviceName, err.code || 'UNKNOWN_ERROR');

        routingLogger.error('Proxy error', {
          service: serviceName,
          error: err.message,
          code: err.code,
          requestId,
          method: req.method,
          path: req.path,
        });

        // Handle specific error types
        let error: Error;
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
          error = new ServiceUnavailableError(`Service ${serviceName} is unavailable`);
        } else if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
          error = new GatewayTimeoutError(`Service ${serviceName} timeout`);
        } else {
          error = new ServiceError(`Proxy error: ${err.message}`);
        }

        // Only send error response if headers haven't been sent yet
        if (!res.headersSent) {
          const apiResponse = errorToApiResponse(error, requestId);
          res.status((error as any).statusCode || 502).json(apiResponse);
        }
      },
    };

    return createProxyMiddleware(options);
  }

  // Direct HTTP request with circuit breaker
  async proxyRequest(
    serviceName: string,
    config: AxiosRequestConfig,
    auth?: AuthContext,
    requestId?: string
  ): Promise<AxiosResponse> {
    const service = this.registry.getService(serviceName);
    
    if (!service) {
      throw new ServiceError(`Service not found: ${serviceName}`);
    }

    const circuitBreaker = this.registry.getCircuitBreaker(serviceName);
    const startTime = Date.now();

    const makeRequest = async (): Promise<AxiosResponse> => {
      const requestConfig: AxiosRequestConfig = {
        ...config,
        baseURL: service.url,
        timeout: service.timeout,
        headers: {
          ...config.headers,
          'x-request-id': requestId || 'unknown',
          'x-forwarded-by': 'pgai-gateway',
          'x-gateway-version': gatewayConfig.api.version,
          ...(auth && createDownstreamHeaders(auth, requestId || 'unknown')),
        },
      };

      return axios.request(requestConfig);
    };

    try {
      const response = circuitBreaker 
        ? await circuitBreaker.execute(makeRequest)
        : await makeRequest();

      const duration = (Date.now() - startTime) / 1000;
      recordServiceProxyRequest(serviceName, config.method || 'GET', response.status, duration);

      return response;
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      recordServiceProxyRequest(serviceName, config.method || 'GET', 0, duration);
      recordServiceProxyError(serviceName, 'REQUEST_FAILED');

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          throw new ServiceUnavailableError(`Service ${serviceName} is unavailable`);
        } else if (error.code === 'ETIMEDOUT') {
          throw new GatewayTimeoutError(`Service ${serviceName} timeout`);
        } else if (error.response) {
          throw new ServiceError(
            `Service ${serviceName} returned error: ${error.response.status}`
          );
        }
      }

      throw new ServiceError(`Failed to communicate with ${serviceName}: ${error}`);
    }
  }

  // Get service health status
  async getServiceHealth(serviceName: string): Promise<{ status: string; details?: any }> {
    try {
      const response = await this.proxyRequest(
        serviceName,
        {
          method: 'GET',
          url: '/health',
          timeout: 5000,
        }
      );

      return {
        status: response.status === 200 ? 'healthy' : 'unhealthy',
        details: response.data,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  // Get all services health
  async getAllServicesHealth(): Promise<Record<string, { status: string; details?: any }>> {
    const services = this.registry.getAllServices();
    const healthChecks = await Promise.allSettled(
      services.map(async (service) => ({
        name: service.name,
        health: await this.getServiceHealth(service.name),
      }))
    );

    const result: Record<string, { status: string; details?: any }> = {};
    
    healthChecks.forEach((check, index) => {
      const serviceName = services[index].name;
      
      if (check.status === 'fulfilled') {
        result[serviceName] = check.value.health;
      } else {
        result[serviceName] = {
          status: 'unhealthy',
          details: { error: 'Health check failed' },
        };
      }
    });

    return result;
  }
}

// Export singleton instance
export const proxyService = new ProxyService();