/**
 * Redis Socket.IO Adapter
 * 
 * Enables horizontal scaling of Socket.IO servers.
 * All socket events are broadcast via Redis pub/sub to all server instances.
 * 
 * Benefits:
 * - Multiple Socket.IO servers can handle connections
 * - Load balancing across instances
 * - Sticky sessions not required (but recommended)
 */

import { createAdapter } from '@socket.io/redis-adapter';
import { Server as SocketServer } from 'socket.io';
import { getRedisPub, getRedisSub, isRedisAvailable } from './index';

/**
 * Configure Socket.IO server with Redis adapter for horizontal scaling
 */
export async function configureRedisAdapter(io: SocketServer): Promise<boolean> {
  try {
    const available = await isRedisAvailable();
    if (!available) {
      console.log('⚠️ Redis not available, using in-memory adapter (single server only)');
      return false;
    }

    const pubClient = getRedisPub();
    const subClient = getRedisSub();

    // Create and attach the Redis adapter
    io.adapter(createAdapter(pubClient, subClient));
    
    console.log('✅ Socket.IO Redis adapter configured for horizontal scaling');
    return true;
  } catch (error) {
    console.error('❌ Failed to configure Redis adapter:', error);
    return false;
  }
}

/**
 * Emit to all servers (useful for admin broadcasts)
 */
export function emitToAllServers(
  io: SocketServer,
  event: string,
  data: unknown
): void {
  io.emit(event, data);
}

/**
 * Get connected socket count across all servers
 */
export async function getGlobalSocketCount(io: SocketServer): Promise<number> {
  const sockets = await io.fetchSockets();
  return sockets.length;
}

/**
 * Get all room members across all servers
 */
export async function getGlobalRoomMembers(
  io: SocketServer,
  room: string
): Promise<string[]> {
  const sockets = await io.in(room).fetchSockets();
  return sockets.map(s => s.id);
}
