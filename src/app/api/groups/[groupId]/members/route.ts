import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { groupService } from '@/services/groupService';
import type { AddMemberInput } from '@/types/group';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// POST /api/groups/[groupId]/members - Add member to group
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    const body: AddMemberInput = await request.json();

    if (!body.userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const group = await groupService.addMember(groupId, session.user.id, body);
    return NextResponse.json(group);
  } catch (error) {
    console.error('Error adding member:', error);
    const message = error instanceof Error ? error.message : 'Failed to add member';
    const status = message.includes('permission') ? 403 : 
                   message.includes('already') || message.includes('maximum') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
