import { ChatMessage } from "../messages";

export type RoomId = string;

export type BotAction = {
  typingMs: number;
  message: ChatMessage;
};
