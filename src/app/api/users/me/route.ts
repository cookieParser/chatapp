import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, User } from '@/lib/db';

// GET /api/users/me - Get current user's MongoDB profile
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    let dbUser = await User.findOne({ email: session.user.email }).lean();
    
    if (!dbUser) {
      // Create user if doesn't exist
      dbUser = await User.create({
        email: session.user.email!,
        name: session.user.name || 'User',
        image: session.user.image || undefined,
        provider: 'credentials',
        status: 'online',
      });
    }

    return NextResponse.json({
      id: dbUser._id.toString(),
      name: dbUser.name,
      email: dbUser.email,
      image: dbUser.image,
      status: dbUser.status,
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}
