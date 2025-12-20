import { ChatMessage } from '../messages/message.interface';
import { User } from '../user/user.interface';

export type BotAction = {
  typingMs: number;
  message: ChatMessage;
};

export type BotEngineRoomId = string;

export type BotEnginePending = {
  key: string;
  question: string;
  questionMessageId: string;
} | null;

export type BotEngineQaEntry = {
  key: string;
  question: string;
  answer: string;
  questionMessageId: string;
  answerMessageId: string;
  updatedAt: number;
};

export type PersistedBotRoomMemory = {
  pending: BotEnginePending;
  qa: BotEngineQaEntry[];
};

export type BotEngineRoomMemory = {
  pending: BotEnginePending;
  qaByKey: Map<string, BotEngineQaEntry>;
  keyByQuestionMessageId: Map<string, string>;
  keyByAnswerMessageId: Map<string, string>;
};

export type BotEngineTexts = {
  MISSING_QUESTION_MARK: readonly string[];
  ASK_FOR_ANSWER: readonly string[];
  SAVED_PREFIXES: readonly string[];
  UPDATED_PREFIXES: readonly string[];
  REMEMBERED_PREFIXES: readonly string[];
  TEMPLATES: {
    SAVED_LINE: string;
    UPDATED_LINE: string;
    REMEMBERED_LINE: string;
  };
};
