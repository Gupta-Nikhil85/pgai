import { Server as SocketIOServer } from 'socket.io';
import { createLogger } from '../utils/logger';
import { SchemaChange, DatabaseSchema } from '../types/schema.types';
import { recordWebSocketMessage, updateWebSocketMetrics } from '../utils/metrics';
import { DatabaseService } from './database.service.mock';

const logger = createLogger('WebSocketService');

interface ClientSubscription {
  socketId: string;
  connectionId: string;
  userId: string;
  subscribedAt: string;
}

export class WebSocketService {
  private io: SocketIOServer;
  private databaseService?: DatabaseService;
  private connectedClients = new Map<string, ClientSubscription>();
  private connectionSubscriptions = new Map<string, Set<string>>(); // connectionId -> socketIds

  constructor(io: SocketIOServer, databaseService?: DatabaseService) {
    this.io = io;
    this.databaseService = databaseService;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      const clientInfo = {
        socketId: socket.id,
        userId: socket.handshake.auth?.userId || 'anonymous',
        connectedAt: new Date().toISOString(),
      };

      logger.info('Client connected', clientInfo);
      this.updateMetrics();

      // Create WebSocket session in database if database service is available
      if (this.databaseService) {
        this.databaseService.createWebSocketSession({
          socketId: socket.id,
          userId: clientInfo.userId,
        }).catch(error => {
          logger.warn('Failed to create WebSocket session in database', {
            error: error.message,
            socketId: socket.id,
          });
        });
      }

      // Handle schema subscription
      socket.on('subscribe:schema', (data: { connectionId: string }) => {
        this.handleSchemaSubscription(socket, data.connectionId, clientInfo.userId);
      });

      // Handle schema unsubscription
      socket.on('unsubscribe:schema', (data: { connectionId: string }) => {
        this.handleSchemaUnsubscription(socket, data.connectionId);
      });

      // Handle ping for connection health
      socket.on('ping', () => {
        socket.emit('pong', {
          timestamp: new Date().toISOString(),
          server: 'schema-service',
        });
        recordWebSocketMessage('ping');
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        logger.info('Client disconnected', {
          socketId: socket.id,
          reason,
          userId: clientInfo.userId,
        });
        this.handleClientDisconnect(socket.id);

        // Close WebSocket session in database
        if (this.databaseService) {
          this.databaseService.closeWebSocketSession(socket.id).catch(error => {
            logger.warn('Failed to close WebSocket session in database', {
              error: error.message,
              socketId: socket.id,
            });
          });
        }
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error('Socket error', error, {
          socketId: socket.id,
          userId: clientInfo.userId,
        });
      });
    });

    // Handle server-level errors
    this.io.engine.on('connection_error', (error) => {
      logger.error('Connection error', error);
    });
  }

  private handleSchemaSubscription(socket: any, connectionId: string, userId: string): void {
    try {
      const subscription: ClientSubscription = {
        socketId: socket.id,
        connectionId,
        userId,
        subscribedAt: new Date().toISOString(),
      };

      // Add to client tracking
      this.connectedClients.set(socket.id, subscription);

      // Add to connection subscriptions
      if (!this.connectionSubscriptions.has(connectionId)) {
        this.connectionSubscriptions.set(connectionId, new Set());
      }
      this.connectionSubscriptions.get(connectionId)!.add(socket.id);

      // Join socket room for this connection
      socket.join(`schema:${connectionId}`);

      socket.emit('subscription:confirmed', {
        connectionId,
        subscribedAt: subscription.subscribedAt,
        message: `Subscribed to schema updates for connection ${connectionId}`,
      });

      logger.info('Client subscribed to schema updates', {
        socketId: socket.id,
        connectionId,
        userId,
      });

      recordWebSocketMessage('subscription');
    } catch (error) {
      logger.error('Failed to handle schema subscription', error as Error, {
        socketId: socket.id,
        connectionId,
        userId,
      });

      socket.emit('subscription:error', {
        connectionId,
        error: 'Failed to subscribe to schema updates',
      });
    }
  }

  private handleSchemaUnsubscription(socket: any, connectionId: string): void {
    try {
      const subscription = this.connectedClients.get(socket.id);
      
      if (subscription && subscription.connectionId === connectionId) {
        // Remove from connection subscriptions
        const subscribers = this.connectionSubscriptions.get(connectionId);
        if (subscribers) {
          subscribers.delete(socket.id);
          if (subscribers.size === 0) {
            this.connectionSubscriptions.delete(connectionId);
          }
        }

        // Leave socket room
        socket.leave(`schema:${connectionId}`);

        socket.emit('unsubscription:confirmed', {
          connectionId,
          message: `Unsubscribed from schema updates for connection ${connectionId}`,
        });

        logger.info('Client unsubscribed from schema updates', {
          socketId: socket.id,
          connectionId,
          userId: subscription.userId,
        });

        recordWebSocketMessage('unsubscription');
      }
    } catch (error) {
      logger.error('Failed to handle schema unsubscription', error as Error, {
        socketId: socket.id,
        connectionId,
      });
    }
  }

  private handleClientDisconnect(socketId: string): void {
    const subscription = this.connectedClients.get(socketId);
    
    if (subscription) {
      // Remove from connection subscriptions
      const subscribers = this.connectionSubscriptions.get(subscription.connectionId);
      if (subscribers) {
        subscribers.delete(socketId);
        if (subscribers.size === 0) {
          this.connectionSubscriptions.delete(subscription.connectionId);
        }
      }

      // Remove from client tracking
      this.connectedClients.delete(socketId);
    }

    this.updateMetrics();
  }

  private updateMetrics(): void {
    updateWebSocketMetrics(this.connectedClients.size);
  }

  // Public methods for schema service to broadcast updates

  /**
   * Broadcast schema change to all subscribers of a connection
   */
  public broadcastSchemaChange(connectionId: string, change: SchemaChange): void {
    try {
      const room = `schema:${connectionId}`;
      const subscriberCount = this.connectionSubscriptions.get(connectionId)?.size || 0;

      if (subscriberCount > 0) {
        this.io.to(room).emit('schema:change', {
          connectionId,
          change,
          timestamp: new Date().toISOString(),
        });

        logger.info('Broadcasted schema change', {
          connectionId,
          changeType: change.change_type,
          subscriberCount,
        });

        recordWebSocketMessage('schema_change');
      }
    } catch (error) {
      logger.error('Failed to broadcast schema change', error as Error, {
        connectionId,
        change,
      });
    }
  }

  /**
   * Broadcast schema discovery completion
   */
  public broadcastSchemaDiscovered(connectionId: string, schema: DatabaseSchema): void {
    try {
      const room = `schema:${connectionId}`;
      const subscriberCount = this.connectionSubscriptions.get(connectionId)?.size || 0;

      if (subscriberCount > 0) {
        this.io.to(room).emit('schema:discovered', {
          connectionId,
          schema: {
            version_hash: schema.version_hash,
            last_updated: schema.last_updated,
            object_count: schema.object_count,
            discovery_duration_ms: schema.discovery_duration_ms,
          },
          timestamp: new Date().toISOString(),
        });

        logger.info('Broadcasted schema discovery completion', {
          connectionId,
          objectCount: schema.object_count,
          subscriberCount,
        });

        recordWebSocketMessage('schema_discovered');
      }
    } catch (error) {
      logger.error('Failed to broadcast schema discovery', error as Error, {
        connectionId,
      });
    }
  }

  /**
   * Broadcast cache invalidation
   */
  public broadcastCacheInvalidated(connectionId: string): void {
    try {
      const room = `schema:${connectionId}`;
      const subscriberCount = this.connectionSubscriptions.get(connectionId)?.size || 0;

      if (subscriberCount > 0) {
        this.io.to(room).emit('schema:cache_invalidated', {
          connectionId,
          message: 'Schema cache has been invalidated',
          timestamp: new Date().toISOString(),
        });

        logger.info('Broadcasted cache invalidation', {
          connectionId,
          subscriberCount,
        });

        recordWebSocketMessage('cache_invalidated');
      }
    } catch (error) {
      logger.error('Failed to broadcast cache invalidation', error as Error, {
        connectionId,
      });
    }
  }

  /**
   * Get connection statistics
   */
  public getConnectionStats() {
    const connectionStats = new Map<string, number>();
    
    for (const [connectionId, subscribers] of this.connectionSubscriptions) {
      connectionStats.set(connectionId, subscribers.size);
    }

    return {
      total_clients: this.connectedClients.size,
      total_connections_monitored: this.connectionSubscriptions.size,
      connection_subscribers: Object.fromEntries(connectionStats),
      active_subscriptions: Array.from(this.connectedClients.values()).map(sub => ({
        socket_id: sub.socketId,
        connection_id: sub.connectionId,
        user_id: sub.userId,
        subscribed_at: sub.subscribedAt,
      })),
    };
  }

  /**
   * Send direct message to a specific client
   */
  public sendToClient(socketId: string, event: string, data: any): boolean {
    try {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event, data);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to send message to client', error as Error, {
        socketId,
        event,
      });
      return false;
    }
  }

  /**
   * Disconnect a client
   */
  public disconnectClient(socketId: string, reason?: string): boolean {
    try {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
        logger.info('Disconnected client', { socketId, reason });
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to disconnect client', error as Error, {
        socketId,
        reason,
      });
      return false;
    }
  }

  /**
   * Cleanup and shutdown
   */
  public async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down WebSocket service', {
        connectedClients: this.connectedClients.size,
      });

      // Disconnect all clients gracefully
      this.io.emit('server:shutdown', {
        message: 'Server is shutting down',
        timestamp: new Date().toISOString(),
      });

      // Give clients time to receive the message
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Clear tracking data
      this.connectedClients.clear();
      this.connectionSubscriptions.clear();

      logger.info('WebSocket service shutdown completed');
    } catch (error) {
      logger.error('Error during WebSocket service shutdown', error as Error);
    }
  }
}