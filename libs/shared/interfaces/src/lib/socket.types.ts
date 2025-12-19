import { ChatMessage } from './message.interface';
import { User } from './user.interface';

export type ReactionKey = 'heart' | 'laugh' | 'like';

export interface JoinRoomPayload {
  roomId: string;
  user: User;
}

export interface RoomHistoryPayload {
  roomId: string;
  messages: ChatMessage[];
}

export interface SendMessagePayload {
  roomId: string;
  message: ChatMessage;
}

export interface BotTypingPayload {
  roomId: string;
  isTyping: boolean;
}

export interface EditMessagePayload {
  roomId: string;
  messageId: string;
  content: string;
}

export interface ToggleReactionPayload {
  roomId: string;
  messageId: string;
  reaction: ReactionKey;
}
