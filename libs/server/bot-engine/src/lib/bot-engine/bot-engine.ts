import { randomUUID } from 'crypto';
import { ChatMessage } from '@poalim/shared-interfaces';
import { AppConfig } from '@poalim/constants';

type RoomId = string;

type BotDecision = {
  typingMs: number;
  botMessage: ChatMessage;
};

const normalizeQuestionKey = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?!.,:;"'()[\]{}]/g, '')
    .trim();

const isQuestion = (text: string): boolean => {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (t.endsWith('?')) return true;

  // lightweight heuristic for English questions without '?'
  const starters = [
    'who', 'what', 'where', 'when', 'why', 'how',
    'is', 'are', 'do', 'does', 'did',
    'can', 'could', 'should', 'would', 'will',
  ];

  return starters.some((s) => t.startsWith(`${s} `));
};

export class BotEngine {
  private readonly answerByQuestionKeyByRoom = new Map<RoomId, Map<string, ChatMessage>>();
  private readonly pendingQuestionKeyByRoom = new Map<RoomId, string | null>();

  private getRoomMemory(roomId: RoomId): Map<string, ChatMessage> {
    const existing = this.answerByQuestionKeyByRoom.get(roomId);
    if (existing) return existing;

    const next = new Map<string, ChatMessage>();
    this.answerByQuestionKeyByRoom.set(roomId, next);
    return next;
  }

  onUserMessage(roomId: RoomId, msg: ChatMessage): BotDecision | null {
    // ignore bot messages completely
    if (msg.sender?.isBot) return null;

    const content = (msg.content ?? '').trim();
    if (!content) return null;

    const memory = this.getRoomMemory(roomId);

    // if it's a question: answer only if we already have a saved human answer
    if (isQuestion(content)) {
      const key = normalizeQuestionKey(content);
      this.pendingQuestionKeyByRoom.set(roomId, key);

      const saved = memory.get(key);
      if (!saved) return null;

      const botMessage: ChatMessage = {
        id: randomUUID(),
        sender: {
          id: 'bot',
          username: AppConfig.BOT_NAME,
          isBot: true,
          color: '#ed1d24',
        },
        type: 'system',
        timestamp: Date.now(),
        content: `${AppConfig.BOT_NAME}: I remember this. The last answer was: "${saved.content}"`,
      };

      return { typingMs: 700, botMessage };
    }

    // if it's NOT a question: treat it as the answer to the last pending question (human-only)
    const pendingKey = this.pendingQuestionKeyByRoom.get(roomId);
    if (!pendingKey) return null;

    // do not overwrite existing memory; first good answer wins
    if (!memory.has(pendingKey)) {
      memory.set(pendingKey, msg);
    }

    // clear pending question so we don't attach random future messages as answers
    this.pendingQuestionKeyByRoom.set(roomId, null);

    return null;
  }
}
