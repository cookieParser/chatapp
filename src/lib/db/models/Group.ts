import mongoose, { Schema, Document, Model } from 'mongoose';
import type { GroupRole } from '@/types/group';

export interface IGroupMember {
  user: mongoose.Types.ObjectId;
  role: GroupRole;
  joinedAt: Date;
  addedBy?: mongoose.Types.ObjectId;
  nickname?: string;
  isMuted: boolean;
}

export interface IGroupMetadata {
  name: string;
  description?: string;
  avatarUrl?: string;
  isPublic: boolean;
  maxMembers: number;
  allowMemberInvites: boolean;
}

export interface IGroup extends Document {
  _id: mongoose.Types.ObjectId;
  metadata: IGroupMetadata;
  members: IGroupMember[];
  owner: mongoose.Types.ObjectId;
  conversation: mongoose.Types.ObjectId;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GroupMemberSchema = new Schema<IGroupMember>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    nickname: { type: String, maxlength: 50 },
    isMuted: { type: Boolean, default: false },
  },
  { _id: false }
);

const GroupMetadataSchema = new Schema<IGroupMetadata>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    avatarUrl: { type: String },
    isPublic: { type: Boolean, default: false },
    maxMembers: { type: Number, default: 100, min: 2, max: 1000 },
    allowMemberInvites: { type: Boolean, default: true },
  },
  { _id: false }
);

const GroupSchema = new Schema<IGroup>(
  {
    metadata: { type: GroupMetadataSchema, required: true },
    members: {
      type: [GroupMemberSchema],
      validate: {
        validator: (v: IGroupMember[]) => v.length >= 1,
        message: 'A group must have at least 1 member',
      },
    },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

// Indexes
GroupSchema.index({ owner: 1 });
GroupSchema.index({ 'members.user': 1 });
GroupSchema.index({ 'metadata.name': 'text' });
GroupSchema.index({ 'metadata.isPublic': 1 });
GroupSchema.index({ isDeleted: 1 });
GroupSchema.index({ conversation: 1 });

// Exclude soft-deleted groups
GroupSchema.pre('find', function () {
  this.where({ isDeleted: false });
});

GroupSchema.pre('findOne', function () {
  this.where({ isDeleted: false });
});

// Methods
GroupSchema.methods.softDelete = async function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

GroupSchema.methods.isMember = function (userId: mongoose.Types.ObjectId): boolean {
  return this.members.some(
    (m: IGroupMember) => m.user.toString() === userId.toString()
  );
};

GroupSchema.methods.isAdmin = function (userId: mongoose.Types.ObjectId): boolean {
  const member = this.members.find(
    (m: IGroupMember) => m.user.toString() === userId.toString()
  );
  return member?.role === 'admin' || member?.role === 'owner';
};

GroupSchema.methods.isOwner = function (userId: mongoose.Types.ObjectId): boolean {
  return this.owner.toString() === userId.toString();
};

const Group: Model<IGroup> =
  mongoose.models.Group || mongoose.model<IGroup>('Group', GroupSchema);

export default Group;
