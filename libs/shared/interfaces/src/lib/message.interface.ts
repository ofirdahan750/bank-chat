import { User } from './user.interface';

export type ChatMessageType = 'text' | 'system';
export type ReactionKey = 'like' | 'heart' | 'laugh' | 'wow' | 'sad';
export type MessageReactions = Partial<Record<ReactionKey, string[]>>;

export interface ChatMessageEdit {
  previousContent: string;
  editedAt: number;
}

export interface ChatMessage {
  id: string;
  sender: User;
  content: string;
  timestamp: number;
  type: ChatMessageType;

  editedAt?: number;
  edits?: ChatMessageEdit[];

  reactions?: MessageReactions;
}
