import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, Message, Conversation, User } from '@/lib/db';
import mongoose from 'mongoose';
import {
  checkApiRateLimit,
  secureResponse,
  errorResponse,
  RATE_LIMITS,
  isValidObjectId,
} from '@/lib/security';

interface RouteParams {
  params: Promise<{ conversationId: string; messageId: string }>;
}

// DELETE /api/conversations/[conversationId]/messages/[messageId] - Soft delete a message
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = checkApiRateLimit(request, 'messages', RATE_LIMITS.API_GENERAL);
    if (!rateLimit.allowed) return rateLimit.response!;

    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse('Unauthorized', 401);
    }

    const { conversationId, messageId } = await params;

    if (!isValidObjectId(conversationId) || !isValidObjectId(messageId)) {
      return errorResponse('Invalid ID format');
    }

    await connectDB();

    const dbUser = await User.findOne({ email: session.user.email }).lean();
    if (!dbUser) {
      return errorResponse('User not found', 404);
    }

    // Verify user is a participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': dbUser._id,
      'participants.isActive': true,
    }).select('_id').lean();

    if (!conversation) {
      return errorResponse('Conversation not found', 404);
    }

    // Find the message and verify ownership
    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId,
      isDeleted: false,
    });

    if (!message) {
      return errorResponse('Message not found', 404);
    }

    // Only the sender can delete their own message
    if (message.sender.toString() !== dbUser._id.toString()) {
      return errorResponse('You can only delete your own messages', 403);
    }

    // Soft delete
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.deletedBy = dbUser._id;
    await message.save();

    return secureResponse({ success: true, messageId });
  } catch (error) {
    console.error('Error deleting message:', error);
    return errorResponse('Failed to delete message', 500);
  }
}

// GET /api/conversations/[conversationId]/messages/[messageId] - Get a single message (for reply preview)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = checkApiRateLimit(request, 'messages', RATE_LIMITS.API_GENERAL);
    if (!rateLimit.allowed) return rateLimit.response!;

    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse('Unauthorized', 401);
    }

    const { conversationId, messageId } = await params;

    if (!isValidObjectId(conversationId) || !isValidObjectId(messageId)) {
      return errorResponse('Invalid ID format');
    }

    await connectDB();

    const dbUser = await User.findOne({ email: session.user.email }).lean();
    if (!dbUser) {
      return errorResponse('User not found', 404);
    }

    // Verify user is a participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': dbUser._id,
      'participants.isActive': true,
    }).select('_id').lean();

    if (!conversation) {
      return errorResponse('Conversation not found', 404);
    }

    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId,
    }).populate('sender', '_id name image').lean();

    if (!message) {
      return errorResponse('Message not found', 404);
    }

    return secureResponse({
      _id: (message as any)._id.toString(),
      content: message.isDeleted ? 'This message was deleted' : message.content,
      isDeleted: message.isDeleted,
      sender: {
        _id: (message.sender as any)._id.toString(),
        name: (message.sender as any).name,
        image: (message.sender as any).image,
      },
      createdAt: message.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Error fetching message:', error);
    return errorResponse('Failed to fetch message', 500);
  }
}
