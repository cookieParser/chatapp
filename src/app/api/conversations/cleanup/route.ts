import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, Conversation } from '@/lib/db';

// DELETE /api/conversations/cleanup - Remove old channel conversations
export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    // Delete all group/channel type conversations that are default channels
    const channelNames = ['general', 'random', 'announcements', 'help'];
    
    const result = await Conversation.deleteMany({
      type: 'group',
      name: { $in: channelNames },
    });

    return NextResponse.json({ 
      message: 'Cleanup complete',
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error('Error cleaning up conversations:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup conversations' },
      { status: 500 }
    );
  }
}
