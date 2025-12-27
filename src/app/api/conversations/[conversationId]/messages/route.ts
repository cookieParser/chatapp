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
    const cursor = searchParams.get('cursor'); // Message ID for cursor
    const direction = searchParams.get('direction') || 'older'; // 'older' or 'newer'
    const includeTotal = searchParams.get('includeTotal') === 'true';

    // Validate pagination
    const paginationValidation = validatePagination(limitParam, undefined);
    if (!paginationValidation.valid) {
      return errorResponse(paginationValidation.error || 'Invalid pagination');
    }

    const limit = Math.min(
      parseInt(limitParam || String(PAGINATION.DEFAULT_PAGE_SIZE)),
      PAGINATION.MAX_PAGE_SIZE
    );

    // Build query with cursor-based pagination
    const query: any = {
      conversation: new mongoose.Types.ObjectId(conversationId),
      isDeleted: false,
    };

    // Cursor-based pagination using _id (more efficient than date-based)
    if (cursor && isValidObjectId(cursor)) {
      const cursorObjectId = new mongoose.Types.ObjectId(cursor);
      if (direction === 'newer') {
        query._id = { $gt: cursorObjectId };
      } else {
        query._id = { $lt: cursorObjectId };
      }
    }

    // Fetch one extra to determine if there are more
    const fetchLimit = limit + 1;
    
    const messages = await Message.find(query)
      .populate('sender', '_id name email image')
      .sort({ _id: direction === 'newer' ? 1 : -1 })
      .limit(fetchLimit)
      .lean();

    // Check if there are more messages
    const hasMore = messages.length > limit;
    if (hasMore) {
      messages.pop(); // Remove the extra message
    }

    // Reverse if fetching older messages (to maintain chronological order)
    if (direction === 'older') {
      messages.reverse();
    }

    // Transform and sanitize messages
    const transformedMessages = messages.map((msg: any) => ({
      _id: msg._id.toString(),
      content: sanitizeMessage(msg.content),
      type: msg.type,
      media: msg.media,
      createdAt: msg.createdAt.toISOString(),
      replyTo: msg.replyTo?.toString(),
      sender: {
        _id: msg.sender._id.toString(),
        username: sanitizeUsername(msg.sender.name),
        name: sanitizeUsername(msg.sender.name),
        image: msg.sender.image,
      },
    }));

    // Build pagination info
    const pagination: PaginatedResponse['pagination'] = {
      hasMore,
      nextCursor: transformedMessages.length > 0 
        ? transformedMessages[transformedMessages.length - 1]._id 
        : null,
      prevCursor: transformedMessages.length > 0 
        ? transformedMessages[0]._id 
        : null,
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
