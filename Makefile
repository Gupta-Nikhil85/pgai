# PGAI Microservices Development Environment
.PHONY: help start stop restart status logs clean dev-all dev-gateway dev-user dev-schema dev-connection docker-up docker-down docker-restart

# Default target
help: ## Show this help message
	@echo "PGAI Development Environment Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Quick Start:"
	@echo "  make start    # Start all services (infrastructure + apps)"
	@echo "  make status   # Check status of all services"
	@echo "  make logs     # Show logs from all services"
	@echo "  make stop     # Stop all services"

# Infrastructure commands
docker-up: ## Start Docker infrastructure (PostgreSQL, Redis)
	@echo "🐳 Starting Docker infrastructure..."
	@docker compose up -d postgres redis
	@echo "⏳ Waiting for containers to be healthy..."
	@sleep 5
	@docker ps --filter "name=pgai-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

docker-down: ## Stop Docker infrastructure
	@echo "🛑 Stopping Docker infrastructure..."
	@docker compose down

docker-restart: ## Restart Docker infrastructure
	@make docker-down
	@make docker-up

docker-logs: ## Show Docker container logs
	@docker compose logs -f postgres redis

# Service commands
dev-gateway: ## Start API Gateway in development mode
	@echo "🚪 Starting API Gateway on port 3000..."
	@cd apps/api-gateway && npm run dev

dev-user: ## Start User Service in development mode
	@echo "👤 Starting User Service on port 3001..."
	@cd apps/user-service && npm run dev

dev-schema: ## Start Schema Service in development mode
	@echo "📊 Starting Schema Service on port 3003..."
	@cd apps/schema-service && npm run dev

dev-connection: ## Start Connection Service in development mode
	@echo "🔗 Starting Connection Service on port 3002..."
	@cd apps/connection-service && npm run dev

# Combined commands
start: ## Start all services (infrastructure + apps)
	@echo "🚀 Starting PGAI Development Environment..."
	@make docker-up
	@echo ""
	@echo "🔄 Starting all microservices..."
	@echo "📝 Note: Services will start in background. Use 'make logs' to monitor."
	@echo ""
	@echo "Starting services in parallel..."
	@(cd apps/api-gateway && npm run dev > /tmp/pgai-gateway.log 2>&1 &)
	@(cd apps/user-service && npm run dev > /tmp/pgai-user.log 2>&1 &)
	@(cd apps/schema-service && npm run dev > /tmp/pgai-schema.log 2>&1 &)
	@(cd apps/connection-service && npm run dev > /tmp/pgai-connection.log 2>&1 &)
	@sleep 10
	@echo "✅ All services started! Check status with 'make status'"
	@make status

stop: ## Stop all services
	@echo "🛑 Stopping all services..."
	@pkill -f "api-gateway" || true
	@pkill -f "user-service" || true
	@pkill -f "schema-service" || true
	@pkill -f "connection-service" || true
	@make docker-down
	@echo "✅ All services stopped"

restart: ## Restart all services
	@make stop
	@sleep 3
	@make start

# Monitoring commands
status: ## Check status of all services
	@echo "📊 Service Status Check:"
	@echo ""
	@echo "🐳 Docker Containers:"
	@docker ps --filter "name=pgai-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || echo "No containers running"
	@echo ""
	@echo "🌐 Service Endpoints:"
	@echo "Checking service health..."
	@timeout 5 curl -s http://localhost:3000/health > /dev/null && echo "✅ API Gateway (3000) - Healthy" || echo "❌ API Gateway (3000) - Unhealthy"
	@timeout 5 curl -s http://localhost:3001/health > /dev/null && echo "✅ User Service (3001) - Healthy" || echo "❌ User Service (3001) - Unhealthy"
	@timeout 5 curl -s http://localhost:3002/health > /dev/null && echo "✅ Connection Service (3002) - Healthy" || echo "❌ Connection Service (3002) - Unhealthy"
	@timeout 5 curl -s http://localhost:3003/health > /dev/null && echo "✅ Schema Service (3003) - Healthy" || echo "❌ Schema Service (3003) - Unhealthy"
	@echo ""
	@echo "🔗 API Gateway Health Summary:"
	@timeout 5 curl -s http://localhost:3000/health | jq -r '.data.checks | to_entries[] | "  \(.key): \(.value.status)"' 2>/dev/null || echo "  API Gateway not responding"

logs: ## Show logs from all services
	@echo "📋 Service Logs (press Ctrl+C to stop):"
	@echo "Gateway logs: tail -f /tmp/pgai-gateway.log"
	@echo "User logs: tail -f /tmp/pgai-user.log"
	@echo "Schema logs: tail -f /tmp/pgai-schema.log"
	@echo "Connection logs: tail -f /tmp/pgai-connection.log"
	@echo ""
	@echo "Showing combined logs..."
	@tail -f /tmp/pgai-*.log 2>/dev/null || echo "No service logs found. Services may not be running."

logs-gateway: ## Show API Gateway logs only
	@tail -f /tmp/pgai-gateway.log

logs-user: ## Show User Service logs only
	@tail -f /tmp/pgai-user.log

logs-schema: ## Show Schema Service logs only
	@tail -f /tmp/pgai-schema.log

logs-connection: ## Show Connection Service logs only
	@tail -f /tmp/pgai-connection.log

# Development commands
install: ## Install all dependencies
	@echo "📦 Installing dependencies..."
	@pnpm install

build: ## Build all services
	@echo "🔨 Building all services..."
	@pnpm run build

test: ## Run all tests
	@echo "🧪 Running tests..."
	@pnpm run test

lint: ## Run linting
	@echo "🔍 Running linter..."
	@pnpm run lint

clean: ## Clean logs and temporary files
	@echo "🧹 Cleaning temporary files..."
	@rm -f /tmp/pgai-*.log
	@echo "✅ Cleanup complete"

# Health check commands
health: ## Check API Gateway comprehensive health
	@echo "🏥 Comprehensive Health Check:"
	@curl -s http://localhost:3000/health | jq '.' || echo "API Gateway not responding"

health-individual: ## Check individual service health
	@echo "🔍 Individual Service Health:"
	@echo "API Gateway (3000):"
	@curl -s http://localhost:3000/health | jq '.data.checks.gateway' || echo "Not responding"
	@echo ""
	@echo "User Service (3001):"
	@curl -s http://localhost:3001/health | jq '.data.status' || echo "Not responding"
	@echo ""
	@echo "Connection Service (3002):"
	@curl -s http://localhost:3002/health | jq '.data.status' || echo "Not responding"
	@echo ""
	@echo "Schema Service (3003):"
	@curl -s http://localhost:3003/health | jq '.data.status' || echo "Not responding"

# Quick development shortcuts
dev: start ## Alias for start
all: start ## Alias for start

# Environment info
info: ## Show environment information
	@echo "📋 Environment Information:"
	@echo "Node version: $(shell node --version)"
	@echo "NPM version: $(shell npm --version)"
	@echo "PNPM version: $(shell pnpm --version)"
	@echo "Docker version: $(shell docker --version)"
	@echo "Current directory: $(PWD)"
	@echo ""
	@echo "Expected Service Ports:"
	@echo "  API Gateway: http://localhost:3000"
	@echo "  User Service: http://localhost:3001"
	@echo "  Connection Service: http://localhost:3002"
	@echo "  Schema Service: http://localhost:3003"
	@echo "  PostgreSQL: localhost:5434"
	@echo "  Redis: localhost:6380"