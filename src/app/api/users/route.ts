import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, User } from '@/lib/db';

// GET /api/users - Get all users (for group member selection)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    // Get current user from DB
    let currentUser = await User.findOne({ email: session.user.email }).lean();
    
    // Create current user if doesn't exist
    if (!currentUser) {
      currentUser = await User.create({
        email: session.user.email!,
        name: session.user.name || 'User',
        image: session.user.image || undefined,
        provider: 'credentials',
        status: 'online',
      });
    }

    const users = await User.find({}, 'name email image status').lean();

    const formattedUsers = users.map((user: any) => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      image: user.image,
      status: user.status,
    }));

    return NextResponse.json(formattedUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
