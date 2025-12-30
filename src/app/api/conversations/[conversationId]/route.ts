import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, Conversation, User } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { conversationId } = await params;

    // Get the current user
    const currentUser = await User.findOne({ email: session.user.email }).select('_id').lean();
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find the conversation and verify user is a participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': currentUser._id,
      'participants.isActive': true,
    })
      .populate('participants.user', '_id name email image status')
      .lean();

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    return NextResponse.json(conversation);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
