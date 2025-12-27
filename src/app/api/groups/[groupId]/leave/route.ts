import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { groupService } from '@/services/groupService';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// POST /api/groups/[groupId]/leave - Leave a group
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    await groupService.removeMember(groupId, session.user.id, session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error leaving group:', error);
    const message = error instanceof Error ? error.message : 'Failed to leave group';
    const status = message.includes('owner') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
