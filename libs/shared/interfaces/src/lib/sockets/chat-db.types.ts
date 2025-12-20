import { PersistedBotRoomMemory } from '../bot-engine/bot-engine.types';
import { ChatMessage } from '../messages/message.interface';

export type PersistedRoom = {
  messages: ChatMessage[];
  botMemory: PersistedBotRoomMemory;

  // userMessageId -> botMessageId
  botReplies: Record<string, string>;
};

export type PersistedDb = {
  rooms: Record<string, PersistedRoom>;
};
