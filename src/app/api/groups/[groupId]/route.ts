import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { groupService } from '@/services/groupService';
import type { UpdateGroupInput } from '@/types/group';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET /api/groups/[groupId] - Get group details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    const group = await groupService.getGroup(groupId, session.user.id);

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    return NextResponse.json(group);
  } catch (error) {
    console.error('Error fetching group:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch group';
    const status = message === 'Access denied' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// PATCH /api/groups/[groupId] - Update group metadata
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    const body: UpdateGroupInput = await request.json();

    const group = await groupService.updateGroup(groupId, session.user.id, body);
    return NextResponse.json(group);
  } catch (error) {
    console.error('Error updating group:', error);
    const message = error instanceof Error ? error.message : 'Failed to update group';
    const status = message.includes('admin') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE /api/groups/[groupId] - Delete group
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    await groupService.deleteGroup(groupId, session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting group:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete group';
    const status = message.includes('owner') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
