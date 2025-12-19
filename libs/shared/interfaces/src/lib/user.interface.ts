export type RoomId = string;

export type MessageType = 'text' | 'system';

export type ReactionKey = 'like' | 'heart' | 'laugh' | 'wow' | 'sad';

export type MessageReactions = Partial<Record<ReactionKey, string[]>>;

export interface User {
  id: string;
  username: string;
  isBot: boolean;
  color: string;
}

export interface ChatMessageEdit {
  previousContent: string;
  editedAt: number;
}

export interface ChatMessage {
  id: string;
  sender: User;
  content: string;
  timestamp: number;
  type: MessageType;

  editedAt?: number;
  edits?: ChatMessageEdit[];

  reactions?: MessageReactions;
}

export interface JoinRoomPayload {
  roomId: RoomId;
  user: User;
}

export interface RoomHistoryPayload {
  roomId: RoomId;
  messages: ChatMessage[];
}

export interface SendMessagePayload {
  roomId: RoomId;
  message: ChatMessage;
}

export interface EditMessagePayload {
  roomId: RoomId;
  messageId: string;
  content: string;
}

export interface ToggleReactionPayload {
  roomId: RoomId;
  messageId: string;
  reaction: ReactionKey;
}

export interface BotTypingPayload {
  roomId: RoomId;
  isTyping: boolean;
}
