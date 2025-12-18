import { Injectable, computed, inject, signal } from '@angular/core';
import { AppConfig, ChatUi } from '@poalim/constants';
import { LocalStorageService, SocketClientService } from '@poalim/client-data-access';
import { ChatMessage, RoomHistoryPayload, User } from '@poalim/shared-interfaces';

@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly storage = inject(LocalStorageService);
  private readonly socket = inject(SocketClientService);

  private readonly roomId = 'main';

  readonly username = signal<string>(
    this.storage.getString(AppConfig.STORAGE_KEYS.USERNAME) ?? ''
  );

  readonly messages = signal<ChatMessage[]>([]);
  readonly botTyping = computed(() => this.socket.botTyping());
  readonly connectionState = computed(() => this.socket.connectionState());

  readonly hasNickname = computed(() => this.username().trim().length >= AppConfig.MIN_USERNAME_LENGTH);

  readonly me = computed<User>(() => {
    const name = this.username().trim();
    return {
      id: name || ChatUi.USER.DEFAULT_ID,
      username: name,
      isBot: false,
      color: ChatUi.USER.DEFAULT_COLOR,
    };
  });

  readonly bot = computed<User>(() => ({
    id: ChatUi.BOT.ID,
    username: AppConfig.BOT_NAME,
    isBot: true,
    color: ChatUi.BOT.DEFAULT_COLOR,
  }));

  constructor() {
    this.socket.onRoomHistory((payload: RoomHistoryPayload) => {
      if (payload.roomId !== this.roomId) return;
      const next = (payload.messages ?? []).filter((m: ChatMessage) => !!m?.id);
      this.messages.set(next);
    });

    this.socket.onNewMessage((msg: ChatMessage) => {
      if (!msg?.id) return;
      this.messages.update((prev: ChatMessage[]) =>
        prev.some((x: ChatMessage) => x.id === msg.id) ? prev : [...prev, msg]
      );
    });

    if (this.hasNickname()) {
      this.socket.connect(this.me(), this.roomId);
    }
  }

  submitNickname(nickname: string): void {
    const clean = nickname.trim();
    if (clean.length < AppConfig.MIN_USERNAME_LENGTH) return;

    this.storage.setString(AppConfig.STORAGE_KEYS.USERNAME, clean);
    this.username.set(clean);

    this.socket.connect(this.me(), this.roomId);
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

    this.messages.update((prev: ChatMessage[]) =>
      prev.some((x: ChatMessage) => x.id === msg.id) ? prev : [...prev, msg]
    );

    this.socket.sendMessage(msg, this.roomId);
  }

  disconnect(): void {
    this.socket.disconnect();
    this.messages.set([]);
  }
}
