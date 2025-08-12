-- CreateEnum
CREATE TYPE "schema_change_type" AS ENUM ('addition', 'modification', 'removal');

-- CreateEnum
CREATE TYPE "schema_object_type" AS ENUM ('table', 'view', 'function', 'type', 'column', 'constraint', 'index');

-- CreateEnum
CREATE TYPE "impact_level" AS ENUM ('breaking', 'potentially_breaking', 'non_breaking');

-- CreateEnum
CREATE TYPE "discovery_job_status" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "connections" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "database" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "change_detection_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_schema_update" TIMESTAMP(3),
    "schema_check_interval" INTEGER NOT NULL DEFAULT 300,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schema_snapshots" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "version_hash" TEXT NOT NULL,
    "schema_data" JSONB NOT NULL,
    "object_count" JSONB NOT NULL,
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discovery_duration_ms" INTEGER NOT NULL,

    CONSTRAINT "schema_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schema_changes" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "snapshot_id" TEXT,
    "change_type" "schema_change_type" NOT NULL,
    "object_type" "schema_object_type" NOT NULL,
    "object_identifier" TEXT NOT NULL,
    "old_definition" JSONB,
    "new_definition" JSONB,
    "impact_level" "impact_level" NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "schema_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schema_discovery_jobs" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "status" "discovery_job_status" NOT NULL,
    "requested_by" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "error" TEXT,
    "force_refresh" BOOLEAN NOT NULL DEFAULT false,
    "include_system" BOOLEAN NOT NULL DEFAULT false,
    "result_snapshot_id" TEXT,

    CONSTRAINT "schema_discovery_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "websocket_sessions" (
    "id" TEXT NOT NULL,
    "socket_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnected_at" TIMESTAMP(3),
    "last_ping_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "websocket_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "websocket_subscriptions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "subscribed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribed_at" TIMESTAMP(3),

    CONSTRAINT "websocket_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cache_metrics" (
    "id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hit_rate" DOUBLE PRECISION NOT NULL,
    "total_entries" INTEGER NOT NULL,
    "memory_usage_bytes" BIGINT NOT NULL,
    "eviction_count" INTEGER NOT NULL,

    CONSTRAINT "cache_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_health" (
    "id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cache_status" TEXT NOT NULL,
    "database_status" TEXT NOT NULL,
    "active_connections" INTEGER NOT NULL,
    "memory_usage_mb" INTEGER NOT NULL,
    "uptime_seconds" INTEGER NOT NULL,

    CONSTRAINT "service_health_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "connections_is_active_idx" ON "connections"("is_active");

-- CreateIndex
CREATE INDEX "schema_snapshots_connection_id_discovered_at_idx" ON "schema_snapshots"("connection_id", "discovered_at");

-- CreateIndex
CREATE INDEX "schema_snapshots_version_hash_idx" ON "schema_snapshots"("version_hash");

-- CreateIndex
CREATE INDEX "schema_changes_connection_id_detected_at_idx" ON "schema_changes"("connection_id", "detected_at");

-- CreateIndex
CREATE INDEX "schema_changes_change_type_object_type_idx" ON "schema_changes"("change_type", "object_type");

-- CreateIndex
CREATE INDEX "schema_changes_reviewed_detected_at_idx" ON "schema_changes"("reviewed", "detected_at");

-- CreateIndex
CREATE INDEX "schema_discovery_jobs_connection_id_requested_at_idx" ON "schema_discovery_jobs"("connection_id", "requested_at");

-- CreateIndex
CREATE INDEX "schema_discovery_jobs_status_requested_at_idx" ON "schema_discovery_jobs"("status", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "websocket_sessions_socket_id_key" ON "websocket_sessions"("socket_id");

-- CreateIndex
CREATE INDEX "websocket_sessions_user_id_connected_at_idx" ON "websocket_sessions"("user_id", "connected_at");

-- CreateIndex
CREATE INDEX "websocket_subscriptions_session_id_connection_id_idx" ON "websocket_subscriptions"("session_id", "connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "websocket_subscriptions_session_id_connection_id_key" ON "websocket_subscriptions"("session_id", "connection_id");

-- CreateIndex
CREATE INDEX "cache_metrics_recorded_at_idx" ON "cache_metrics"("recorded_at");

-- CreateIndex
CREATE INDEX "service_health_recorded_at_idx" ON "service_health"("recorded_at");

-- AddForeignKey
ALTER TABLE "schema_snapshots" ADD CONSTRAINT "schema_snapshots_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schema_changes" ADD CONSTRAINT "schema_changes_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schema_changes" ADD CONSTRAINT "schema_changes_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "schema_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schema_discovery_jobs" ADD CONSTRAINT "schema_discovery_jobs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "websocket_subscriptions" ADD CONSTRAINT "websocket_subscriptions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "websocket_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;