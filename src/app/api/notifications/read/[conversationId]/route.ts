import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, User, Message, Conversation } from '@/lib/db';
import mongoose from 'mongoose';

// POST /api/notifications/read/[conversationId] - Mark all messages in conversation as read
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId } = await params;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 });
    }

    await connectDB();

    const dbUser = await User.findOne({ email: session.user.email });
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify user is part of the conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': dbUser._id,
      'participants.isActive': true,
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Mark all messages as read for this user
    await Message.updateMany(
      {
        conversation: new mongoose.Types.ObjectId(conversationId),
        sender: { $ne: dbUser._id },
        isDeleted: false,
      },
      {
        $set: {
          'statusPerUser.$[elem].status': 'read',
          'statusPerUser.$[elem].updatedAt': new Date(),
        },
      },
      {
        arrayFilters: [{ 'elem.user': dbUser._id }],
      }
    );

    // Also add read status for messages that don't have this user's status yet
    await Message.updateMany(
      {
        conversation: new mongoose.Types.ObjectId(conversationId),
        sender: { $ne: dbUser._id },
        isDeleted: false,
        'statusPerUser.user': { $ne: dbUser._id },
      },
      {
        $push: {
          statusPerUser: {
            user: dbUser._id,
            status: 'read',
            updatedAt: new Date(),
          },
        },
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark messages as read' },
      { status: 500 }
    );
  }
}
