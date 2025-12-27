import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, Group, User } from '@/lib/db';
import type { CreateGroupInput } from '@/types/group';

// Helper to get MongoDB user from session
async function getDbUser(session: any) {
  if (!session?.user?.email) return null;
  
  await connectDB();
  let dbUser = await User.findOne({ email: session.user.email });
  
  if (!dbUser) {
    // Create user if doesn't exist
    dbUser = await User.create({
      email: session.user.email,
      name: session.user.name || 'User',
      image: session.user.image,
      provider: 'credentials',
      status: 'online',
    });
  }
  
  return dbUser;
}

// GET /api/groups - Get user's groups
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dbUser = await getDbUser(session);
    if (!dbUser) {
      return NextResponse.json([]);
    }

    const groups = await Group.find({ 'members.user': dbUser._id })
      .populate('members.user', 'name email image status')
      .populate('owner', 'name email image')
      .sort({ updatedAt: -1 });

    return NextResponse.json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    return NextResponse.json(
      { error: 'Failed to fetch groups' },
      { status: 500 }
    );
  }
}

// POST /api/groups - Create a new group
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dbUser = await getDbUser(session);
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body: CreateGroupInput = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: 'Group name is required' },
        { status: 400 }
      );
    }

    // Import groupService dynamically to avoid circular deps
    const { groupService } = await import('@/services/groupService');
    const group = await groupService.createGroup(dbUser._id.toString(), body);
    
    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    console.error('Error creating group:', error);
    const message = error instanceof Error ? error.message : 'Failed to create group';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
