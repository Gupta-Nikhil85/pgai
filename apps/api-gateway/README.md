# pgai API Gateway

The API Gateway for the PostgREST AI Orchestration Platform - handles routing, authentication, and cross-cutting concerns for all microservices.

## Features

- 🔐 **JWT-based Authentication** - Secure token-based authentication with refresh tokens
- 🛡️ **Authorization & RBAC** - Role-based access control with team membership validation
- 🚦 **Rate Limiting** - Configurable rate limiting per user, IP, and endpoint type
- 🔒 **Security Middleware** - Comprehensive security headers, CORS, and request validation
- 📊 **Metrics & Monitoring** - Prometheus metrics and health checks for observability
- 🔄 **Service Proxy** - Intelligent request routing with circuit breakers and retries
- 📝 **Request/Response Logging** - Structured logging with correlation IDs
- ⚡ **High Performance** - Optimized for low latency and high throughput

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- User Service running (required)

### Installation

```bash
# From repository root
pnpm install

# Navigate to gateway
cd apps/api-gateway

# Copy environment configuration
cp .env.example .env

# Edit configuration (set JWT_SECRET and service URLs)
vim .env
```

### Environment Configuration

Required environment variables:

```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long

# Backend Services
USER_SERVICE_URL=http://localhost:3001

# Optional services
CONNECTION_SERVICE_URL=http://localhost:3002
SCHEMA_SERVICE_URL=http://localhost:3003
# ... etc
```

### Development

```bash
# Start in development mode
pnpm dev

# Run type checking
pnpm type-check

# Run tests
pnpm test

# Build for production
pnpm build
```

### Production

```bash
# Build and start
pnpm build
pnpm start

# Using Docker
docker build -t pgai-api-gateway .
docker run -p 3000:3000 pgai-api-gateway
```

## Architecture

### Service Discovery

The gateway automatically registers and routes requests to backend services:

- **User Service** (`/api/v1/auth/*`, `/api/v1/users/*`)
- **Connection Service** (`/api/v1/connections/*`)
- **Schema Service** (`/api/v1/schemas/*`)
- **View Service** (`/api/v1/views/*`)
- **Versioning Service** (`/api/v1/versions/*`)
- **Documentation Service** (`/api/v1/docs/*`)

### Authentication Flow

1. Client requests JWT token via `/api/v1/auth/login`
2. Gateway proxies request to User Service
3. User Service validates credentials and returns JWT
4. Client includes JWT in `Authorization: Bearer <token>` header
5. Gateway validates JWT and extracts user context
6. Gateway forwards request to backend service with user headers

### Request Headers

The gateway adds authentication context headers for backend services:

```
x-user-id: user-uuid
x-user-email: user@example.com
x-user-role: admin|user|viewer
x-team-id: team-uuid (if applicable)
x-user-permissions: comma,separated,permissions
x-request-id: correlation-id
x-forwarded-by: pgai-gateway
x-gateway-version: 0.1.0
```

## API Documentation

### Health Endpoints

```
GET  /health           # Comprehensive health check
GET  /health/live      # Kubernetes liveness probe
GET  /health/ready     # Kubernetes readiness probe
GET  /health/services  # Backend services health
GET  /health/metrics   # System metrics
```

### Authentication Endpoints

```
POST /api/v1/auth/register     # User registration
POST /api/v1/auth/login        # User authentication  
POST /api/v1/auth/refresh      # Token refresh
POST /api/v1/auth/logout       # User logout
```

### User Management

```
GET    /api/v1/users/profile          # Get current user profile
PUT    /api/v1/users/profile          # Update user profile
PUT    /api/v1/users/change-password  # Change password
DELETE /api/v1/users/account          # Delete account
```

### Resource Endpoints

All resource endpoints support team-scoped and user-scoped access:

```
# General access
GET    /api/v1/connections
POST   /api/v1/connections
GET    /api/v1/connections/:id
PUT    /api/v1/connections/:id
DELETE /api/v1/connections/:id

# Team-scoped access
GET    /api/v1/teams/:teamId/connections
POST   /api/v1/teams/:teamId/connections

# User-scoped access
GET    /api/v1/users/:userId/connections
POST   /api/v1/users/:userId/connections
```

Similar patterns apply for `/schemas`, `/views`, `/versions`, etc.

### Admin Endpoints

```
GET    /api/v1/admin/users         # List all users (admin only)
GET    /api/v1/admin/connections   # List all connections (admin only)
# ... etc
```

## Security Features

### Rate Limiting

- **Authentication endpoints**: 5 requests per 15 minutes per IP
- **General API**: 100 requests per minute per user
- **Public endpoints**: 1000 requests per 15 minutes per IP

### Security Headers

- Content Security Policy
- HSTS (HTTP Strict Transport Security)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection

### Request Validation

- Method validation (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- Content-Type validation for body requests
- Request size limiting (default: 10MB)
- Request timeout (default: 30s)

## Monitoring

### Metrics

Prometheus metrics available at `/metrics`:

- HTTP request duration and count
- Authentication/authorization attempts
- Service proxy requests and errors
- Rate limiting hits
- Circuit breaker states
- System resource usage

### Logging

Structured JSON logging with:
- Request/response correlation IDs
- User context (when authenticated)
- Service routing information
- Performance metrics
- Security events

### Health Checks

- **Liveness**: `/health/live` - Basic service availability
- **Readiness**: `/health/ready` - Dependencies availability
- **Comprehensive**: `/health` - Full system health with backend services

## Configuration

### Environment Variables

See `.env.example` for complete configuration options.

Key configurations:

- **JWT_SECRET**: Secret key for JWT token signing/verification
- **SERVICE_URLS**: Backend service endpoints
- **RATE_LIMIT_***: Rate limiting configuration
- **LOG_LEVEL**: Logging verbosity (error, warn, info, debug)
- **ENABLE_METRICS**: Enable/disable Prometheus metrics

### Service Registry

Services are automatically registered based on environment variables. If a service URL is not provided, those routes are not registered.

## Development

### Project Structure

```
src/
├── config/           # Configuration and environment validation
├── middleware/       # Express middleware (auth, security, errors)
├── routes/          # Route definitions and handlers
├── services/        # Business logic and external service clients
├── utils/           # Utilities (auth, logging, metrics, errors)
└── __tests__/       # Test files
```

### Adding New Services

1. Add service URL to config schema in `src/config/index.ts`
2. Add service to proxy service registry in `src/services/proxy.service.ts`
3. Add routes to `src/routes/api.routes.ts`
4. Update environment example and documentation

### Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run in watch mode
pnpm test:watch
```

## Deployment

### Docker

```bash
# Build image
docker build -t pgai-api-gateway .

# Run container
docker run -d \
  --name pgai-gateway \
  -p 3000:3000 \
  -e JWT_SECRET=your-secret \
  -e USER_SERVICE_URL=http://user-service:3001 \
  pgai-api-gateway
```

### Kubernetes

The service includes proper health check endpoints for Kubernetes:

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

## Troubleshooting

### Common Issues

1. **JWT Secret Missing**: Ensure `JWT_SECRET` is set and at least 32 characters
2. **Service Unavailable**: Check backend service URLs and network connectivity
3. **CORS Errors**: Configure `CORS_ORIGIN` for your frontend domain
4. **Rate Limiting**: Adjust rate limit settings or implement user-specific limits

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug pnpm dev
DEBUG_TESTS=true pnpm test
```

### Health Check Failures

Check individual service health:

```bash
curl http://localhost:3000/health/services
```

## Contributing

1. Follow TypeScript strict mode
2. Add tests for new features
3. Update documentation
4. Follow existing code patterns
5. Ensure all lint/type checks pass

## License

MIT