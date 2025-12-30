import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, User, NotificationPreferences } from '@/lib/db';

// POST /api/notifications/push/subscribe - Register push subscription
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const subscription = await request.json();

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 });
    }

    await connectDB();

    const dbUser = await User.findOne({ email: session.user.email }).lean();
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Remove existing subscription with same endpoint, then add new one
    await NotificationPreferences.findOneAndUpdate(
      { user: dbUser._id },
      {
        $pull: { pushSubscriptions: { endpoint: subscription.endpoint } },
      }
    );

    await NotificationPreferences.findOneAndUpdate(
      { user: dbUser._id },
      {
        $push: {
          pushSubscriptions: {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.keys.p256dh,
              auth: subscription.keys.auth,
            },
            createdAt: new Date(),
          },
        },
        $setOnInsert: {
          pushEnabled: true,
          soundEnabled: true,
          desktopEnabled: true,
          mutedConversations: [],
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error registering push subscription:', error);
    return NextResponse.json(
      { error: 'Failed to register subscription' },
      { status: 500 }
    );
  }
}
