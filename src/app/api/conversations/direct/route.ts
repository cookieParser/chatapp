import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, Conversation, User } from '@/lib/db';
import mongoose from 'mongoose';

// POST /api/conversations/direct - Get or create a direct conversation with a user
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { targetUserId } = body;

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'Target user ID is required' },
        { status: 400 }
      );
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return NextResponse.json(
        { error: 'Invalid target user ID' },
        { status: 400 }
      );
    }

    await connectDB();

    // Get or create current user in DB
    let currentUser = await User.findOne({ email: session.user.email });
    if (!currentUser) {
      currentUser = await User.create({
        email: session.user.email,
        name: session.user.name || 'User',
        image: session.user.image || undefined,
        provider: 'credentials',
        status: 'online',
      });
    }

    // Prevent creating conversation with self
    if (currentUser._id.toString() === targetUserId) {
      return NextResponse.json(
        { error: 'Cannot create conversation with yourself' },
        { status: 400 }
      );
    }

    // Verify target user exists
    const targetUser = await User.findById(targetUserId).lean();
    if (!targetUser) {
      return NextResponse.json(
        { error: 'Target user not found' },
        { status: 404 }
      );
    }

    // Find existing direct conversation between the two users
    let conversation = await Conversation.findOne({
      type: 'direct',
      'participants.user': { $all: [currentUser._id, targetUser._id] },
    }).lean();

    // Create new conversation if doesn't exist
    if (!conversation) {
      conversation = await Conversation.create({
        type: 'direct',
        participants: [
          { user: currentUser._id, role: 'member', isActive: true },
          { user: targetUser._id, role: 'member', isActive: true },
        ],
        createdBy: currentUser._id,
      });
    }

    return NextResponse.json({
      conversationId: conversation._id.toString(),
      isNew: !conversation.lastMessageAt,
    });
  } catch (error) {
    console.error('Error creating direct conversation:', error);
    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    );
  }
}
