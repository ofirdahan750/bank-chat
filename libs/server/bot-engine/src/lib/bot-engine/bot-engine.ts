import { randomUUID } from 'crypto';
import { ChatMessage, User } from '@poalim/shared-interfaces';

export type BotAction = {
  typingMs: number;
  message: ChatMessage;
};

type RoomId = string;

type Pending = {
  key: string;
  question: string;
  questionMessageId: string;
} | null;

type QaEntry = {
  key: string;
  question: string;
  answer: string;
  questionMessageId: string;
  answerMessageId: string;
  updatedAt: number;
};

export type PersistedBotRoomMemory = {
  pending: Pending;
  qa: QaEntry[];
};

type RoomMemory = {
  pending: Pending;
  qaByKey: Map<string, QaEntry>;
  keyByQuestionMessageId: Map<string, string>;
  keyByAnswerMessageId: Map<string, string>;
};

export class BotEngine {
  private readonly rooms = new Map<RoomId, RoomMemory>();

  hydrateRoom(roomId: RoomId, data?: PersistedBotRoomMemory | null): void {
    const mem = this.ensureRoom(roomId);

    mem.pending = data?.pending ?? null;
    mem.qaByKey.clear();
    mem.keyByQuestionMessageId.clear();
    mem.keyByAnswerMessageId.clear();

    for (const raw of data?.qa ?? []) {
      if (
        !raw ||
        typeof raw.key !== 'string' ||
        typeof raw.question !== 'string' ||
        typeof raw.answer !== 'string' ||
        typeof raw.questionMessageId !== 'string' ||
        typeof raw.answerMessageId !== 'string' ||
        typeof raw.updatedAt !== 'number'
      ) {
        continue;
      }

      const entry: QaEntry = { ...raw };
      mem.qaByKey.set(entry.key, entry);
      mem.keyByQuestionMessageId.set(entry.questionMessageId, entry.key);
      mem.keyByAnswerMessageId.set(entry.answerMessageId, entry.key);
    }
  }

  dumpRoom(roomId: RoomId): PersistedBotRoomMemory {
    const mem = this.ensureRoom(roomId);
    return {
      pending: mem.pending,
      qa: Array.from(mem.qaByKey.values()),
    };
  }

  onUserMessage(roomId: RoomId, userMessage: ChatMessage, botUser: User): BotAction | null {
    if (userMessage.sender?.isBot) return null;

    const raw = (userMessage.content ?? '').trim();
    if (!raw) return null;

    const mem = this.ensureRoom(roomId);

    // Pending question waiting for an answer
    if (mem.pending) {
      if (!this.isQuestion(raw)) {
        const now = Date.now();
        const answer = raw;
        const pending = mem.pending;

        const entry: QaEntry = {
          key: pending.key,
          question: pending.question,
          answer,
          questionMessageId: pending.questionMessageId,
          answerMessageId: userMessage.id,
          updatedAt: now,
        };

        mem.qaByKey.set(entry.key, entry);
        mem.keyByQuestionMessageId.set(entry.questionMessageId, entry.key);
        mem.keyByAnswerMessageId.set(entry.answerMessageId, entry.key);

        mem.pending = null;

        return this.buildBotAction(botUser, this.savedLine(entry.question, entry.answer));
      }

      // If user asks a new question instead of answering, reset pending.
      mem.pending = null;
    }

    if (!this.isQuestion(raw)) {
      return this.buildBotAction(botUser, this.missingQuestionMarkLine());
    }

    const questionPretty = this.prettyQuestion(raw);
    const key = this.normalizeQuestionKey(raw);
    const known = mem.qaByKey.get(key);

    if (known) {
      return this.buildBotAction(botUser, this.rememberedLine(known.answer));
    }

    mem.pending = { key, question: questionPretty, questionMessageId: userMessage.id };
    return this.buildBotAction(botUser, this.askForAnswerLine());
  }

  onMessageEdited(roomId: RoomId, updatedMessage: ChatMessage, botUser: User): BotAction | null {
    if (updatedMessage.sender?.isBot) return null;

    const raw = (updatedMessage.content ?? '').trim();
    if (!raw) return null;

    const mem = this.ensureRoom(roomId);

    // 1) Edited an ANSWER that the bot already learned -> update memory
    const keyFromAnswer = mem.keyByAnswerMessageId.get(updatedMessage.id);
    if (keyFromAnswer) {
      const entry = mem.qaByKey.get(keyFromAnswer);
      if (entry) {
        const now = Date.now();
        entry.answer = raw;
        entry.updatedAt = now;
        mem.qaByKey.set(entry.key, entry);

        return this.buildBotAction(botUser, this.updatedAnswerLine(entry.question, entry.answer));
      }
    }

    // 2) Edited a QUESTION that already has an answer -> update key + answer lookup
    const keyFromQuestion = mem.keyByQuestionMessageId.get(updatedMessage.id);
    if (keyFromQuestion) {
      const entry = mem.qaByKey.get(keyFromQuestion);
      if (entry) {
        const now = Date.now();
        const nextPretty = this.prettyQuestion(raw);
        const nextKey = this.normalizeQuestionKey(raw);

        const oldKey = entry.key;

        entry.question = nextPretty;
        entry.key = nextKey;
        entry.updatedAt = now;

        // Update maps (move key if changed)
        if (oldKey !== nextKey) {
          mem.qaByKey.delete(oldKey);
          mem.qaByKey.set(nextKey, entry);
          mem.keyByQuestionMessageId.set(entry.questionMessageId, nextKey);
          mem.keyByAnswerMessageId.set(entry.answerMessageId, nextKey);
        } else {
          mem.qaByKey.set(nextKey, entry);
        }

        // If it is a question now, answer it (fresh bot message)
        if (this.isQuestion(raw)) {
          return this.buildBotAction(botUser, this.rememberedLine(entry.answer));
        }

        // Not a question -> don't spam; memory is still updated.
        return null;
      }
    }

    // 3) Otherwise treat edit like a "new message" for bot logic
    return this.onUserMessage(roomId, updatedMessage, botUser);
  }

  private ensureRoom(roomId: RoomId): RoomMemory {
    const existing = this.rooms.get(roomId);
    if (existing) return existing;

    const next: RoomMemory = {
      pending: null,
      qaByKey: new Map<string, QaEntry>(),
      keyByQuestionMessageId: new Map<string, string>(),
      keyByAnswerMessageId: new Map<string, string>(),
    };

    this.rooms.set(roomId, next);
    return next;
  }

  private buildBotAction(botUser: User, content: string): BotAction {
    const typingMs = this.pickTypingMs();

    const message: ChatMessage = {
      id: randomUUID(),
      sender: botUser,
      content,
      timestamp: Date.now(),
      type: 'system',
    };

    return { typingMs, message };
  }

  private isQuestion(text: string): boolean {
    return text.trim().endsWith('?');
  }

  private prettyQuestion(text: string): string {
    const t = text.trim();
    return t.endsWith('?') ? t : `${t}?`;
  }

  private normalizeQuestionKey(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\?+$/g, '?');
  }

  private pickTypingMs(): number {
    const base = 450;
    const jitter = Math.floor(Math.random() * 650);
    return base + jitter;
  }

  private pickOne(lines: readonly string[]): string {
    const idx = Math.floor(Math.random() * lines.length);
    return lines[idx] ?? lines[0] ?? '';
  }

  private missingQuestionMarkLine(): string {
    return this.pickOne([
      'I can only treat something as a question if it ends with a "?". Add one and I’ll behave.',
      'No "?" no magic. Add a question mark and I’ll file it properly.',
      'I’m a bot, not a mind reader. Toss in a "?" so I know it’s a question.',
      'Give me a "?" at the end and I’ll switch into answer-machine mode.',
    ]);
  }

  private askForAnswerLine(): string {
    return this.pickOne([
      'New question unlocked. Reply with the answer in your next message and I’ll remember it.',
      'I don’t know this one yet. Send the answer next and I’ll store it forever (or until the server restarts).',
      'Fresh mystery. Drop the answer in your next message and I’ll learn it.',
      'I’ve got nothing for that yet. Next message: the answer. I’ll do the remembering.',
    ]);
  }

  private savedLine(question: string, answer: string): string {
    const base = this.pickOne([
      'Saved. Next time someone asks, I’ve got you.',
      'Locked in. I will not forget. Probably.',
      'Stored. I am now 0.001% smarter.',
      'Saved. That knowledge is mine now. Thanks, human.',
    ]);

    return `${base} Q: "${question}" A: "${answer}"`;
  }

  private updatedAnswerLine(question: string, answer: string): string {
    const base = this.pickOne([
      'Updated. My memory just got a patch.',
      'Edited accepted. Memory rewritten.',
      'Reality has been revised. I have updated the answer.',
      'Version control says: new answer saved.',
    ]);

    return `${base} Q: "${question}" A: "${answer}"`;
  }

  private rememberedLine(answer: string): string {
    const intro = this.pickOne([
      'I remember this. The answer is:',
      'Memory check: passed. Answer:',
      'Seen this one before. Answer:',
      'Yep. We already solved this. Answer:',
    ]);

    return `${intro} "${answer}"`;
  }
}
