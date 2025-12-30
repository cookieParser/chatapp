import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, Message, Conversation, User } from '@/lib/db';
import mongoose from 'mongoose';
import {
  checkApiRateLimit,
  secureResponse,
  errorResponse,
  RATE_LIMITS,
  isValidObjectId,
  validatePagination,
  sanitizeMessage,
  sanitizeUsername,
} from '@/lib/security';
import { PAGINATION } from '@/lib/constants';

/**
 * Messages API Route - READ ONLY
 * 
 * Message sending is handled exclusively via Socket.IO for real-time delivery.
 * See: src/lib/socket/server.ts - 'message:send' event handler
 * 
 * This endpoint only supports GET requests for fetching message history.
 * Messages are broadcast to conversation-specific rooms, not globally.
 */

interface RouteParams {
  params: Promise<{ conversationId: string }>;
}

interface PaginatedResponse {
  messages: any[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    prevCursor: string | null;
    total?: number;
  };
}

// Cursor format: base64 encoded JSON with createdAt and _id for tie-breaking
interface CursorData {
  createdAt: string;
  _id: string;
}

function encodeCursor(createdAt: Date, _id: string): string {
  const data: CursorData = { createdAt: createdAt.toISOString(), _id };
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

function decodeCursor(cursor: string): CursorData | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
    const data = JSON.parse(decoded) as CursorData;
    if (data.createdAt && data._id && isValidObjectId(data._id)) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

// GET /api/conversations/[conversationId]/messages - Get messages with cursor-based pagination
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Rate limit check
    const rateLimit = checkApiRateLimit(request, 'messages', RATE_LIMITS.API_GENERAL);
    if (!rateLimit.allowed) return rateLimit.response!;

    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse('Unauthorized', 401);
    }

    const { conversationId } = await params;
    
    // Validate conversation ID
    if (!isValidObjectId(conversationId)) {
      return errorResponse('Invalid conversation ID');
    }

    await connectDB();

    // Get user from DB
    const dbUser = await User.findOne({ email: session.user.email }).lean();
    if (!dbUser) {
      return errorResponse('User not found', 404);
    }

    // Verify user is a participant (use lean for performance)
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': dbUser._id,
      'participants.isActive': true,
    }).select('_id').lean();

    if (!conversation) {
      return errorResponse('Conversation not found', 404);
    }

    // Get query params for cursor-based pagination
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const cursor = searchParams.get('cursor');
    const direction = searchParams.get('direction') || 'older';
    const includeTotal = searchParams.get('includeTotal') === 'true';

    // Validate pagination
    const paginationValidation = validatePagination(limitParam, undefined);
    if (!paginationValidation.valid) {
      return errorResponse(paginationValidation.error || 'Invalid pagination');
    }

    // Default to 25 messages (within 20-30 range for optimal UX)
    const limit = Math.min(
      parseInt(limitParam || String(PAGINATION.DEFAULT_PAGE_SIZE)),
      PAGINATION.MAX_PAGE_SIZE
    );

    // Build query with cursor-based pagination
    // Uses compound index: { conversation: 1, isDeleted: 1, createdAt: -1 }
    const query: any = {
      conversation: new mongoose.Types.ObjectId(conversationId),
      isDeleted: false,
    };

    // Cursor-based pagination using createdAt + _id for tie-breaking
    // This ensures consistent ordering even for messages created at the same millisecond
    if (cursor) {
      const cursorData = decodeCursor(cursor);
      if (cursorData) {
        const cursorDate = new Date(cursorData.createdAt);
        const cursorObjectId = new mongoose.Types.ObjectId(cursorData._id);
        
        if (direction === 'newer') {
          // Fetch messages newer than cursor
          query.$or = [
            { createdAt: { $gt: cursorDate } },
            { createdAt: cursorDate, _id: { $gt: cursorObjectId } },
          ];
        } else {
          // Fetch messages older than cursor (default)
          query.$or = [
            { createdAt: { $lt: cursorDate } },
            { createdAt: cursorDate, _id: { $lt: cursorObjectId } },
          ];
        }
      }
    }

    // Fetch one extra to determine if there are more
    const fetchLimit = limit + 1;
    
    // Sort by createdAt descending (newest first), with _id as tie-breaker
    // Uses index: { conversation: 1, isDeleted: 1, createdAt: -1 }
    const sortOrder = direction === 'newer' ? 1 : -1;
    
    const messages = await Message.find(query)
      .populate('sender', '_id name email image')
      .populate({
        path: 'replyTo',
        select: '_id content sender isDeleted',
        populate: {
          path: 'sender',
          select: '_id name',
        },
      })
      .sort({ createdAt: sortOrder, _id: sortOrder })
      .limit(fetchLimit)
      .lean();

    // Check if there are more messages
    const hasMore = messages.length > limit;
    if (hasMore) {
      messages.pop(); // Remove the extra message
    }

    // Reverse if fetching older messages (to maintain chronological order in response)
    if (direction === 'older') {
      messages.reverse();
    }

    // Transform and sanitize messages
    const transformedMessages = messages.map((msg: any) => {
      const replyToMessage = msg.replyTo ? {
        _id: msg.replyTo._id.toString(),
        content: msg.replyTo.isDeleted ? 'This message was deleted' : sanitizeMessage(msg.replyTo.content),
        sender: {
          _id: msg.replyTo.sender._id.toString(),
          username: sanitizeUsername(msg.replyTo.sender.name),
        },
        isDeleted: msg.replyTo.isDeleted,
      } : undefined;

      return {
        _id: msg._id.toString(),
        content: msg.isDeleted ? 'This message was deleted' : sanitizeMessage(msg.content),
        type: msg.type,
        media: msg.media,
        createdAt: msg.createdAt.toISOString(),
        replyTo: msg.replyTo?._id?.toString(),
        replyToMessage,
        isDeleted: msg.isDeleted,
        sender: {
          _id: msg.sender._id.toString(),
          username: sanitizeUsername(msg.sender.name),
          name: sanitizeUsername(msg.sender.name),
          image: msg.sender.image,
        },
      };
    });

    // Build pagination cursors from first and last messages
    const firstMsg = messages[0];
    const lastMsg = messages[messages.length - 1];

    const pagination: PaginatedResponse['pagination'] = {
      hasMore,
      // nextCursor points to the newest message (for loading newer messages)
      nextCursor: lastMsg ? encodeCursor(lastMsg.createdAt, lastMsg._id.toString()) : null,
      // prevCursor points to the oldest message (for loading older messages)
      prevCursor: firstMsg ? encodeCursor(firstMsg.createdAt, firstMsg._id.toString()) : null,
    };

    // Optionally include total count (expensive, use sparingly)
    if (includeTotal) {
      pagination.total = await Message.countDocuments({
        conversation: conversationId,
        isDeleted: false,
      });
    }

    const response: PaginatedResponse = {
      messages: transformedMessages,
      pagination,
    };

    return secureResponse(response);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return errorResponse('Failed to fetch messages', 500);
  }
}
