import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AppConfig, ChatUi, UIText } from '@poalim/constants';
import {
  LocalStorageService,
  SocketClientService,
} from '@poalim/client-data-access';
import { ChatMessage, User } from '@poalim/shared-interfaces';

@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly storage = inject(LocalStorageService);
  private readonly socket = inject(SocketClientService);

  private readonly storedUsername =
    this.storage.getString(AppConfig.STORAGE_KEYS.USERNAME) ?? '';

  readonly username = signal<string>(this.storedUsername);
  readonly messages = signal<ChatMessage[]>([]);

  readonly botTyping = computed(() => this.socket.botTyping());
  readonly connectionState = computed(() => this.socket.connectionState());

  readonly hasNickname = computed(() => {
    const name = this.username().trim();
    return name.length >= AppConfig.MIN_USERNAME_LENGTH;
  });

  readonly me = computed<User>(() => ({
    id: this.storedUsername || ChatUi.USER.DEFAULT_ID,
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
    if (this.hasNickname()) {
      this.socket.connect(this.me());
    }

    effect(() => {
      const incoming = this.socket.lastIncomingMessage();
      if (!incoming) return;

      // Dedupe by id (prevents double render when we do optimistic UI or server echoes)
      this.messages.update((prev) => {
        const exists = prev.some((m) => m.id === incoming.id);
        return exists ? prev : [...prev, incoming];
      });

      // Clear signal so it won't re-append
      this.socket.lastIncomingMessage.set(null);
    });
  }

  submitNickname(rawNickname: string): void {
    const nickname = rawNickname.trim();
    if (nickname.length < AppConfig.MIN_USERNAME_LENGTH) return;

    this.storage.setString(AppConfig.STORAGE_KEYS.USERNAME, nickname);
    this.username.set(nickname);

    // Connect after nickname exists
    this.socket.connect(this.me());

    if (this.messages().length === 0) {
      this.enqueueBotGreeting();
    }
  }

  send(rawContent: string): void {
    if (!this.hasNickname()) return;

    const content = rawContent.trim();
    if (!content) return;

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: this.me(),
      content,
      timestamp: Date.now(),
      type: 'text',
    };

    // Optimistic UI (fast), but protected by dedupe on incoming
    this.messages.update((prev) => [...prev, msg]);

    // Server sync
    this.socket.sendMessage(msg);
  }

  private enqueueBotGreeting(): void {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: this.bot(),
      content: UIText.BOT.DEFAULT_GREETING,
      timestamp: Date.now(),
      type: 'system',
    };

    window.setTimeout(() => {
      this.messages.update((prev) => [...prev, msg]);
    }, AppConfig.BOT_DELAY_MS);
  }
}
