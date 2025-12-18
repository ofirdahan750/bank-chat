import { randomUUID } from 'crypto';
import { ChatMessage, User } from '@poalim/shared-interfaces';

export interface BotAction {
  typingMs: number;
  message: ChatMessage;
}

export interface BotMemorySnapshot {
  qa: Record<string, string>;
  pendingByRoom: Record<string, string | undefined>;
}

export class BotEngine {
  private readonly qa = new Map<string, string>();
  private readonly pendingByRoom = new Map<string, string>();
  private readonly answerStyle = [
    'I remember this one.',
    'Yep, seen it before.',
    'This question again? Fine. Here you go.',
    'My tiny brain cached this.',
  ];
  private readonly savedStyle = [
    'Saved. Ask it again and I will flex my memory.',
    'Locked in. I am basically a spreadsheet with confidence.',
    'Stored. Future me says thanks.',
    'Got it. I will remember that. Probably.',
  ];
  private readonly waitingStyle = [
    'Interesting. Who has the answer? I am taking notes.',
    'New question detected. Someone please teach me.',
    'I do not know yet. Feed me an answer.',
    'Fresh question. I am listening.',
  ];

  constructor(private readonly botUser: User, snapshot?: BotMemorySnapshot) {
    Object.entries(snapshot?.qa ?? {}).forEach(([q, a]) => this.qa.set(q, a));
    Object.entries(snapshot?.pendingByRoom ?? {}).forEach(([roomId, q]) => {
      if (q) this.pendingByRoom.set(roomId, q);
    });
  }

  snapshot(): BotMemorySnapshot {
    return {
      qa: Object.fromEntries(this.qa.entries()),
      pendingByRoom: Object.fromEntries(
        Array.from(this.pendingByRoom.entries()).map(([k, v]) => [k, v])
      ),
    };
  }

  onUserMessage(roomId: string, msg: ChatMessage): BotAction | null {
    if (!roomId) return null;
    if (!msg || !msg.content) return null;
    if (msg.sender?.isBot) return null;

    const raw = msg.content.trim();
    if (!raw) return null;

    const isQuestion = raw.endsWith('?');
    if (isQuestion) return this.handleQuestion(roomId, raw);

    return this.handleAnswer(roomId, raw);
  }

  private handleQuestion(roomId: string, questionRaw: string): BotAction | null {
    const qKey = this.normalizeQuestion(questionRaw);
    if (!qKey) return null;

    const known = this.qa.get(qKey);
    if (known) {
      const safe = this.isSafeToEcho(known);
      const prefix = this.pick(this.answerStyle);
      const content = safe
        ? `${prefix} Answer: ${known}`
        : `${prefix} I have an answer saved, but it is not in English, so I will not repeat it here.`;

      return this.reply(roomId, content, 550);
    }

    this.pendingByRoom.set(roomId, qKey);
    return this.reply(roomId, this.pick(this.waitingStyle), 350);
  }

  private handleAnswer(roomId: string, answerRaw: string): BotAction | null {
    const pending = this.pendingByRoom.get(roomId);
    if (!pending) return null;

    const clean = answerRaw.trim();
    if (!clean) return null;
    if (clean.endsWith('?')) return null;

    this.qa.set(pending, clean);
    this.pendingByRoom.delete(roomId);

    return this.reply(roomId, this.pick(this.savedStyle), 450);
  }

  private reply(roomId: string, content: string, typingMs: number): BotAction {
    const message: ChatMessage = {
      id: randomUUID(),
      sender: this.botUser,
      content,
      timestamp: Date.now(),
      type: 'system',
    };

    return { typingMs, message };
  }

  private normalizeQuestion(q: string): string {
    const base = q.trim().replace(/\s+/g, ' ').replace(/\?+$/g, '').trim();
    return base.toLowerCase();
  }

  private pick(list: string[]): string {
    const idx = Math.floor(Math.random() * list.length);
    return list[idx] ?? list[0] ?? '';
  }

  private isSafeToEcho(text: string): boolean {
    return !/[\u0590-\u05FF]/.test(text);
  }
}
