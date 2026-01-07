/**
 * Web Push Notification Service
 * 
 * Handles push subscription management and sending notifications.
 * Uses web-push library for VAPID authentication.
 */

import webpush from 'web-push';
import { getRedisClient } from '@/lib/redis';

// VAPID keys should be generated once and stored in environment variables
// Generate with: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@chatapp.com';

// Configure web-push
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Redis key prefix for push subscriptions
const PUSH_SUB_PREFIX = 'push:sub:';
const PUSH_USER_SUBS_PREFIX = 'push:user:';

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userId: string;
  userAgent?: string;
  createdAt: number;
}

export interface PushPayload {
  type: 'message' | 'notification';
  message?: {
    messageId: string;
    conversationId: string;
    senderId: string;
    senderName: string;
    senderImage?: string;
    content: string;
    type: string;
    createdAt: string;
  };
  notification?: {
    title: string;
    body: string;
    icon?: string;
    url?: string;
    tag?: string;
  };
}

/**
 * Save push subscription for a user
 */
export async function savePushSubscription(
  userId: string,
  subscription: PushSubscriptionJSON,
  userAgent?: string
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    console.warn('Redis not available, push subscription not saved');
    return;
  }

  const subData: PushSubscriptionData = {
    endpoint: subscription.endpoint!,
    keys: {
      p256dh: subscription.keys!.p256dh!,
      auth: subscription.keys!.auth!,
    },
    userId,
    userAgent,
    createdAt: Date.now(),
  };

  // Store subscription by endpoint
  const endpointKey = `${PUSH_SUB_PREFIX}${hashEndpoint(subscription.endpoint!)}`;
  await redis.set(endpointKey, JSON.stringify(subData), 'EX', 60 * 60 * 24 * 30); // 30 days

  // Add to user's subscription set
  const userKey = `${PUSH_USER_SUBS_PREFIX}${userId}`;
  await redis.sadd(userKey, subscription.endpoint!);
  await redis.expire(userKey, 60 * 60 * 24 * 30);
}

/**
 * Remove push subscription
 */
export async function removePushSubscription(endpoint: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  const endpointKey = `${PUSH_SUB_PREFIX}${hashEndpoint(endpoint)}`;
  const subData = await redis.get(endpointKey);

  if (subData) {
    const sub = JSON.parse(subData) as PushSubscriptionData;
    
    // Remove from user's set
    const userKey = `${PUSH_USER_SUBS_PREFIX}${sub.userId}`;
    await redis.srem(userKey, endpoint);
    
    // Remove subscription
    await redis.del(endpointKey);
  }
}

/**
 * Get all subscriptions for a user
 */
export async function getUserSubscriptions(userId: string): Promise<PushSubscriptionData[]> {
  const redis = await getRedisClient();
  if (!redis) return [];

  const userKey = `${PUSH_USER_SUBS_PREFIX}${userId}`;
  const endpoints = await redis.smembers(userKey);

  const subscriptions: PushSubscriptionData[] = [];

  for (const endpoint of endpoints) {
    const endpointKey = `${PUSH_SUB_PREFIX}${hashEndpoint(endpoint)}`;
    const subData = await redis.get(endpointKey);
    
    if (subData) {
      subscriptions.push(JSON.parse(subData));
    } else {
      // Clean up stale reference
      await redis.srem(userKey, endpoint);
    }
  }

  return subscriptions;
}

/**
 * Send push notification to a user
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('VAPID keys not configured, push notifications disabled');
    return { sent: 0, failed: 0 };
  }

  const subscriptions = await getUserSubscriptions(userId);
  
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  const payloadString = JSON.stringify(payload);

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys,
        },
        payloadString,
        {
          TTL: 60 * 60, // 1 hour
          urgency: 'high',
        }
      );
      sent++;
    } catch (error: any) {
      failed++;
      
      // Remove invalid subscriptions
      if (error.statusCode === 404 || error.statusCode === 410) {
        console.log(`Removing invalid subscription for user ${userId}`);
        await removePushSubscription(sub.endpoint);
      } else {
        console.error(`Push failed for user ${userId}:`, error.message);
      }
    }
  }

  return { sent, failed };
}

/**
 * Send push notification to multiple users
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  let totalSent = 0;
  let totalFailed = 0;

  await Promise.all(
    userIds.map(async (userId) => {
      const result = await sendPushToUser(userId, payload);
      totalSent += result.sent;
      totalFailed += result.failed;
    })
  );

  return { sent: totalSent, failed: totalFailed };
}

/**
 * Send message notification
 * Called when a new message is sent
 */
export async function sendMessageNotification(
  recipientIds: string[],
  message: {
    _id: string;
    conversation: string;
    sender: { _id: string; name?: string; image?: string };
    content: string;
    type: string;
    createdAt: Date;
  },
  conversationName?: string
): Promise<void> {
  // Don't send to the sender
  const recipients = recipientIds.filter(id => id !== message.sender._id);
  
  if (recipients.length === 0) return;

  const senderName = message.sender.name || 'Someone';
  const truncatedContent = message.content.length > 100 
    ? message.content.substring(0, 100) + '...' 
    : message.content;

  const payload: PushPayload = {
    type: 'message',
    message: {
      messageId: message._id.toString(),
      conversationId: message.conversation.toString(),
      senderId: message.sender._id.toString(),
      senderName,
      senderImage: message.sender.image,
      content: message.content,
      type: message.type,
      createdAt: message.createdAt.toISOString(),
    },
    notification: {
      title: conversationName || senderName,
      body: message.type === 'image' ? '📷 Photo' : truncatedContent,
      icon: message.sender.image || '/icons/icon-192.svg',
      url: `/chat/${message.conversation}`,
      tag: `chat-${message.conversation}`,
    },
  };

  const result = await sendPushToUsers(recipients, payload);
  console.log(`Push notifications sent: ${result.sent}, failed: ${result.failed}`);
}

/**
 * Hash endpoint for Redis key (endpoints can be very long)
 */
function hashEndpoint(endpoint: string): string {
  let hash = 0;
  for (let i = 0; i < endpoint.length; i++) {
    const char = endpoint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get VAPID public key for client
 */
export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}
