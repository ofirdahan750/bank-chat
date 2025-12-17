import { User } from './user.interface';

export interface ChatMessage {
  id: string; // UUID
  sender: User; // Full user object
  content: string; // The text payload
  timestamp: number; // Date.now()
  type: 'text' | 'system'; // 'system' for join/leave events
}
