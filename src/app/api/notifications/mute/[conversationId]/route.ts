import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, User, Conversation, NotificationPreferences } from '@/lib/db';
import mongoose from 'mongoose';

// POST /api/notifications/mute/[conversationId] - Mute a conversation
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

    const body = await request.json().catch(() => ({}));
    const { duration } = body; // Duration in minutes, undefined = forever

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

    const mutedUntil = duration ? new Date(Date.now() + duration * 60 * 1000) : undefined;

    // Update or create notification preferences
    await NotificationPreferences.findOneAndUpdate(
      { user: dbUser._id },
      {
        $pull: { mutedConversations: { conversationId: new mongoose.Types.ObjectId(conversationId) } },
      }
    );

    await NotificationPreferences.findOneAndUpdate(
      { user: dbUser._id },
      {
        $push: {
          mutedConversations: {
            conversationId: new mongoose.Types.ObjectId(conversationId),
            mutedAt: new Date(),
            mutedUntil,
          },
        },
      },
      { upsert: true }
    );

    return NextResponse.json({
      conversationId,
      isMuted: true,
      mutedUntil: mutedUntil?.toISOString(),
    });
  } catch (error) {
    console.error('Error muting conversation:', error);
    return NextResponse.json(
      { error: 'Failed to mute conversation' },
      { status: 500 }
    );
  }
}

// DELETE /api/notifications/mute/[conversationId] - Unmute a conversation
export async function DELETE(
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

    await NotificationPreferences.findOneAndUpdate(
      { user: dbUser._id },
      {
        $pull: { mutedConversations: { conversationId: new mongoose.Types.ObjectId(conversationId) } },
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error unmuting conversation:', error);
    return NextResponse.json(
      { error: 'Failed to unmute conversation' },
      { status: 500 }
    );
  }
}
