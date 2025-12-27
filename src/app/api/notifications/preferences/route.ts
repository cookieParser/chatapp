import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, User, NotificationPreferences } from '@/lib/db';

// GET /api/notifications/preferences - Get user's notification preferences
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const dbUser = await User.findOne({ email: session.user.email });
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let preferences = await NotificationPreferences.findOne({ user: dbUser._id });

    // Create default preferences if none exist
    if (!preferences) {
      preferences = await NotificationPreferences.create({
        user: dbUser._id,
        pushEnabled: true,
        soundEnabled: true,
        desktopEnabled: true,
        mutedConversations: [],
        pushSubscriptions: [],
      });
    }

    return NextResponse.json({
      pushEnabled: preferences.pushEnabled,
      soundEnabled: preferences.soundEnabled,
      desktopEnabled: preferences.desktopEnabled,
      mutedConversations: preferences.mutedConversations.map((m) => ({
        conversationId: m.conversationId.toString(),
        mutedUntil: m.mutedUntil?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return NextResponse.json(
      { error: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}

// PATCH /api/notifications/preferences - Update notification preferences
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { pushEnabled, soundEnabled, desktopEnabled } = body;

    await connectDB();

    const dbUser = await User.findOne({ email: session.user.email });
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updateData: Record<string, boolean> = {};
    if (typeof pushEnabled === 'boolean') updateData.pushEnabled = pushEnabled;
    if (typeof soundEnabled === 'boolean') updateData.soundEnabled = soundEnabled;
    if (typeof desktopEnabled === 'boolean') updateData.desktopEnabled = desktopEnabled;

    const preferences = await NotificationPreferences.findOneAndUpdate(
      { user: dbUser._id },
      { $set: updateData },
      { new: true, upsert: true }
    );

    return NextResponse.json({
      pushEnabled: preferences.pushEnabled,
      soundEnabled: preferences.soundEnabled,
      desktopEnabled: preferences.desktopEnabled,
      mutedConversations: preferences.mutedConversations.map((m) => ({
        conversationId: m.conversationId.toString(),
        mutedUntil: m.mutedUntil?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}
