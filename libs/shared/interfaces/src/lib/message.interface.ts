import { User } from './user.interface';

export type ChatMessageType = 'text' | 'system';

export interface ChatMessage {
  id: string; // UUID
  sender: User; // Full user object
  content: string; // The text payload
  timestamp: number; // Date.now()
  type: ChatMessageType;
}
