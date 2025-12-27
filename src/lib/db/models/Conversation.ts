import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IParticipant {
  user: mongoose.Types.ObjectId;
  joinedAt: Date;
  leftAt?: Date;
  role: 'admin' | 'member';
  isActive: boolean;
}

export interface IConversation extends Document {
  _id: mongoose.Types.ObjectId;
  type: 'direct' | 'group';
  name?: string;
  description?: string;
  image?: string;
  participants: IParticipant[];
  createdBy: mongoose.Types.ObjectId;
  lastMessage?: mongoose.Types.ObjectId;
  lastMessageAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ParticipantSchema = new Schema<IParticipant>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    leftAt: {
      type: Date,
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const ConversationSchema = new Schema<IConversation>(
  {
    type: {
      type: String,
      enum: ['direct', 'group'],
      required: true,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    image: {
      type: String,
    },
    participants: {
      type: [ParticipantSchema],
      validate: {
        validator: function (this: IConversation, v: IParticipant[]) {
          // Direct messages need 2 participants, groups/channels can have 1+
          if (this.type === 'direct') {
            return v.length >= 2;
          }
          return v.length >= 1;
        },
        message: 'A conversation must have at least 1 participant (2 for direct messages)',
      },
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
    lastMessageAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
ConversationSchema.index({ 'participants.user': 1 });
ConversationSchema.index({ 'participants.user': 1, 'participants.isActive': 1 });
ConversationSchema.index({ type: 1 });
ConversationSchema.index({ lastMessageAt: -1 });
ConversationSchema.index({ createdBy: 1 });
ConversationSchema.index({ isDeleted: 1 });
ConversationSchema.index({ createdAt: -1 });

// Compound index for finding direct conversations between two users
ConversationSchema.index(
  { type: 1, 'participants.user': 1 },
  { name: 'direct_conversation_lookup' }
);

// Exclude soft-deleted conversations by default
ConversationSchema.pre('find', function () {
  this.where({ isDeleted: false });
});

ConversationSchema.pre('findOne', function () {
  this.where({ isDeleted: false });
});

// Soft delete method
ConversationSchema.methods.softDelete = async function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

// Static method to find or create direct conversation
ConversationSchema.statics.findOrCreateDirect = async function (
  userId1: mongoose.Types.ObjectId,
  userId2: mongoose.Types.ObjectId
) {
  const existing = await this.findOne({
    type: 'direct',
    'participants.user': { $all: [userId1, userId2] },
    $expr: { $eq: [{ $size: '$participants' }, 2] },
  });

  if (existing) return existing;

  return this.create({
    type: 'direct',
    participants: [
      { user: userId1, role: 'member' },
      { user: userId2, role: 'member' },
    ],
    createdBy: userId1,
  });
};

const Conversation: Model<IConversation> =
  mongoose.models.Conversation ||
  mongoose.model<IConversation>('Conversation', ConversationSchema);

export default Conversation;
