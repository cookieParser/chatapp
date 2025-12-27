import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import mongoose from 'mongoose';
import { connectDB, Message, Conversation, User } from '@/lib/db';
import { SOCKET_THROTTLE } from '@/lib/constants';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  SendMessagePayload,
  MessagePayload,
  MessageStatusPayload,
  BatchMessageStatusPayload,
  PresencePayload,
  UserStatus,
} from './types';
import {
  checkRateLimit,
  socketRateLimitKey,
  RATE_LIMITS,
  validateSendMessagePayload,
  validateConversationId,
  validateMessageIds,
  validateUserIds,
  isValidObjectId,
  sanitizeMessage,
  sanitizeUsername,
} from '@/lib/security';

type SocketServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type SocketClient = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// Track online users: Map<userId, Set<socketId>>
const onlineUsers = new Map<string, Set<string>>();

// Track last seen timestamps: Map<userId, Date>
const lastSeenMap = new Map<string, Date>();

// Track presence subscriptions: Map<socketId, Set<userId>>
const presenceSubscriptions = new Map<string, Set<string>>();

// Track typing users per conversation: Map<conversationId, Map<userId, { username, timeout }>>
const typingUsers = new Map<string, Map<string, { username: string; timeout: NodeJS.Timeout }>>();

// Batch receipt queues per socket: Map<socketId, { delivered: Map, read: Map }>
const receiptQueues = new Map<string, {
  delivered: Map<string, Set<string>>;
  read: Map<string, Set<string>>;
  flushTimeout?: NodeJS.Timeout;
}>();

function getOrCreateReceiptQueue(socketId: string) {
  if (!receiptQueues.has(socketId)) {
    receiptQueues.set(socketId, {
      delivered: new Map(),
      read: new Map(),
    });
  }
  return receiptQueues.get(socketId)!;
}

function clearTypingUser(conversationId: string, userId: string, io: SocketServer) {
  const conversationTyping = typingUsers.get(conversationId);
  if (conversationTyping?.has(userId)) {
    const userData = conversationTyping.get(userId)!;
    clearTimeout(userData.timeout);
    conversationTyping.delete(userId);
    
    if (conversationTyping.size === 0) {
      typingUsers.delete(conversationId);
    }
    
    // Broadcast updated typing list
    io.to(`conversation:${conversationId}`).emit('typing:update', {
      conversationId,
      users: Array.from(conversationTyping?.values() || []).map(u => ({
        userId: Array.from(conversationTyping?.entries() || []).find(([_, v]) => v === u)?.[0] || '',
        username: u.username,
      })),
    });
  }
}

// Helper to get user presence
function getUserPresence(userId: string): PresencePayload {
  const isOnline = onlineUsers.has(userId);
  const lastSeen = lastSeenMap.get(userId) || new Date();
  return {
    userId,
    status: isOnline ? 'online' : 'offline',
    lastSeen: lastSeen.toISOString(),
  };
}

// Helper to broadcast presence update to subscribers
function broadcastPresenceUpdate(userId: string, io: SocketServer) {
  const presence = getUserPresence(userId);
  // Broadcast to all sockets subscribed to this user's presence
  presenceSubscriptions.forEach((subscribedUsers, socketId) => {
    if (subscribedUsers.has(userId)) {
      io.to(socketId).emit('presence:update', presence);
    }
  });
  // Also broadcast general online/offline events
  if (presence.status === 'online') {
    io.emit('user:online', userId);
  } else {
    io.emit('user:offline', userId);
  }
}

// Helper to update last seen in database (debounced)
const lastSeenUpdateQueue = new Map<string, NodeJS.Timeout>();
async function updateLastSeenInDB(userId: string) {
  // Clear existing timeout
  if (lastSeenUpdateQueue.has(userId)) {
    clearTimeout(lastSeenUpdateQueue.get(userId)!);
  }
  // Debounce DB updates to avoid too many writes
  const timeout = setTimeout(async () => {
    try {
      await User.findByIdAndUpdate(userId, {
        lastSeen: lastSeenMap.get(userId) || new Date(),
        status: onlineUsers.has(userId) ? 'online' : 'offline',
      });
      lastSeenUpdateQueue.delete(userId);
    } catch (error) {
      console.error('Error updating lastSeen in DB:', error);
    }
  }, 5000); // 5 second debounce
  lastSeenUpdateQueue.set(userId, timeout);
}

export function createSocketServer(httpServer: HttpServer): SocketServer {
  // Allow multiple origins - localhost for dev, production URLs for deployed apps
  const configuredOrigins = (process.env.NEXT_PUBLIC_APP_URL || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  
  // Default allowed origins (always allow these)
  const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
  ];
  
  const allowedOrigins = [...new Set([...defaultOrigins, ...configuredOrigins])];

  const io: SocketServer = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6,
  });

  // Connection rate limiting middleware
  io.use(async (socket, next) => {
    const clientIp = socket.handshake.address || 'unknown';
    const rateLimitResult = checkRateLimit(
      `connection:${clientIp}`,
      RATE_LIMITS.CONNECTION
    );
    
    if (!rateLimitResult.success) {
      return next(new Error('Too many connection attempts. Please try again later.'));
    }
    next();
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const userId = socket.handshake.auth.userId;
      const username = socket.handshake.auth.username;

      if (!userId || !username) {
        return next(new Error('Authentication required'));
      }

      // Validate userId format
      if (!isValidObjectId(userId) && !/^[a-zA-Z0-9_-]{1,50}$/.test(userId)) {
        return next(new Error('Invalid user ID format'));
      }

      // Sanitize username
      const sanitizedUsername = sanitizeUsername(username);
      if (!sanitizedUsername || sanitizedUsername.length < 1) {
        return next(new Error('Invalid username'));
      }

      socket.data.userId = userId;
      socket.data.username = sanitizedUsername;
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket: SocketClient) => {
    const { userId, username } = socket.data;
    console.log(`User connected: ${username} (${userId})`);

    await connectDB();

    // Track user online status and update last seen
    const wasOffline = !onlineUsers.has(userId);
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);
    lastSeenMap.set(userId, new Date());

    // Initialize presence subscriptions for this socket
    presenceSubscriptions.set(socket.id, new Set());

    // Broadcast presence update if user just came online
    if (wasOffline) {
      broadcastPresenceUpdate(userId, io);
      updateLastSeenInDB(userId);
    }

    // Auto-join user's conversations
    await joinUserConversations(socket, userId);

    // Handle joining a conversation room
    socket.on('conversation:join', (conversationId: string) => {
      // Validate conversation ID
      const validation = validateConversationId(conversationId);
      if (!validation.valid) {
        socket.emit('error', { message: validation.error || 'Invalid conversation ID' });
        return;
      }
      socket.join(`conversation:${conversationId}`);
      console.log(`${username} joined conversation: ${conversationId}`);
    });

    // Handle leaving a conversation room
    socket.on('conversation:leave', (conversationId: string) => {
      // Validate conversation ID
      const validation = validateConversationId(conversationId);
      if (!validation.valid) {
        return; // Silently ignore invalid leave requests
      }
      socket.leave(`conversation:${conversationId}`);
      console.log(`${username} left conversation: ${conversationId}`);
    });


    // Handle sending messages
    socket.on('message:send', async (data: SendMessagePayload, callback) => {
      try {
        // Rate limit check
        const rateLimitResult = checkRateLimit(
          socketRateLimitKey(userId, 'message:send'),
          RATE_LIMITS.MESSAGE_SEND
        );
        if (!rateLimitResult.success) {
          return callback({ success: false, error: rateLimitResult.error });
        }

        // Validate and sanitize payload
        const validation = validateSendMessagePayload(data);
        if (!validation.valid || !validation.data) {
          return callback({ success: false, error: validation.error || 'Invalid message data' });
        }

        const { conversationId, type = 'text', replyToId } = validation.data;
        // Sanitize message content
        const content = sanitizeMessage(validation.data.content);
        
        if (!content) {
          return callback({ success: false, error: 'Message content cannot be empty' });
        }

        // Try to convert userId to ObjectId, skip validation if it fails
        let userObjectId: mongoose.Types.ObjectId;
        try {
          userObjectId = new mongoose.Types.ObjectId(userId);
        } catch {
          return callback({ success: false, error: 'Invalid user ID' });
        }

        // Validate conversation exists and user is a participant
        const conversation = await Conversation.findOne({
          _id: conversationId,
          'participants.user': userObjectId,
          'participants.isActive': true,
        });

        if (!conversation) {
          return callback({ success: false, error: 'Conversation not found or access denied' });
        }

        // Create and save the message
        const message = await Message.create({
          conversation: conversationId,
          sender: userObjectId,
          content,
          type,
          replyTo: replyToId,
          statusPerUser: [{ user: userObjectId, status: 'sent', updatedAt: new Date() }],
        });

        // Populate sender info
        await message.populate('sender', '_id name image');

        // Update conversation's last message
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: message._id,
          lastMessageAt: message.createdAt,
        });

        const messagePayload: MessagePayload = {
          _id: message._id.toString(),
          conversation: conversationId,
          sender: {
            _id: (message.sender as any)._id.toString(),
            username: sanitizeUsername((message.sender as any).name || username),
            image: (message.sender as any).image,
          },
          content: message.content,
          type: message.type,
          createdAt: message.createdAt.toISOString(),
          replyTo: message.replyTo?.toString(),
        };

        // Broadcast to all users in the conversation (except sender)
        socket.to(`conversation:${conversationId}`).emit('message:new', messagePayload);

        // Clear sender's typing indicator
        clearTypingUser(conversationId, userId, io);

        // Send success response to sender with delivery confirmation
        callback({ success: true, message: messagePayload });
      } catch (error) {
        console.error('Error sending message:', error);
        callback({ success: false, error: 'Failed to send message' });
      }
    });

    // Handle message delivered status
    socket.on('message:delivered', async (data: MessageStatusPayload) => {
      try {
        const { messageId, conversationId } = data;

        // Validate IDs
        if (!isValidObjectId(messageId) || !isValidObjectId(conversationId)) {
          return;
        }

        await Message.findByIdAndUpdate(messageId, {
          $push: {
            statusPerUser: {
              user: new mongoose.Types.ObjectId(userId),
              status: 'delivered',
              updatedAt: new Date(),
            },
          },
        });

        // Notify the sender
        socket.to(`conversation:${conversationId}`).emit('message:delivered', {
          messageId,
          conversationId,
          userId,
        });
      } catch (error) {
        console.error('Error updating message delivered status:', error);
      }
    });

    // Handle message read status
    socket.on('message:read', async (data: MessageStatusPayload) => {
      try {
        const { messageId, conversationId } = data;

        // Validate IDs
        if (!isValidObjectId(messageId) || !isValidObjectId(conversationId)) {
          return;
        }

        await Message.findOneAndUpdate(
          { _id: messageId, 'statusPerUser.user': new mongoose.Types.ObjectId(userId) },
          { $set: { 'statusPerUser.$.status': 'read', 'statusPerUser.$.updatedAt': new Date() } }
        );

        // Notify the sender
        socket.to(`conversation:${conversationId}`).emit('message:read', {
          messageId,
          conversationId,
          userId,
        });
      } catch (error) {
        console.error('Error updating message read status:', error);
      }
    });

    // Handle batch delivered status (optimized for multiple messages)
    socket.on('message:delivered:batch', async (data: BatchMessageStatusPayload) => {
      console.log(`[DELIVERED] ${username} confirmed ${data.messageIds.length} messages`);
      try {
        const { conversationId, messageIds } = data;
        
        // Validate conversation ID
        if (!isValidObjectId(conversationId)) return;
        
        // Validate message IDs
        const validation = validateMessageIds(messageIds);
        if (!validation.valid) return;
        
        if (messageIds.length > SOCKET_THROTTLE.MAX_BATCH_SIZE) return;

        const objectIds = messageIds.map(id => new mongoose.Types.ObjectId(id));
        const userObjectId = new mongoose.Types.ObjectId(userId);

        await Message.updateMany(
          {
            _id: { $in: objectIds },
            conversation: conversationId,
            sender: { $ne: userObjectId },
            'statusPerUser.user': { $ne: userObjectId },
          },
          {
            $push: {
              statusPerUser: {
                user: userObjectId,
                status: 'delivered',
                updatedAt: new Date(),
              },
            },
          }
        );

        // Notify conversation participants
        socket.to(`conversation:${conversationId}`).emit('message:delivered:batch', {
          conversationId,
          messageIds,
          userId,
          username,
        });
      } catch (error) {
        console.error('Error batch updating delivered status:', error);
      }
    });

    // Handle batch read status (optimized for multiple messages)
    socket.on('message:read:batch', async (data: BatchMessageStatusPayload) => {
      console.log(`[READ] ${username} read ${data.messageIds.length} messages`);
      try {
        const { conversationId, messageIds } = data;
        
        // Validate conversation ID
        if (!isValidObjectId(conversationId)) return;
        
        // Validate message IDs
        const validation = validateMessageIds(messageIds);
        if (!validation.valid) return;
        
        if (messageIds.length > SOCKET_THROTTLE.MAX_BATCH_SIZE) return;

        const objectIds = messageIds.map(id => new mongoose.Types.ObjectId(id));
        const userObjectId = new mongoose.Types.ObjectId(userId);

        // First, add status entry for messages that don't have one for this user
        await Message.updateMany(
          {
            _id: { $in: objectIds },
            conversation: conversationId,
            sender: { $ne: userObjectId },
            'statusPerUser.user': { $ne: userObjectId },
          },
          {
            $push: {
              statusPerUser: {
                user: userObjectId,
                status: 'read',
                updatedAt: new Date(),
              },
            },
          }
        );

        // Then update existing entries to read
        await Message.updateMany(
          {
            _id: { $in: objectIds },
            conversation: conversationId,
            sender: { $ne: userObjectId },
            'statusPerUser.user': userObjectId,
          },
          {
            $set: {
              'statusPerUser.$[elem].status': 'read',
              'statusPerUser.$[elem].updatedAt': new Date(),
            },
          },
          {
            arrayFilters: [{ 'elem.user': userObjectId }],
          }
        );

        // Notify conversation participants
        socket.to(`conversation:${conversationId}`).emit('message:read:batch', {
          conversationId,
          messageIds,
          userId,
          username,
        });
      } catch (error) {
        console.error('Error batch updating read status:', error);
      }
    });


    // Handle typing indicators with auto-timeout
    socket.on('typing:start', (conversationId: string) => {
      // Validate conversation ID
      if (!isValidObjectId(conversationId)) return;
      
      // Rate limit typing events
      const rateLimitResult = checkRateLimit(
        socketRateLimitKey(userId, 'typing'),
        RATE_LIMITS.TYPING
      );
      if (!rateLimitResult.success) return;

      console.log(`[TYPING] ${username} started typing in ${conversationId}`);
      if (!typingUsers.has(conversationId)) {
        typingUsers.set(conversationId, new Map());
      }
      
      const conversationTyping = typingUsers.get(conversationId)!;
      
      // Clear existing timeout if any
      if (conversationTyping.has(userId)) {
        clearTimeout(conversationTyping.get(userId)!.timeout);
      }
      
      // Set auto-clear timeout
      const timeout = setTimeout(() => {
        clearTypingUser(conversationId, userId, io);
        socket.to(`conversation:${conversationId}`).emit('typing:stop', {
          conversationId,
          userId,
          username,
        });
      }, SOCKET_THROTTLE.TYPING_TIMEOUT_MS);
      
      const wasTyping = conversationTyping.has(userId);
      conversationTyping.set(userId, { username, timeout });
      
      // Only broadcast if user wasn't already typing (avoid spam)
      if (!wasTyping) {
        socket.to(`conversation:${conversationId}`).emit('typing:start', {
          conversationId,
          userId,
          username,
        });
      }
    });

    socket.on('typing:stop', (conversationId: string) => {
      // Validate conversation ID
      if (!isValidObjectId(conversationId)) return;

      const conversationTyping = typingUsers.get(conversationId);
      if (conversationTyping?.has(userId)) {
        clearTimeout(conversationTyping.get(userId)!.timeout);
        conversationTyping.delete(userId);
        
        if (conversationTyping.size === 0) {
          typingUsers.delete(conversationId);
        }
        
        socket.to(`conversation:${conversationId}`).emit('typing:stop', {
          conversationId,
          userId,
          username,
        });
      }
    });

    // Handle presence subscriptions
    socket.on('presence:subscribe', (userIds: string[]) => {
      // Validate user IDs
      const validation = validateUserIds(userIds);
      if (!validation.valid) return;
      
      // Rate limit presence subscriptions
      const rateLimitResult = checkRateLimit(
        socketRateLimitKey(userId, 'presence'),
        RATE_LIMITS.PRESENCE
      );
      if (!rateLimitResult.success) return;

      const subscriptions = presenceSubscriptions.get(socket.id);
      if (subscriptions) {
        userIds.forEach(id => subscriptions.add(id));
        // Send current presence for all subscribed users
        const presenceData = userIds.map(id => getUserPresence(id));
        socket.emit('presence:bulk', presenceData);
      }
    });

    socket.on('presence:unsubscribe', (userIds: string[]) => {
      // Validate user IDs
      const validation = validateUserIds(userIds);
      if (!validation.valid) return;

      const subscriptions = presenceSubscriptions.get(socket.id);
      if (subscriptions) {
        userIds.forEach(id => subscriptions.delete(id));
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${username} (${userId})`);

      // Clean up typing indicators for this user
      typingUsers.forEach((conversationTyping, conversationId) => {
        if (conversationTyping.has(userId)) {
          clearTimeout(conversationTyping.get(userId)!.timeout);
          conversationTyping.delete(userId);
          socket.to(`conversation:${conversationId}`).emit('typing:stop', {
            conversationId,
            userId,
            username,
          });
        }
        if (conversationTyping.size === 0) {
          typingUsers.delete(conversationId);
        }
      });

      // Clean up receipt queues
      const queue = receiptQueues.get(socket.id);
      if (queue?.flushTimeout) {
        clearTimeout(queue.flushTimeout);
      }
      receiptQueues.delete(socket.id);

      // Clean up presence subscriptions
      presenceSubscriptions.delete(socket.id);

      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          // Update last seen timestamp
          lastSeenMap.set(userId, new Date());
          // Broadcast presence update (user went offline)
          broadcastPresenceUpdate(userId, io);
          updateLastSeenInDB(userId);
        }
      }
    });
  });

  return io;
}

// Helper function to auto-join user's conversations
async function joinUserConversations(socket: SocketClient, userId: string) {
  try {
    // Try to convert userId to ObjectId
    let userObjectId: mongoose.Types.ObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(userId);
    } catch {
      console.log(`Skipping auto-join for non-ObjectId user: ${userId}`);
      return;
    }

    const conversations = await Conversation.find({
      'participants.user': userObjectId,
      'participants.isActive': true,
    }).select('_id');

    conversations.forEach((conv) => {
      socket.join(`conversation:${conv._id.toString()}`);
    });

    console.log(`User ${userId} joined ${conversations.length} conversations`);
  } catch (error) {
    console.error('Error joining user conversations:', error);
  }
}

// Export helper to check if user is online
export function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId);
}

// Export helper to get online users
export function getOnlineUsers(): string[] {
  return Array.from(onlineUsers.keys());
}

// Export helper to get user's last seen timestamp
export function getUserLastSeen(userId: string): Date | null {
  return lastSeenMap.get(userId) || null;
}

// Export helper to get presence for multiple users
export function getPresenceForUsers(userIds: string[]): PresencePayload[] {
  return userIds.map(userId => getUserPresence(userId));
}
