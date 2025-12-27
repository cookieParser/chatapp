import mongoose, { Schema, Document, Model } from 'mongoose';

export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface IMessageStatus {
  user: mongoose.Types.ObjectId;
  status: MessageStatus;
  updatedAt: Date;
}

export interface IMediaAttachment {
  publicId: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  resourceType: 'image' | 'video' | 'raw';
}

export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId;
  conversation: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  content: string;
  type: 'text' | 'image' | 'file' | 'system';
  media?: IMediaAttachment;
  replyTo?: mongoose.Types.ObjectId;
  statusPerUser: IMessageStatus[];
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MessageStatusSchema = new Schema<IMessageStatus>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const MediaAttachmentSchema = new Schema<IMediaAttachment>(
  {
    publicId: { type: String, required: true },
    url: { type: String, required: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    width: { type: Number },
    height: { type: Number },
    resourceType: {
      type: String,
      enum: ['image', 'video', 'raw'],
      required: true,
    },
  },
  { _id: false }
);

const MessageSchema = new Schema<IMessage>(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 5000,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'file', 'system'],
      default: 'text',
    },
    media: {
      type: MediaAttachmentSchema,
    },
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
    statusPerUser: {
      type: [MessageStatusSchema],
      default: [],
    },
    editedAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
MessageSchema.index({ conversation: 1, createdAt: -1 });
MessageSchema.index({ sender: 1 });
MessageSchema.index({ conversation: 1, sender: 1 });
MessageSchema.index({ 'statusPerUser.user': 1, 'statusPerUser.status': 1 });
MessageSchema.index({ isDeleted: 1 });
MessageSchema.index({ createdAt: -1 });
MessageSchema.index({ replyTo: 1 });

// Optimized compound indexes for pagination and common queries
MessageSchema.index(
  { conversation: 1, _id: -1 },
  { name: 'conversation_cursor_pagination' }
);
MessageSchema.index(
  { conversation: 1, isDeleted: 1, _id: -1 },
  { name: 'conversation_messages_cursor' }
);
MessageSchema.index(
  { conversation: 1, isDeleted: 1, createdAt: -1 },
  { name: 'conversation_messages_by_date' }
);

// Compound index for fetching unread messages
MessageSchema.index(
  { conversation: 1, 'statusPerUser.user': 1, 'statusPerUser.status': 1 },
  { name: 'unread_messages_lookup' }
);

// Index for batch status updates
MessageSchema.index(
  { _id: 1, conversation: 1, sender: 1 },
  { name: 'batch_status_update' }
);

// Soft delete method
MessageSchema.methods.softDelete = async function (userId: mongoose.Types.ObjectId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

// Update status for a specific user
MessageSchema.methods.updateStatusForUser = async function (
  userId: mongoose.Types.ObjectId,
  status: MessageStatus
) {
  const existingStatus = this.statusPerUser.find(
    (s: IMessageStatus) => s.user.toString() === userId.toString()
  );

  if (existingStatus) {
    existingStatus.status = status;
    existingStatus.updatedAt = new Date();
  } else {
    this.statusPerUser.push({
      user: userId,
      status,
      updatedAt: new Date(),
    });
  }

  return this.save();
};

// Static method to mark messages as delivered/read
MessageSchema.statics.markAsDelivered = async function (
  conversationId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId
) {
  return this.updateMany(
    {
      conversation: conversationId,
      sender: { $ne: userId },
      'statusPerUser.user': { $ne: userId },
    },
    {
      $push: {
        statusPerUser: {
          user: userId,
          status: 'delivered',
          updatedAt: new Date(),
        },
      },
    }
  );
};

MessageSchema.statics.markAsRead = async function (
  conversationId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId
) {
  return this.updateMany(
    {
      conversation: conversationId,
      sender: { $ne: userId },
    },
    {
      $set: {
        'statusPerUser.$[elem].status': 'read',
        'statusPerUser.$[elem].updatedAt': new Date(),
      },
    },
    {
      arrayFilters: [{ 'elem.user': userId }],
    }
  );
};

const Message: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);

export default Message;
