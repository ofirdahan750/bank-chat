import { ReactionKey } from '../message.interface';

// UI contract for the chat bubble reactions (no component-local types).
export interface ChatBubbleReactionOption {
  key: ReactionKey;
  emoji: string;
  label: string;
}

// Output payload when a user submits an edit.
export interface ChatBubbleEditSubmitEvent {
  messageId: string;
  content: string;
}

// Output payload when a user toggles a reaction.
export interface ChatBubbleReactionToggleEvent {
  messageId: string;
  reaction: ReactionKey;
}
