import { ChatMessage, ReactionKey } from '../messages/message.interface';
import { User } from '../user/user.interface';
import { RoomId } from './room-id.type';

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

export interface BotTypingPayload {
  roomId: RoomId;
  isTyping: boolean;
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
