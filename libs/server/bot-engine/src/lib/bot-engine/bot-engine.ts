import { randomUUID } from 'crypto';
import { BOT_ENGINE_TEXT } from '@poalim/constants';
import {
  BotAction,
  BotEngineQaEntry,
  BotEngineRoomId,
  BotEngineRoomMemory,
  ChatMessage,
  PersistedBotRoomMemory,
  User,
} from '@poalim/shared-interfaces';

export class BotEngine {
  // Per-room in-memory state (rebuilt from persisted JSON on server start).
  private readonly rooms = new Map<BotEngineRoomId, BotEngineRoomMemory>();

  hydrateRoom(
    roomId: BotEngineRoomId,
    data?: PersistedBotRoomMemory | null
  ): void {
    const mem = this.ensureRoom(roomId);

    // Restore persisted state (or reset if missing).
    mem.pending = data?.pending ?? null;
    mem.qaByKey.clear();
    mem.keyByQuestionMessageId.clear();
    mem.keyByAnswerMessageId.clear();

    for (const raw of data?.qa ?? []) {
      // Defensive validation (persisted JSON can be dirty).
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

      const entry: BotEngineQaEntry = { ...raw };
      mem.qaByKey.set(entry.key, entry);
      mem.keyByQuestionMessageId.set(entry.questionMessageId, entry.key);
      mem.keyByAnswerMessageId.set(entry.answerMessageId, entry.key);
    }
  }

  dumpRoom(roomId: BotEngineRoomId): PersistedBotRoomMemory {
    const mem = this.ensureRoom(roomId);

    // Persist only what can be serialized.
    return {
      pending: mem.pending,
      qa: Array.from(mem.qaByKey.values()),
    };
  }

  onUserMessage(
    roomId: BotEngineRoomId,
    userMessage: ChatMessage,
    botUser: User
  ): BotAction | null {
    if (userMessage.sender?.isBot) return null;

    const raw = (userMessage.content ?? '').trim();
    if (!raw) return null;

    const mem = this.ensureRoom(roomId);

    // 1) If we are waiting for an answer – treat the next non-question as the answer.
    if (mem.pending) {
      if (!this.isQuestion(raw)) {
        const now = Date.now();
        const pending = mem.pending;

        const entry: BotEngineQaEntry = {
          key: pending.key,
          question: pending.question,
          answer: raw,
          questionMessageId: pending.questionMessageId,
          answerMessageId: userMessage.id,
          updatedAt: now,
        };

        mem.qaByKey.set(entry.key, entry);
        mem.keyByQuestionMessageId.set(entry.questionMessageId, entry.key);
        mem.keyByAnswerMessageId.set(entry.answerMessageId, entry.key);

        mem.pending = null;

        return this.buildBotAction(
          botUser,
          this.savedLine(entry.question, entry.answer)
        );
      }

      // If user asked another question instead of answering – drop pending state.
      mem.pending = null;
    }

    // 2) Normal flow: require a question mark to treat it as a question.
    if (!this.isQuestion(raw)) {
      return this.buildBotAction(botUser, this.missingQuestionMarkLine());
    }

    const questionPretty = this.prettyQuestion(raw);
    const key = this.normalizeQuestionKey(raw);
    const known = mem.qaByKey.get(key);

    if (known) {
      return this.buildBotAction(botUser, this.rememberedLine(known.answer));
    }

    // 3) New question: ask for the answer next.
    mem.pending = {
      key,
      question: questionPretty,
      questionMessageId: userMessage.id,
    };
    return this.buildBotAction(botUser, this.askForAnswerLine());
  }

  onMessageEdited(
    roomId: BotEngineRoomId,
    updatedMessage: ChatMessage,
    botUser: User
  ): BotAction | null {
    if (updatedMessage.sender?.isBot) return null;

    const raw = (updatedMessage.content ?? '').trim();
    if (!raw) return null;

    const mem = this.ensureRoom(roomId);

    // 1) Edited an ANSWER that was already learned -> update memory.
    const keyFromAnswer = mem.keyByAnswerMessageId.get(updatedMessage.id);
    if (keyFromAnswer) {
      const entry = mem.qaByKey.get(keyFromAnswer);
      if (entry) {
        entry.answer = raw;
        entry.updatedAt = Date.now();
        mem.qaByKey.set(entry.key, entry);

        return this.buildBotAction(
          botUser,
          this.updatedAnswerLine(entry.question, entry.answer)
        );
      }
    }

    // 2) Edited a QUESTION that already has an answer -> update key + mappings.
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

        // Move maps if key changed.
        if (oldKey !== nextKey) {
          mem.qaByKey.delete(oldKey);
          mem.qaByKey.set(nextKey, entry);
          mem.keyByQuestionMessageId.set(entry.questionMessageId, nextKey);
          mem.keyByAnswerMessageId.set(entry.answerMessageId, nextKey);
        } else {
          mem.qaByKey.set(nextKey, entry);
        }

        // If it became a question, answer it immediately.
        if (this.isQuestion(raw)) {
          return this.buildBotAction(
            botUser,
            this.rememberedLine(entry.answer)
          );
        }

        // If not a question – keep memory updated but don't spam.
        return null;
      }
    }

    // 3) Otherwise treat edit as a fresh message for bot logic.
    return this.onUserMessage(roomId, updatedMessage, botUser);
  }

  private ensureRoom(roomId: BotEngineRoomId): BotEngineRoomMemory {
    const existing = this.rooms.get(roomId);
    if (existing) return existing;

    const next: BotEngineRoomMemory = {
      pending: null,
      qaByKey: new Map<string, BotEngineQaEntry>(),
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
    return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\?+$/g, '?');
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

  private format(template: string, vars: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
  }

  private missingQuestionMarkLine(): string {
    return this.pickOne(BOT_ENGINE_TEXT.MISSING_QUESTION_MARK);
  }

  private askForAnswerLine(): string {
    return this.pickOne(BOT_ENGINE_TEXT.ASK_FOR_ANSWER);
  }

  private savedLine(question: string, answer: string): string {
    const base = this.pickOne(BOT_ENGINE_TEXT.SAVED_PREFIXES);

    return this.format(BOT_ENGINE_TEXT.TEMPLATES.SAVED_LINE, {
      base,
      question,
      answer,
    });
  }

  private updatedAnswerLine(question: string, answer: string): string {
    const base = this.pickOne(BOT_ENGINE_TEXT.UPDATED_PREFIXES);

    return this.format(BOT_ENGINE_TEXT.TEMPLATES.UPDATED_LINE, {
      base,
      question,
      answer,
    });
  }

  private rememberedLine(answer: string): string {
    const intro = this.pickOne(BOT_ENGINE_TEXT.REMEMBERED_PREFIXES);

    return this.format(BOT_ENGINE_TEXT.TEMPLATES.REMEMBERED_LINE, {
      intro,
      answer,
    });
  }
}
