import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AppConfig, ChatUi } from '@poalim/constants';
import { LocalStorageService, SocketClientService } from '@poalim/client-data-access';
import { ChatMessage, User } from '@poalim/shared-interfaces';

const mergeUniqueById = (prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const mergedMap = [...prev, ...incoming].reduce((acc, m) => {
    if (m?.id) acc.set(m.id, m);
    return acc;
  }, new Map<string, ChatMessage>());

  return Array.from(mergedMap.values()).sort((a, b) => a.timestamp - b.timestamp);
};

@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly storage = inject(LocalStorageService);
  private readonly socket = inject(SocketClientService);

  private readonly storedUsername =
    this.storage.getString(AppConfig.STORAGE_KEYS.USERNAME) ?? '';

  readonly username = signal<string>(this.storedUsername);
  readonly messages = signal<ChatMessage[]>([]);

  readonly connectionState = computed(() => this.socket.connectionState());
  readonly botTyping = computed(() => this.socket.botTyping());

  readonly hasNickname = computed(() => this.username().trim().length >= AppConfig.MIN_USERNAME_LENGTH);

  readonly me = computed<User>(() => ({
    id: this.username().trim() || ChatUi.USER.DEFAULT_ID,
    username: this.username().trim(),
    isBot: false,
    color: ChatUi.USER.DEFAULT_COLOR,
  }));

  readonly bot = computed<User>(() => ({
    id: ChatUi.BOT.ID,
    username: AppConfig.BOT_NAME,
    isBot: true,
    color: ChatUi.BOT.DEFAULT_COLOR,
  }));

  constructor() {
    // connect automatically when nickname is valid (also after refresh)
    effect(() => {
      if (!this.hasNickname()) return;

      const state = this.socket.connectionState();
      if (state === 'connected' || state === 'connecting') return;

      this.socket.connect(this.me());
    });

    // full room history (important for new tabs)
    effect(() => {
      const historyPayload = this.socket.roomHistory();
      if (!historyPayload) return;

      const next = mergeUniqueById(this.messages(), historyPayload.messages ?? []);
      this.messages.set(next);

      this.socket.roomHistory.set(null);
    });

    // single incoming message
    effect(() => {
      const incoming = this.socket.lastIncomingMessage();
      if (!incoming) return;

      const next = mergeUniqueById(this.messages(), [incoming]);
      this.messages.set(next);

      this.socket.lastIncomingMessage.set(null);
    });
  }

  submitNickname(nickname: string): void {
    const clean = nickname.trim();
    if (clean.length < AppConfig.MIN_USERNAME_LENGTH) return;

    this.storage.setString(AppConfig.STORAGE_KEYS.USERNAME, clean);
    this.username.set(clean);
    // connection happens via effect
  }

  send(content: string): void {
    if (!this.hasNickname()) return;

    const clean = content.trim();
    if (!clean) return;

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: this.me(),
      content: clean,
      timestamp: Date.now(),
      type: 'text',
    };

    // optimistic UI, but dedupe will prevent double rendering when server echoes it back
    this.messages.set(mergeUniqueById(this.messages(), [msg]));
    this.socket.sendMessage(msg);
  }
}
