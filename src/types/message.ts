export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type MessageType = 'text' | 'image' | 'file' | 'system';

export interface MediaAttachment {
  publicId: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  resourceType: 'image' | 'video' | 'raw';
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  content: string;
  type: MessageType;
  status: MessageStatus;
  media?: MediaAttachment;
  attachments?: Attachment[];
  replyToId?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface Attachment {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface TypingIndicator {
  channelId: string;
  userId: string;
  isTyping: boolean;
}
