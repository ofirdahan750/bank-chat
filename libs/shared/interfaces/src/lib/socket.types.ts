import { ChatMessage } from "./message.interface";
import { User } from "./user.interface";

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
