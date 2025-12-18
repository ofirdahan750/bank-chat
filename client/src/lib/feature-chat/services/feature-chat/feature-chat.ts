import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AppConfig, ChatUi, UIText } from '@poalim/constants';
import { LocalStorageService, SocketClientService } from '@poalim/client-data-access';
import { ChatMessage, User } from '@poalim/shared-interfaces';

@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly storage = inject(LocalStorageService);
  private readonly socket = inject(SocketClientService);

  // Persisted nickname
  private readonly storedUsername =
    this.storage.getString(AppConfig.STORAGE_KEYS.USERNAME) ?? '';

  // State (signals)
  readonly username = signal<string>(this.storedUsername);
  readonly messages = signal<ChatMessage[]>([]);
  readonly botTyping = computed(() => this.socket.botTyping());
  readonly connectionState = computed(() => this.socket.connectionState());

  // Derived flags
  readonly hasNickname = computed(() => {
    const name = this.username().trim();
    return name.length >= AppConfig.MIN_USERNAME_LENGTH;
  });

  // Identities
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
    // When we already have nickname (refresh), connect immediately
    if (this.hasNickname()) {
      this.socket.connect(this.me());
    }

    // Push incoming socket messages into our messages list
    effect(() => {
      const incoming = this.socket.lastIncomingMessage();
      if (!incoming) return;

      this.messages.update((prev) => [...prev, incoming]);

      // Reset so we don't re-append on next change detection
      this.socket.lastIncomingMessage.set(null);
    });
  }

  submitNickname(nickname: string): void {
    const clean = nickname.trim();
    if (clean.length < AppConfig.MIN_USERNAME_LENGTH) return;

    this.storage.setString(AppConfig.STORAGE_KEYS.USERNAME, clean);
    this.username.set(clean);

    // Connect once we have a valid nickname
    this.socket.connect(this.me());

    // First entry: local greeting until server-bot is wired
    if (this.messages().length === 0) {
      this.enqueueBotGreeting();
    }
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

    // Optimistic UI: show instantly
    this.messages.update((prev) => [...prev, msg]);

    // Sync to server
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
