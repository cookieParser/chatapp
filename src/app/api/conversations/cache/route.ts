import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, User } from '@/lib/db';
import {
  invalidateChatListCache,
  getCachedChatList,
} from '@/lib/cache';

// DELETE /api/conversations/cache - Invalidate chat list cache for current user
export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const currentUser = await User.findOne({ email: session.user.email });
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = currentUser._id.toString();
    await invalidateChatListCache(userId);

    return NextResponse.json({ 
      success: true, 
      message: 'Chat list cache invalidated' 
    });
  } catch (error) {
    console.error('Error invalidating cache:', error);
    return NextResponse.json(
      { error: 'Failed to invalidate cache' },
      { status: 500 }
    );
  }
}

// GET /api/conversations/cache - Check cache status for current user
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const currentUser = await User.findOne({ email: session.user.email });
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = currentUser._id.toString();
    const cached = await getCachedChatList(userId);

    return NextResponse.json({
      cached: cached !== null,
      itemCount: cached?.length || 0,
    });
  } catch (error) {
    console.error('Error checking cache:', error);
    return NextResponse.json(
      { error: 'Failed to check cache' },
      { status: 500 }
    );
  }
}
