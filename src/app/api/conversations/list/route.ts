import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, Conversation, User, Message } from '@/lib/db';
import {
  getCachedChatList,
  setCachedChatList,
  CachedChatItem,
  CachedParticipant,
} from '@/lib/cache';

interface PopulatedUser {
  _id: { toString(): string };
  name: string;
  email: string;
  image?: string;
  status: string;
}

interface PopulatedParticipant {
  user: PopulatedUser;
  isActive: boolean;
}

interface PopulatedMessage {
  content: string;
  type: string;
  sender?: { name: string };
  createdAt: Date;
}

interface PopulatedConversation {
  _id: { toString(): string };
  type: 'direct' | 'group';
  name?: string;
  image?: string;
  participants: PopulatedParticipant[];
  lastMessage?: PopulatedMessage;
  lastMessageAt?: Date;
  createdAt: Date;
}

// GET /api/conversations/list - Get chat list for current user
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    // Get current user from DB
    const currentUser = await User.findOne({ email: session.user.email });
    if (!currentUser) {
      return NextResponse.json([]);
    }

    const userId = currentUser._id.toString();

    // Try to get from cache first
    const cachedList = await getCachedChatList(userId);
    if (cachedList) {
      return NextResponse.json(cachedList, {
        headers: { 'X-Cache': 'HIT' },
      });
    }

    // Cache miss - fetch from database
    const conversations = (await Conversation.find({
      'participants.user': currentUser._id,
      'participants.isActive': true,
    })
      .populate('participants.user', 'name email image status')
      .populate({
        path: 'lastMessage',
        select: 'content type sender createdAt',
        populate: {
          path: 'sender',
          select: 'name',
        },
      })
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .lean()) as unknown as PopulatedConversation[];

    // Get unread counts for all conversations
    const unreadCounts = await getUnreadCountsForUser(
      userId,
      conversations.map((c) => c._id.toString())
    );

    // Format response with other user info for direct chats
    const chatList: CachedChatItem[] = conversations.map((conv) => {
      const otherParticipants: CachedParticipant[] = conv.participants
        .filter(
          (p) =>
            p.user._id.toString() !== currentUser._id.toString() && p.isActive
        )
        .map((p) => ({
          id: p.user._id.toString(),
          name: p.user.name,
          email: p.user.email,
          image: p.user.image,
          status: p.user.status,
        }));

      const conversationId = conv._id.toString();

      return {
        id: conversationId,
        type: conv.type,
        name: conv.type === 'group' ? conv.name : otherParticipants[0]?.name,
        image: conv.type === 'group' ? conv.image : otherParticipants[0]?.image,
        participants: otherParticipants,
        lastMessage: conv.lastMessage
          ? {
              content: conv.lastMessage.content,
              type: conv.lastMessage.type,
              senderName: conv.lastMessage.sender?.name,
              createdAt: conv.lastMessage.createdAt.toISOString(),
            }
          : null,
        lastMessageAt: conv.lastMessageAt?.toISOString(),
        createdAt: conv.createdAt.toISOString(),
        unreadCount: unreadCounts.get(conversationId) || 0,
      };
    });

    // Store in cache
    await setCachedChatList(userId, chatList);

    return NextResponse.json(chatList, {
      headers: { 'X-Cache': 'MISS' },
    });
  } catch (error) {
    console.error('Error fetching chat list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat list' },
      { status: 500 }
    );
  }
}

/**
 * Get unread message counts for a user across multiple conversations
 */
async function getUnreadCountsForUser(
  userId: string,
  conversationIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  if (conversationIds.length === 0) {
    return counts;
  }

  try {
    const { default: mongoose } = await import('mongoose');
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Aggregate unread counts per conversation
    const results = await Message.aggregate([
      {
        $match: {
          conversation: {
            $in: conversationIds.map((id) => new mongoose.Types.ObjectId(id)),
          },
          sender: { $ne: userObjectId },
          isDeleted: false,
        },
      },
      {
        $addFields: {
          userStatus: {
            $filter: {
              input: '$statusPerUser',
              as: 'status',
              cond: { $eq: ['$$status.user', userObjectId] },
            },
          },
        },
      },
      {
        $match: {
          $or: [
            { userStatus: { $size: 0 } },
            { 'userStatus.status': { $ne: 'read' } },
          ],
        },
      },
      {
        $group: {
          _id: '$conversation',
          count: { $sum: 1 },
        },
      },
    ]);

    for (const result of results) {
      counts.set(result._id.toString(), result.count);
    }
  } catch (error) {
    console.error('Error getting unread counts:', error);
  }

  return counts;
}
