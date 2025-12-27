import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { groupService } from '@/services/groupService';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// POST /api/groups/[groupId]/transfer-ownership - Transfer group ownership
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    const { newOwnerId } = await request.json();

    if (!newOwnerId) {
      return NextResponse.json(
        { error: 'New owner ID is required' },
        { status: 400 }
      );
    }

    const group = await groupService.transferOwnership(
      groupId,
      session.user.id,
      newOwnerId
    );

    return NextResponse.json(group);
  } catch (error) {
    console.error('Error transferring ownership:', error);
    const message = error instanceof Error ? error.message : 'Failed to transfer ownership';
    const status = message.includes('owner') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
