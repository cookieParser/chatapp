/**
 * Delta Sync API Endpoint
 * 
 * Returns only conversations and messages updated since the given timestamp.
 * Enables efficient background sync without refetching everything.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, Conversation, Message } from '@/lib/db';
import mongoose from 'mongoose';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Get 'since' timestamp from query params
    const searchParams = request.nextUrl.searchParams;
    const since = parseInt(searchParams.get('since') || '0', 10);
    const sinceDate = new Date(since);

    await connectDB();

    // Get current server timestamp
    const serverTimestamp = Date.now();

    // Fetch conversations updated since 'since'
    const conversations = await Conversation.find({
      'participants.user': userObjectId,
      'participants.isActive': true,
      updatedAt: { $gt: sinceDate },
    })
      .populate('participants.user', '_id name image')
      .populate({
        path: 'lastMessage',
        select: '_id content type sender createdAt',
        populate: { path: 'sender', select: '_id name' },
      })
      .sort({ lastMessageAt: -1 })
      .lean();

    // Get conversation IDs for message query
    const conversationIds = conversations.map((c: any) => c._id);

    // Fetch messages created since 'since' for user's conversations
    // Also include messages from conversations not in the updated list
    const allUserConversations = await Conversation.find({
      'participants.user': userObjectId,
      'participants.isActive': true,
    }).select('_id').lean();

    const allConvIds = allUserConversations.map((c: any) => c._id);

    const messages = await Message.find({
      conversation: { $in: allConvIds },
      createdAt: { $gt: sinceDate },
      isDeleted: false,
    })
      .populate('sender', '_id name image')
      .sort({ createdAt: 1 })
      .limit(500) // Limit to prevent huge responses
      .lean();

    // Transform conversations for client
    const transformedConversations = conversations.map((conv: any) => ({
      _id: conv._id.toString(),
      type: conv.type,
      name: conv.name,
      image: conv.image,
      participants: conv.participants.map((p: any) => ({
        user: {
          _id: p.user._id.toString(),
          name: p.user.name,
          image: p.user.image,
        },
        isActive: p.isActive,
      })),
      lastMessage: conv.lastMessage ? {
        _id: conv.lastMessage._id.toString(),
        content: conv.lastMessage.content,
        type: conv.lastMessage.type,
        sender: conv.lastMessage.sender ? {
          _id: conv.lastMessage.sender._id.toString(),
          name: conv.lastMessage.sender.name,
        } : undefined,
        createdAt: conv.lastMessage.createdAt.toISOString(),
      } : undefined,
      unreadCount: 0, // Calculate separately if needed
      updatedAt: conv.updatedAt.toISOString(),
    }));

    // Transform messages for client
    const transformedMessages = messages.map((msg: any) => ({
      _id: msg._id.toString(),
      conversation: msg.conversation.toString(),
      sender: {
        _id: msg.sender._id.toString(),
        name: msg.sender.name,
        username: msg.sender.name,
        image: msg.sender.image,
      },
      content: msg.content,
      type: msg.type,
      createdAt: msg.createdAt.toISOString(),
      status: 'sent',
      replyTo: msg.replyTo?.toString(),
      isDeleted: msg.isDeleted,
    }));

    return NextResponse.json({
      conversations: transformedConversations,
      messages: transformedMessages,
      serverTimestamp,
      hasMore: messages.length === 500,
    });
  } catch (error) {
    console.error('Delta sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync' },
      { status: 500 }
    );
  }
}
