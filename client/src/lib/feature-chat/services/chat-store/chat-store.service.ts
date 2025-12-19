import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AppConfig, ChatUi, UIText } from '@poalim/constants';
import { LocalStorageService, SocketClientService } from '@poalim/client-data-access';
import { ChatMessage, User } from '@poalim/shared-interfaces';

@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly storage = inject(LocalStorageService);
  private readonly socket = inject(SocketClientService);

  private readonly storedUsername = this.storage.getString(AppConfig.STORAGE_KEYS.USERNAME) ?? '';

  readonly username = signal<string>(this.storedUsername);
  readonly messages = signal<ChatMessage[]>([]);

  readonly botTyping = computed(() => this.socket.botTyping());
  readonly connectionState = computed(() => this.socket.connectionState());

  readonly hasNickname = computed(() => {
    const name = this.username().trim();
    return name.length >= AppConfig.MIN_USERNAME_LENGTH;
  });

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
    if (this.hasNickname()) {
      this.socket.connect(this.me());
    }

    effect(() => {
      const history = this.socket.roomHistory();
      if (!history) return;

      const next = this.mergeUniqueById(this.messages(), history);
      this.messages.set(next);

      this.socket.roomHistory.set(null);
    });

    effect(() => {
      const incoming = this.socket.lastIncomingMessage();
      if (!incoming) return;

      const next = this.mergeUniqueById(this.messages(), [incoming]);
      this.messages.set(next);

      this.socket.lastIncomingMessage.set(null);
    });
  }

  submitNickname(nickname: string): void {
    const clean = nickname.trim();
    if (clean.length < AppConfig.MIN_USERNAME_LENGTH) return;

    this.storage.setString(AppConfig.STORAGE_KEYS.USERNAME, clean);
    this.username.set(clean);

    this.socket.connect(this.me());

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

    this.messages.set(this.mergeUniqueById(this.messages(), [msg]));
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
      this.messages.set(this.mergeUniqueById(this.messages(), [msg]));
    }, AppConfig.BOT_DELAY_MS);
  }

  private mergeUniqueById(base: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
    const validIncoming = incoming.filter((m: ChatMessage) => !!m?.id);

    const map = [...base, ...validIncoming].reduce((acc, m) => {
      acc.set(m.id, m);
      return acc;
    }, new Map<string, ChatMessage>());

    return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
  }
}
