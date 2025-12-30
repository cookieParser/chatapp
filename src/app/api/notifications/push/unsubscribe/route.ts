import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, User, NotificationPreferences } from '@/lib/db';

// POST /api/notifications/push/unsubscribe - Remove push subscription
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { endpoint } = await request.json();

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint required' }, { status: 400 });
    }

    await connectDB();

    const dbUser = await User.findOne({ email: session.user.email }).lean();
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await NotificationPreferences.findOneAndUpdate(
      { user: dbUser._id },
      {
        $pull: { pushSubscriptions: { endpoint } },
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing push subscription:', error);
    return NextResponse.json(
      { error: 'Failed to remove subscription' },
      { status: 500 }
    );
  }
}
