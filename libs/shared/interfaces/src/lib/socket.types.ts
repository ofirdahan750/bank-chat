import {  User } from "./user.interface";
import { ChatMessage } from "./message.interface";

export type RoomId = string;

export interface JoinRoomPayload {
  roomId: RoomId;
  user: User;
}

export interface SendMessagePayload {
  roomId: RoomId;
  message: ChatMessage;
}

export interface RoomHistoryPayload {
  roomId: RoomId;
  messages: ChatMessage[];
}

export interface BotTypingPayload {
  roomId: RoomId;
  isTyping: boolean;
}
