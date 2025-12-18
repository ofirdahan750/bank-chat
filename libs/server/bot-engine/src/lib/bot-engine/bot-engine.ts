import type { ChatMessage, User } from '@poalim/shared-interfaces';
import { randomUUID } from 'crypto';

export type BotDecision = {
  botMessage: ChatMessage;
  typingMs: number;
};

type RoomMemory = {
  pendingQuestionKey: string | null;
  qa: Map<string, string>; // questionKey -> answer
};

export class BotEngine {
  private readonly memoryByRoom = new Map<string, RoomMemory>();

  onUserMessage(roomId: string, msg: ChatMessage): BotDecision | null {
    if (msg?.sender?.isBot) return null;

    const content = (msg?.content ?? '').trim();
    if (!content) return null;

    const mem = this.getRoomMemory(roomId);

    if (this.isQuestion(content)) {
      const key = this.normalizeQuestion(content);
      mem.pendingQuestionKey = key;

      const rememberedAnswer = mem.qa.get(key);
      if (!rememberedAnswer) return null;

      const botContent = `${this.pickRecallPrefix()}\n${rememberedAnswer}`;

      return {
        botMessage: this.buildBotMessage(botContent),
        typingMs: this.pickTypingMs(),
      };
    }

    // Treat non-question messages as potential answers to the last pending question.
    if (mem.pendingQuestionKey && !mem.qa.has(mem.pendingQuestionKey)) {
      mem.qa.set(mem.pendingQuestionKey, content);
      mem.pendingQuestionKey = null;
    }

    return null;
  }

  private getRoomMemory(roomId: string): RoomMemory {
    const existing = this.memoryByRoom.get(roomId);
    if (existing) return existing;

    const created: RoomMemory = {
      pendingQuestionKey: null,
      qa: new Map<string, string>(),
    };
    this.memoryByRoom.set(roomId, created);
    return created;
  }

  private buildBotMessage(content: string): ChatMessage {
    const botUser: User = {
      id: 'bot',
      username: 'Bot',
      isBot: true,
      color: '#7c3aed',
    };

    return {
      id: randomUUID(),
      sender: botUser,
      content,
      timestamp: Date.now(),
      type: 'system',
    };
  }

  private pickTypingMs(): number {
    // 450-900ms, feels human-ish without being annoying
    return 450 + Math.floor(Math.random() * 451);
  }

  private pickRecallPrefix(): string {
    const options: readonly string[] = [
      "I remember this one. Here's the answer that was given before:",
      'Already answered. Replaying the greatest hit:',
      "Deja-vu detected. Here's what was said last time:",
      'This question has a history. Here you go:',
    ];
    const idx = Math.floor(Math.random() * options.length);
    return options[idx] ?? options[0];
  }

  private isQuestion(text: string): boolean {
    const t = text.trim();

    if (t.endsWith('?')) return true;

    // English question starters
    const enStarters: readonly string[] = [
      'what',
      'why',
      'how',
      'when',
      'where',
      'who',
      'which',
      'is',
      'are',
      'do',
      'does',
      'did',
      'can',
      'could',
      'should',
      'would',
      'will',
      'may',
    ];

    // Hebrew question starters (detection only; bot still replies in English)
    const heStarters: readonly string[] = [
      'מה',
      'למה',
      'איך',
      'מתי',
      'איפה',
      'מי',
      'האם',
      'אפשר',
      'יכול',
      'יכולה',
      'כדאי',
      'צריך',
    ];

    const first = t.split(/\s+/)[0]?.toLowerCase() ?? '';
    return enStarters.includes(first) || heStarters.includes(first);
  }

  private normalizeQuestion(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[?!.,;:]+$/g, '');
  }
}
