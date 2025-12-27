import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMutedConversation {
  conversationId: mongoose.Types.ObjectId;
  mutedAt: Date;
  mutedUntil?: Date;
}

export interface IPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: Date;
}

export interface INotificationPreferences extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  pushEnabled: boolean;
  soundEnabled: boolean;
  desktopEnabled: boolean;
  mutedConversations: IMutedConversation[];
  pushSubscriptions: IPushSubscription[];
  createdAt: Date;
  updatedAt: Date;
}

const MutedConversationSchema = new Schema<IMutedConversation>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    mutedAt: {
      type: Date,
      default: Date.now,
    },
    mutedUntil: {
      type: Date,
    },
  },
  { _id: false }
);

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const NotificationPreferencesSchema = new Schema<INotificationPreferences>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    pushEnabled: {
      type: Boolean,
      default: true,
    },
    soundEnabled: {
      type: Boolean,
      default: true,
    },
    desktopEnabled: {
      type: Boolean,
      default: true,
    },
    mutedConversations: {
      type: [MutedConversationSchema],
      default: [],
    },
    pushSubscriptions: {
      type: [PushSubscriptionSchema],
      default: [],
    },
  },
  { timestamps: true }
);

NotificationPreferencesSchema.index({ user: 1 });
NotificationPreferencesSchema.index({ 'mutedConversations.conversationId': 1 });

// Check if conversation is muted
NotificationPreferencesSchema.methods.isConversationMuted = function (
  conversationId: mongoose.Types.ObjectId
): boolean {
  const muted = this.mutedConversations.find(
    (m: IMutedConversation) => m.conversationId.toString() === conversationId.toString()
  );
  if (!muted) return false;
  if (!muted.mutedUntil) return true;
  return new Date() < muted.mutedUntil;
};

const NotificationPreferences: Model<INotificationPreferences> =
  mongoose.models.NotificationPreferences ||
  mongoose.model<INotificationPreferences>('NotificationPreferences', NotificationPreferencesSchema);

export default NotificationPreferences;
