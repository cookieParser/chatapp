import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, User, Message, Conversation } from '@/lib/db';
import mongoose from 'mongoose';

// GET /api/notifications/unread - Get unread message counts per conversation
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const dbUser = await User.findOne({ email: session.user.email }).lean();
    if (!dbUser) {
      return NextResponse.json([]);
    }

    // Get all conversations the user is part of
    const conversations = await Conversation.find({
      'participants.user': dbUser._id,
      'participants.isActive': true,
    }).select('_id').lean();

    const conversationIds = conversations.map((c) => c._id);

    // Aggregate unread counts per conversation
    const unreadCounts = await Message.aggregate([
      {
        $match: {
          conversation: { $in: conversationIds },
          sender: { $ne: dbUser._id },
          isDeleted: false,
          $or: [
            { 'statusPerUser.user': { $ne: dbUser._id } },
            {
              statusPerUser: {
                $elemMatch: {
                  user: dbUser._id,
                  status: { $ne: 'read' },
                },
              },
            },
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

    const result = unreadCounts.map((item) => ({
      conversationId: item._id.toString(),
      count: item.count,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching unread counts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch unread counts' },
      { status: 500 }
    );
  }
}
