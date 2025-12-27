import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, User } from '@/lib/db';
import { isUserOnline, getUserLastSeen } from '@/lib/socket';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userIds = searchParams.get('userIds')?.split(',').filter(Boolean) || [];

    if (userIds.length === 0) {
      return NextResponse.json({ error: 'No user IDs provided' }, { status: 400 });
    }

    if (userIds.length > 100) {
      return NextResponse.json({ error: 'Too many user IDs (max 100)' }, { status: 400 });
    }

    await connectDB();

    // Get users from database for lastSeen fallback
    const users = await User.find({ _id: { $in: userIds } }).select('_id status lastSeen');

    const presenceData = userIds.map(userId => {
      const isOnline = isUserOnline(userId);
      const socketLastSeen = getUserLastSeen(userId);
      const dbUser = users.find(u => u._id.toString() === userId);

      return {
        userId,
        status: isOnline ? 'online' : 'offline',
        lastSeen: socketLastSeen?.toISOString() || dbUser?.lastSeen?.toISOString() || null,
      };
    });

    return NextResponse.json({ presence: presenceData });
  } catch (error) {
    console.error('Error fetching presence:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
