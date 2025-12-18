import { randomUUID } from 'crypto';
import { AppConfig, UIText, ChatUi } from '@poalim/constants';
import { ChatMessage, User } from '@poalim/shared-interfaces';

type RoomId = string;

const MAX_QA_PER_ROOM = 300;

const normalize = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s?]/g, '') // keep words/spaces/?
    .replace(/\s+/g, ' ');

const isQuestion = (value: string): boolean => normalize(value).endsWith('?');

const createBotUser = (): User => ({
  id: ChatUi.BOT.ID,
  username: AppConfig.BOT_NAME,
  isBot: true,
  color: ChatUi.BOT.DEFAULT_COLOR,
});

export interface BotDecision {
  typingMs: number;
  botMessage: ChatMessage;
}

export class BotEngine {
  private readonly bot: User = createBotUser();

  // roomId -> (normalizedQuestion -> answerText)
  private readonly qaByRoom = new Map<RoomId, Map<string, string>>();

  // roomId -> last unanswered normalizedQuestion
  private readonly pendingQuestionByRoom = new Map<RoomId, string>();

  onUserMessage(roomId: RoomId, msg: ChatMessage): BotDecision | null {
    // ignore bot/system messages
    if (msg.sender.isBot || msg.type !== 'text') return null;

    const text = msg.content.trim();
    if (!text) return null;

    const roomQa = this.getRoomQa(roomId);

    // If it's a question:
    if (isQuestion(text)) {
      const key = normalize(text);
      const knownAnswer = roomQa.get(key);

      // If we already know the answer -> bot responds
      if (knownAnswer) {
        return {
          typingMs: AppConfig.BOT_DELAY_MS,
          botMessage: {
            id: randomUUID(),
            sender: this.bot,
            type: 'system',
            timestamp: Date.now(),
            content: `${UIText.BOT.DUPLICATE_ANSWER_PREFIX}\n${knownAnswer}`,
          },
        };
      }

      // Otherwise, mark it as pending so next human message can become the answer
      this.pendingQuestionByRoom.set(roomId, key);
      return null;
    }

    // Not a question -> maybe it's an answer to the last pending question
    const pending = this.pendingQuestionByRoom.get(roomId);
    if (!pending) return null;

    // Learn Q/A
    roomQa.set(pending, text);

    // Keep map size sane
    if (roomQa.size > MAX_QA_PER_ROOM) {
      const firstKey = roomQa.keys().next().value as string | undefined;
      if (firstKey) roomQa.delete(firstKey);
    }

    this.pendingQuestionByRoom.delete(roomId);
    return null;
  }

  private getRoomQa(roomId: RoomId): Map<string, string> {
    const existing = this.qaByRoom.get(roomId);
    if (existing) return existing;

    const created = new Map<string, string>();
    this.qaByRoom.set(roomId, created);
    return created;
  }
}
