import { randomUUID } from 'crypto';
import { ChatMessage, User } from '@poalim/shared-interfaces';

export type BotAction = {
  typingMs: number;
  message: ChatMessage;
};

type RoomId = string;

type RoomState = {
  pendingQuestion: string | null;
  pendingKey: string | null;
};

export class BotEngine {
  private readonly qa = new Map<string, string>();
  private readonly roomState = new Map<RoomId, RoomState>();

  onUserMessage(roomId: RoomId, userMessage: ChatMessage, botUser: User): BotAction | null {
    if (userMessage.sender?.isBot) return null;

    const raw = (userMessage.content ?? '').trim();
    if (!raw) return null;

    const state = this.getRoomState(roomId);

    if (state.pendingKey && state.pendingQuestion) {
      if (!this.isQuestion(raw)) {
        const answer = raw;
        const question = state.pendingQuestion;

        this.qa.set(state.pendingKey, answer);

        state.pendingKey = null;
        state.pendingQuestion = null;

        return this.buildBotAction(botUser, this.savedLine(question, answer));
      }

      state.pendingKey = null;
      state.pendingQuestion = null;
    }

    if (!this.isQuestion(raw)) {
      return this.buildBotAction(botUser, this.missingQuestionMarkLine());
    }

    const questionPretty = this.prettyQuestion(raw);
    const key = this.normalizeQuestionKey(raw);
    const knownAnswer = this.qa.get(key);

    if (knownAnswer) {
      return this.buildBotAction(botUser, this.rememberedLine(knownAnswer));
    }

    state.pendingQuestion = questionPretty;
    state.pendingKey = key;

    return this.buildBotAction(botUser, this.askForAnswerLine());
  }

  private getRoomState(roomId: RoomId): RoomState {
    const existing = this.roomState.get(roomId);
    if (existing) return existing;

    const next: RoomState = { pendingQuestion: null, pendingKey: null };
    this.roomState.set(roomId, next);
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
