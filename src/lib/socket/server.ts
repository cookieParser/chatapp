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
  MinimalMessagePayload,
  MessageStatusPayload,
  BatchMessageStatusPayload,
  PresencePayload,
  UserStatus,
  DeleteMessagePayload,
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
import { getPresenceManager, PresenceManager } from './presence';
import {
  invalidateChatListCacheForUsers,
  updateCachedChatListWithMessage,
  incrementUnreadCount,
  resetUnreadCount,
  CachedLastMessage,
} from '@/lib/cache';
import { configureRedisAdapter } from '@/lib/redis/socketAdapter';
import { sendMessageNotification } from '@/lib/push';

/**
 * Socket.IO Server for Real-time Messaging
 * 
 * ARCHITECTURE:
 * - All message sending is handled via Socket.IO (no HTTP POST endpoints)
 * - Messages are emitted to conversation-specific rooms only (not broadcast globally)
 * - Room format: `conversation:${conversationId}`
 * - Users auto-join their conversation rooms on connection
 * - Redis adapter enables horizontal scaling across multiple server instances
 * 
 * EVENTS:
 * - message:send: Client sends a message (with callback for confirmation)
 * - message:new: Server broadcasts new message to conversation room
 * - message:delete: Client requests message deletion
 * - message:deleted: Server broadcasts deletion to conversation room
 */

type SocketServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type SocketClient = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// Initialize presence manager (uses in-memory storage by default)
const presenceManager = getPresenceManager();

// Track typing users per conversation: Map<conversationId, Map<userId, { username, timeout }>>
const typingUsers = new Map<string, Map<string, { username: string; timeout: NodeJS.Timeout }>>();

// Batch receipt queues per socket: Map<socketId, { delivered: Map, read: Map }>
const receiptQueues = new Map<string, {
  delivered: Map<string, Set<string>>;
  read: Map<string, Set<string>>;
  flushTimeout?: NodeJS.Timeout;
}>();

/**
 * Invalidate chat list cache for all participants in a conversation
 * Updates cache with new message info or invalidates if update fails
 */
async function invalidateChatListForConversation(
  conversationId: string,
  senderId: string,
  lastMessage: CachedLastMessage
): Promise<void> {
  try {
    // Get all participants in the conversation
    const conversation = await Conversation.findById(conversationId)
      .select('participants')
      .lean();

    if (!conversation) return;

    const participantIds = conversation.participants
      .filter((p: any) => p.isActive)
      .map((p: any) => p.user.toString());

    // Update cache for sender (they sent the message, so update their list)
    await updateCachedChatListWithMessage(senderId, conversationId, lastMessage);

    // For other participants, increment unread count and update last message
    const otherParticipants = participantIds.filter((id: string) => id !== senderId);
    
    await Promise.all(
      otherParticipants.map(async (participantId: string) => {
        await updateCachedChatListWithMessage(participantId, conversationId, lastMessage);
        await incrementUnreadCount(participantId, conversationId);
      })
    );
  } catch (error) {
    // If update fails, invalidate all participant caches to force refresh
    console.error('Error updating cache, invalidating:', error);
    try {
      const conversation = await Conversation.findById(conversationId)
        .select('participants')
        .lean();
      if (conversation) {
        const participantIds = conversation.participants
          .filter((p: any) => p.isActive)
          .map((p: any) => p.user.toString());
        await invalidateChatListCacheForUsers(participantIds);
      }
    } catch (e) {
      console.error('Failed to invalidate cache:', e);
    }
  }
}

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
      const lastSeen = await presenceManager.getLastSeen(userId);
      const isOnline = await presenceManager.isUserOnline(userId);
      await User.findByIdAndUpdate(userId, {
        lastSeen: lastSeen || new Date(),
        status: isOnline ? 'online' : 'offline',
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
    // Enable per-message deflate compression for WebSocket
    perMessageDeflate: {
      threshold: 512, // Compress messages > 512 bytes (lowered for chat messages)
      zlibDeflateOptions: {
        level: 6, // Balanced compression (1-9)
        memLevel: 8, // Memory usage for compression
      },
      zlibInflateOptions: {
        chunkSize: 16 * 1024, // 16KB chunks for decompression
      },
      clientNoContextTakeover: true, // Reduce memory usage
      serverNoContextTakeover: true,
    },
    // Connection state recovery for reconnection
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: false,
    },
  });

  // Configure Redis adapter for horizontal scaling (async, non-blocking)
  configureRedisAdapter(io).catch(err => {
    console.warn('Redis adapter not configured:', err.message);
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

    // Set socket server reference for presence manager (only once)
    presenceManager.setSocketServer(io);

    // Track user online status using presence manager
    const wasOffline = await presenceManager.handleConnect(userId, socket.id);

    // Update DB if user just came online
    if (wasOffline) {
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
        }).select('_id').lean();

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

        // Fetch reply message info if replying
        let replyToMessage = undefined;
        if (replyToId && isValidObjectId(replyToId)) {
          const replyMsg = await Message.findById(replyToId)
            .populate('sender', '_id name')
            .lean();
          if (replyMsg) {
            replyToMessage = {
              _id: (replyMsg as any)._id.toString(),
              content: replyMsg.isDeleted ? 'This message was deleted' : replyMsg.content,
              sender: {
                _id: (replyMsg.sender as any)._id.toString(),
                username: sanitizeUsername((replyMsg.sender as any).name),
              },
              isDeleted: replyMsg.isDeleted,
            };
          }
        }

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
          replyToMessage,
        };

        // Minimal payload for broadcast - excludes user profile data
        const minimalPayload: MinimalMessagePayload = {
          messageId: message._id.toString(),
          conversationId,
          senderId: (message.sender as any)._id.toString(),
          content: message.content,
          createdAt: message.createdAt.toISOString(),
          type: message.type,
          replyToId: message.replyTo?.toString(),
        };

        // Broadcast minimal payload to all users in the conversation (except sender)
        socket.to(`conversation:${conversationId}`).emit('message:new', minimalPayload);

        // Clear sender's typing indicator
        clearTypingUser(conversationId, userId, io);

        // Invalidate chat list cache for all participants
        // This ensures the chat list shows the latest message
        invalidateChatListForConversation(conversationId, userId, {
          content: message.content,
          type: message.type,
          senderName: (message.sender as any).name || username,
          createdAt: message.createdAt.toISOString(),
        }).catch((err) => console.error('Cache invalidation error:', err));

        // Send push notifications to offline participants
        // This runs in background and doesn't block the response
        (async () => {
          try {
            const conv = await Conversation.findById(conversationId)
              .select('participants name type')
              .lean();
            
            if (conv) {
              const recipientIds = conv.participants
                .filter((p: any) => p.isActive && p.user.toString() !== userId)
                .map((p: any) => p.user.toString());
              
              // Only send push to users who are offline (not connected via socket)
              const offlineRecipients: string[] = [];
              for (const recipientId of recipientIds) {
                const isOnline = await presenceManager.isUserOnline(recipientId);
                if (!isOnline) {
                  offlineRecipients.push(recipientId);
                }
              }
              
              if (offlineRecipients.length > 0) {
                await sendMessageNotification(
                  offlineRecipients,
                  {
                    _id: message._id.toString(),
                    conversation: conversationId,
                    sender: {
                      _id: (message.sender as any)._id.toString(),
                      name: (message.sender as any).name,
                      image: (message.sender as any).image,
                    },
                    content: message.content,
                    type: message.type,
                    createdAt: message.createdAt,
                  },
                  conv.type === 'group' ? conv.name : undefined
                );
              }
            }
          } catch (pushErr) {
            console.error('Push notification error:', pushErr);
          }
        })();

        // Send success response to sender with delivery confirmation
        callback({ success: true, message: messagePayload });
      } catch (error) {
        console.error('Error sending message:', error);
        callback({ success: false, error: 'Failed to send message' });
      }
    });

    // Handle deleting messages
    socket.on('message:delete', async (data: DeleteMessagePayload, callback) => {
      try {
        const { messageId, conversationId } = data;

        // Validate IDs
        if (!isValidObjectId(messageId) || !isValidObjectId(conversationId)) {
          return callback({ success: false, error: 'Invalid ID format' });
        }

        let userObjectId: mongoose.Types.ObjectId;
        try {
          userObjectId = new mongoose.Types.ObjectId(userId);
        } catch {
          return callback({ success: false, error: 'Invalid user ID' });
        }

        // Find the message and verify ownership
        const message = await Message.findOne({
          _id: messageId,
          conversation: conversationId,
          isDeleted: false,
        }).select('sender').lean();

        if (!message) {
          return callback({ success: false, error: 'Message not found' });
        }

        // Only the sender can delete their own message
        if (message.sender.toString() !== userId) {
          return callback({ success: false, error: 'You can only delete your own messages' });
        }

        // Soft delete using updateOne
        await Message.updateOne(
          { _id: messageId },
          {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: userObjectId,
          }
        );

        // Broadcast deletion to all users in the conversation
        io.to(`conversation:${conversationId}`).emit('message:deleted', {
          messageId,
          conversationId,
          deletedBy: userId,
        });

        callback({ success: true });
      } catch (error) {
        console.error('Error deleting message:', error);
        callback({ success: false, error: 'Failed to delete message' });
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

        // Reset unread count in cache (single read might clear unread)
        resetUnreadCount(userId, conversationId).catch((err) =>
          console.error('Error resetting unread count in cache:', err)
        );
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

        // Reset unread count in cache for this user
        resetUnreadCount(userId, conversationId).catch((err) =>
          console.error('Error resetting unread count in cache:', err)
        );
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
    socket.on('presence:subscribe', async (userIds: string[]) => {
      // Validate user IDs
      const validation = validateUserIds(userIds);
      if (!validation.valid) return;
      
      // Rate limit presence subscriptions
      const rateLimitResult = checkRateLimit(
        socketRateLimitKey(userId, 'presence'),
        RATE_LIMITS.PRESENCE
      );
      if (!rateLimitResult.success) return;

      // Subscribe and get current presence data
      const presenceData = await presenceManager.subscribe(socket.id, userIds);
      socket.emit('presence:bulk', presenceData);
    });

    socket.on('presence:unsubscribe', async (userIds: string[]) => {
      // Validate user IDs
      const validation = validateUserIds(userIds);
      if (!validation.valid) return;

      await presenceManager.unsubscribe(socket.id, userIds);
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
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

      // Handle presence disconnect (cleans up subscriptions and broadcasts if user went offline)
      const wentOffline = await presenceManager.handleDisconnect(userId, socket.id);
      
      if (wentOffline) {
        updateLastSeenInDB(userId);
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
    }).select('_id').lean();

    conversations.forEach((conv) => {
      socket.join(`conversation:${conv._id.toString()}`);
    });

    console.log(`User ${userId} joined ${conversations.length} conversations`);
  } catch (error) {
    console.error('Error joining user conversations:', error);
  }
}

// Export helper to check if user is online
export async function isUserOnline(userId: string): Promise<boolean> {
  return presenceManager.isUserOnline(userId);
}

// Export helper to get online users
export async function getOnlineUsers(): Promise<string[]> {
  return presenceManager.getOnlineUsers();
}

// Export helper to get user's last seen timestamp
export async function getUserLastSeen(userId: string): Promise<Date | null> {
  return presenceManager.getLastSeen(userId);
}

// Export helper to get presence for multiple users
export async function getPresenceForUsers(userIds: string[]): Promise<PresencePayload[]> {
  return presenceManager.getPresenceForUsers(userIds);
}

// Export the presence manager for advanced usage (e.g., switching to Redis)
export { presenceManager };
