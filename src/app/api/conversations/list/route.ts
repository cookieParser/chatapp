import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, Conversation, User } from '@/lib/db';

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

    // Find all conversations where current user is a participant
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

    // Format response with other user info for direct chats
    const chatList = conversations.map((conv) => {
      const otherParticipants = conv.participants
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

      return {
        id: conv._id.toString(),
        type: conv.type,
        name: conv.type === 'group' ? conv.name : otherParticipants[0]?.name,
        image: conv.type === 'group' ? conv.image : otherParticipants[0]?.image,
        participants: otherParticipants,
        lastMessage: conv.lastMessage
          ? {
              content: conv.lastMessage.content,
              type: conv.lastMessage.type,
              senderName: conv.lastMessage.sender?.name,
              createdAt: conv.lastMessage.createdAt,
            }
          : null,
        lastMessageAt: conv.lastMessageAt,
        createdAt: conv.createdAt,
      };
    });

    return NextResponse.json(chatList);
  } catch (error) {
    console.error('Error fetching chat list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat list' },
      { status: 500 }
    );
  }
}
