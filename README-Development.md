# pgai Platform - Development Guide

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Docker & Docker Compose
- jq (for integration tests)

### 1. Start Database Services

```bash
# Start PostgreSQL and Redis
docker compose up -d postgres redis

# Check services are healthy
docker compose ps
```

### 2. Set Up Database

```bash
# Install dependencies
pnpm install

# Run migrations and seed data
pnpm db:migrate
pnpm db:seed
```

### 3. Start Services (Development Mode)

#### Option A: Start Services Individually

```bash
# Terminal 1: Start User Service
pnpm --filter user-service dev

# Terminal 2: Start API Gateway  
pnpm --filter api-gateway dev
```

#### Option B: Start All Services with Docker

```bash
# Start all services including monitoring
docker compose -f docker-compose.dev.yml up -d

# View logs
docker compose -f docker-compose.dev.yml logs -f
```

### 4. Verify Services

```bash
# Check service health
curl http://localhost:3001/health  # User Service
curl http://localhost:3000/health  # API Gateway

# Run integration tests
./test-integration.sh
```

## 📋 Service URLs

- **API Gateway**: http://localhost:3000
- **User Service**: http://localhost:3001 
- **PostgreSQL**: localhost:5434
- **Redis**: localhost:6380
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3100 (admin/admin)

## 🧪 Testing

### Unit Tests

```bash
# Test individual services
pnpm --filter user-service test
pnpm --filter api-gateway test

# Test all packages
pnpm test
```

### Integration Tests

```bash
# Make sure services are running first
./test-integration.sh
```

### Manual API Testing

#### 1. Register a User

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "firstName": "Test",
    "lastName": "User"
  }'
```

#### 2. Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com", 
    "password": "password123"
  }'
```

#### 3. Access Protected Endpoint

```bash
# Use the token from login response
curl -X GET http://localhost:3000/api/v1/users/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 👥 Test Users

The database is seeded with these test users:

- **Admin**: admin@pgai.local / admin123!
- **Developer**: developer@pgai.local / dev123!  
- **Viewer**: viewer@pgai.local / viewer123!

## 🔧 Configuration

### Environment Variables

Both services use `.env` files in their directories:

- `apps/user-service/.env`
- `apps/api-gateway/.env`

Key configuration:

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/pgai_dev

# JWT
JWT_SECRET=development-super-secret-jwt-key-for-testing-only-32-chars-minimum
JWT_REFRESH_SECRET=development-super-secret-refresh-key-for-testing-only-32-chars-minimum

# Service URLs
USER_SERVICE_URL=http://localhost:3001
```

## 📊 Monitoring

- **Metrics**: http://localhost:3000/metrics
- **Health Checks**: 
  - http://localhost:3000/health (comprehensive)
  - http://localhost:3000/health/live (liveness)
  - http://localhost:3000/health/ready (readiness)

## 🛠️ Development Workflow

### Making Changes

1. Services auto-reload in development mode
2. TypeScript compilation is handled automatically
3. Database changes require new migrations:

```bash
# Create migration
pnpm db:migrate --name add-new-feature

# Reset database (careful!)
pnpm db:reset
```

### Adding New Services

1. Create new service in `apps/new-service/`
2. Add to `pnpm-workspace.yaml`
3. Add service URL to API Gateway config
4. Add proxy routes in `apps/api-gateway/src/routes/api.routes.ts`

### Debugging

```bash
# View service logs
docker compose -f docker-compose.dev.yml logs -f user-service
docker compose -f docker-compose.dev.yml logs -f api-gateway

# Debug database
pnpm db:studio

# Check metrics
curl http://localhost:3000/metrics | grep http_requests_total
```

## 🚨 Troubleshooting

### Common Issues

1. **Port conflicts**: Change ports in docker-compose.yml
2. **Database connection**: Check DATABASE_URL and postgres health
3. **JWT errors**: Ensure JWT_SECRET is set and matches between services
4. **CORS issues**: Check CORS_ORIGIN setting in API Gateway

### Reset Everything

```bash
# Stop all services
docker compose -f docker-compose.dev.yml down

# Remove volumes (deletes data!)  
docker compose -f docker-compose.dev.yml down -v

# Restart fresh
pnpm db:reset
docker compose -f docker-compose.dev.yml up -d
```

## 🎯 Next Steps

1. Add Connection Service for database management
2. Add Schema Service for schema introspection  
3. Add View Service for view management
4. Add frontend application
5. Add end-to-end tests
6. Set up CI/CD pipeline

## 📚 API Documentation

- **API Gateway Root**: http://localhost:3000/ (interactive docs)
- **OpenAPI Spec**: Generated automatically from routes
- **Health Endpoints**: Comprehensive health information at `/health`

## 🔐 Security Notes

- JWT secrets are for development only
- Database credentials are default/insecure
- CORS is permissive for development
- Rate limiting is relaxed for testing

For production deployment, ensure all secrets are properly configured!