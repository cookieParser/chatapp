import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { groupService } from '@/services/groupService';
import type { UpdateMemberInput } from '@/types/group';

interface RouteParams {
  params: Promise<{ groupId: string; userId: string }>;
}

// PATCH /api/groups/[groupId]/members/[userId] - Update member (role, nickname, mute)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId, userId } = await params;
    const body: UpdateMemberInput = await request.json();

    const group = await groupService.updateMember(
      groupId,
      session.user.id,
      userId,
      body
    );
    return NextResponse.json(group);
  } catch (error) {
    console.error('Error updating member:', error);
    const message = error instanceof Error ? error.message : 'Failed to update member';
    const status = message.includes('admin') || message.includes('owner') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE /api/groups/[groupId]/members/[userId] - Remove member from group
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId, userId } = await params;
    const group = await groupService.removeMember(groupId, session.user.id, userId);

    return NextResponse.json(group);
  } catch (error) {
    console.error('Error removing member:', error);
    const message = error instanceof Error ? error.message : 'Failed to remove member';
    const status = message.includes('permission') || message.includes('owner') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
