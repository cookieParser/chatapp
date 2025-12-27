import mongoose from 'mongoose';
import { connectDB, Group, Conversation, User } from '@/lib/db';
import type { IGroup, IGroupMember } from '@/lib/db/models/Group';
import type {
  CreateGroupInput,
  UpdateGroupInput,
  AddMemberInput,
  UpdateMemberInput,
  GroupRole,
} from '@/types/group';

export class GroupService {
  private async ensureConnection() {
    await connectDB();
  }

  async createGroup(creatorId: string, input: CreateGroupInput): Promise<IGroup> {
    await this.ensureConnection();

    const creatorObjectId = new mongoose.Types.ObjectId(creatorId);
    const memberObjectIds = input.memberIds.map((id) => new mongoose.Types.ObjectId(id));

    // Verify all members exist
    const existingUsers = await User.find({ _id: { $in: memberObjectIds } });
    if (existingUsers.length !== memberObjectIds.length) {
      throw new Error('One or more members do not exist');
    }

    // Create conversation for the group
    const allParticipantIds = [creatorObjectId, ...memberObjectIds.filter(
      (id) => id.toString() !== creatorId
    )];

    const conversation = await Conversation.create({
      type: 'group',
      name: input.name,
      description: input.description,
      image: input.avatarUrl,
      participants: allParticipantIds.map((userId) => ({
        user: userId,
        role: userId.toString() === creatorId ? 'admin' : 'member',
      })),
      createdBy: creatorObjectId,
    });

    // Build members array with owner first
    const members: IGroupMember[] = [
      {
        user: creatorObjectId,
        role: 'owner' as GroupRole,
        joinedAt: new Date(),
        isMuted: false,
      },
      ...memberObjectIds
        .filter((id) => id.toString() !== creatorId)
        .map((userId) => ({
          user: userId,
          role: 'member' as GroupRole,
          joinedAt: new Date(),
          addedBy: creatorObjectId,
          isMuted: false,
        })),
    ];

    const group = await Group.create({
      metadata: {
        name: input.name,
        description: input.description,
        avatarUrl: input.avatarUrl,
        isPublic: input.isPublic ?? false,
        maxMembers: 100,
        allowMemberInvites: true,
      },
      members,
      owner: creatorObjectId,
      conversation: conversation._id,
    });

    return group;
  }

  async getGroup(groupId: string, userId: string): Promise<IGroup | null> {
    await this.ensureConnection();

    const group = await Group.findById(groupId)
      .populate('members.user', 'name email image status')
      .populate('owner', 'name email image');

    if (!group) return null;

    // Check if user is a member or group is public
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const isMember = group.members.some(
      (m) => m.user._id.toString() === userId
    );

    if (!isMember && !group.metadata.isPublic) {
      throw new Error('Access denied');
    }

    return group;
  }

  async getUserGroups(userId: string): Promise<IGroup[]> {
    await this.ensureConnection();

    return Group.find({ 'members.user': new mongoose.Types.ObjectId(userId) })
      .populate('members.user', 'name email image status')
      .populate('owner', 'name email image')
      .sort({ updatedAt: -1 });
  }

  async updateGroup(
    groupId: string,
    userId: string,
    input: UpdateGroupInput
  ): Promise<IGroup> {
    await this.ensureConnection();

    const group = await Group.findById(groupId);
    if (!group) throw new Error('Group not found');

    // Only owner or admin can update
    const userObjectId = new mongoose.Types.ObjectId(userId);
    if (!group.isAdmin(userObjectId) && !group.isOwner(userObjectId)) {
      throw new Error('Only admins can update group settings');
    }

    // Update metadata fields
    if (input.name) group.metadata.name = input.name;
    if (input.description !== undefined) group.metadata.description = input.description;
    if (input.avatarUrl !== undefined) group.metadata.avatarUrl = input.avatarUrl;
    if (input.isPublic !== undefined) group.metadata.isPublic = input.isPublic;
    if (input.maxMembers !== undefined) group.metadata.maxMembers = input.maxMembers;
    if (input.allowMemberInvites !== undefined) {
      group.metadata.allowMemberInvites = input.allowMemberInvites;
    }

    await group.save();

    // Sync with conversation
    await Conversation.findByIdAndUpdate(group.conversation, {
      name: group.metadata.name,
      description: group.metadata.description,
      image: group.metadata.avatarUrl,
    });

    return group;
  }

  async addMember(
    groupId: string,
    requesterId: string,
    input: AddMemberInput
  ): Promise<IGroup> {
    await this.ensureConnection();

    const group = await Group.findById(groupId);
    if (!group) throw new Error('Group not found');

    const requesterObjectId = new mongoose.Types.ObjectId(requesterId);
    const newMemberObjectId = new mongoose.Types.ObjectId(input.userId);

    // Check permissions
    const isAdmin = group.isAdmin(requesterObjectId) || group.isOwner(requesterObjectId);
    const canInvite = group.metadata.allowMemberInvites && group.isMember(requesterObjectId);

    if (!isAdmin && !canInvite) {
      throw new Error('You do not have permission to add members');
    }

    // Check if already a member
    if (group.isMember(newMemberObjectId)) {
      throw new Error('User is already a member');
    }

    // Check max members
    if (group.members.length >= group.metadata.maxMembers) {
      throw new Error('Group has reached maximum members');
    }

    // Verify user exists
    const user = await User.findById(newMemberObjectId);
    if (!user) throw new Error('User not found');

    // Add to group
    group.members.push({
      user: newMemberObjectId,
      role: input.role || 'member',
      joinedAt: new Date(),
      addedBy: requesterObjectId,
      isMuted: false,
    });

    await group.save();

    // Add to conversation
    await Conversation.findByIdAndUpdate(group.conversation, {
      $push: {
        participants: {
          user: newMemberObjectId,
          role: 'member',
          joinedAt: new Date(),
        },
      },
    });

    return group;
  }

  async removeMember(
    groupId: string,
    requesterId: string,
    targetUserId: string
  ): Promise<IGroup> {
    await this.ensureConnection();

    const group = await Group.findById(groupId);
    if (!group) throw new Error('Group not found');

    const requesterObjectId = new mongoose.Types.ObjectId(requesterId);
    const targetObjectId = new mongoose.Types.ObjectId(targetUserId);

    // Owner cannot be removed
    if (group.isOwner(targetObjectId)) {
      throw new Error('Cannot remove the group owner');
    }

    // Check permissions: admin/owner can remove anyone, members can only leave
    const isAdmin = group.isAdmin(requesterObjectId) || group.isOwner(requesterObjectId);
    const isSelf = requesterId === targetUserId;

    if (!isAdmin && !isSelf) {
      throw new Error('You do not have permission to remove this member');
    }

    // Remove from group
    group.members = group.members.filter(
      (m) => m.user.toString() !== targetUserId
    );

    await group.save();

    // Update conversation
    await Conversation.findByIdAndUpdate(group.conversation, {
      $set: {
        'participants.$[elem].isActive': false,
        'participants.$[elem].leftAt': new Date(),
      },
    }, {
      arrayFilters: [{ 'elem.user': targetObjectId }],
    });

    return group;
  }

  async updateMember(
    groupId: string,
    requesterId: string,
    targetUserId: string,
    input: UpdateMemberInput
  ): Promise<IGroup> {
    await this.ensureConnection();

    const group = await Group.findById(groupId);
    if (!group) throw new Error('Group not found');

    const requesterObjectId = new mongoose.Types.ObjectId(requesterId);
    const targetObjectId = new mongoose.Types.ObjectId(targetUserId);

    // Find target member
    const memberIndex = group.members.findIndex(
      (m) => m.user.toString() === targetUserId
    );
    if (memberIndex === -1) throw new Error('Member not found');

    // Role changes require admin/owner
    if (input.role !== undefined) {
      if (!group.isAdmin(requesterObjectId) && !group.isOwner(requesterObjectId)) {
        throw new Error('Only admins can change member roles');
      }

      // Cannot change owner's role
      if (group.isOwner(targetObjectId)) {
        throw new Error('Cannot change owner role');
      }

      // Only owner can promote to admin
      if (input.role === 'admin' && !group.isOwner(requesterObjectId)) {
        throw new Error('Only owner can promote to admin');
      }

      group.members[memberIndex].role = input.role;

      // Sync role to conversation
      await Conversation.findByIdAndUpdate(group.conversation, {
        $set: { 'participants.$[elem].role': input.role === 'member' ? 'member' : 'admin' },
      }, {
        arrayFilters: [{ 'elem.user': targetObjectId }],
      });
    }

    // Nickname and mute can be changed by self or admin
    const isSelf = requesterId === targetUserId;
    const isAdmin = group.isAdmin(requesterObjectId) || group.isOwner(requesterObjectId);

    if (input.nickname !== undefined && (isSelf || isAdmin)) {
      group.members[memberIndex].nickname = input.nickname;
    }

    if (input.isMuted !== undefined && (isSelf || isAdmin)) {
      group.members[memberIndex].isMuted = input.isMuted;
    }

    await group.save();
    return group;
  }

  async transferOwnership(
    groupId: string,
    currentOwnerId: string,
    newOwnerId: string
  ): Promise<IGroup> {
    await this.ensureConnection();

    const group = await Group.findById(groupId);
    if (!group) throw new Error('Group not found');

    // Verify current owner
    if (!group.isOwner(new mongoose.Types.ObjectId(currentOwnerId))) {
      throw new Error('Only the owner can transfer ownership');
    }

    const newOwnerObjectId = new mongoose.Types.ObjectId(newOwnerId);

    // Verify new owner is a member
    if (!group.isMember(newOwnerObjectId)) {
      throw new Error('New owner must be a group member');
    }

    // Update roles
    const currentOwnerIndex = group.members.findIndex(
      (m) => m.user.toString() === currentOwnerId
    );
    const newOwnerIndex = group.members.findIndex(
      (m) => m.user.toString() === newOwnerId
    );

    group.members[currentOwnerIndex].role = 'admin';
    group.members[newOwnerIndex].role = 'owner';
    group.owner = newOwnerObjectId;

    await group.save();
    return group;
  }

  async deleteGroup(groupId: string, userId: string): Promise<void> {
    await this.ensureConnection();

    const group = await Group.findById(groupId);
    if (!group) throw new Error('Group not found');

    // Only owner can delete
    if (!group.isOwner(new mongoose.Types.ObjectId(userId))) {
      throw new Error('Only the owner can delete the group');
    }

    // Soft delete group and conversation
    await group.softDelete();
    await Conversation.findByIdAndUpdate(group.conversation, {
      isDeleted: true,
      deletedAt: new Date(),
    });
  }

  async searchPublicGroups(query: string, limit = 20): Promise<IGroup[]> {
    await this.ensureConnection();

    return Group.find({
      'metadata.isPublic': true,
      $text: { $search: query },
    })
      .limit(limit)
      .populate('owner', 'name image');
  }
}

export const groupService = new GroupService();
