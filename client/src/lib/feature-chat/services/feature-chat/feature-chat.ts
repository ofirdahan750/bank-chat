import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AppConfig, ChatUi, UIText } from '@poalim/constants';
import {
  LocalStorageService,
  SocketClientService,
} from '@poalim/client-data-access';
import type {
  ChatMessage,
  RoomHistoryPayload,
  User,
} from '@poalim/shared-interfaces';

const DEFAULT_ROOM_ID = 'main';

@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly storage = inject(LocalStorageService);
  private readonly socket = inject(SocketClientService);

  private readonly storedUsername =
    this.storage.getString(AppConfig.STORAGE_KEYS.USERNAME) ?? '';

  readonly username = signal<string>(this.storedUsername);
  readonly messages = signal<ChatMessage[]>([]);

  readonly botTyping = computed<boolean>(() => this.socket.botTyping());
  readonly connectionState = computed(() => this.socket.connectionState());

  readonly hasNickname = computed<boolean>(() => {
    const name = this.username().trim();
    return name.length >= AppConfig.MIN_USERNAME_LENGTH;
  });

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
    // Auto-connect when nickname exists
    effect(() => {
      if (!this.hasNickname()) return;
      this.socket.connect(this.me(), DEFAULT_ROOM_ID);
    });

    // Apply room history in one shot (new tab gets all messages)
    effect(() => {
      const historyPayload: RoomHistoryPayload | null =
        this.socket.roomHistory();
      if (!historyPayload) return;

      const incoming = (historyPayload.messages ?? []).filter(
        (m: ChatMessage | null | undefined): m is ChatMessage =>
          !!m && typeof m.id === 'string'
      );

      const merged = this.mergeById(this.messages(), incoming);
      this.messages.set(merged);

      this.socket.clearRoomHistory();
    });

    // Apply live incoming messages (dedupe by id)
    effect(() => {
      const incoming: ChatMessage | null = this.socket.lastIncomingMessage();
      if (!incoming) return;

      this.messages.update((prev: ChatMessage[]) =>
        prev.some((x: ChatMessage) => x.id === incoming.id)
          ? prev
          : [...prev, incoming]
      );

      this.socket.clearLastIncomingMessage();
    });
  }

  submitNickname(nickname: string): void {
    const clean = nickname.trim();
    if (clean.length < AppConfig.MIN_USERNAME_LENGTH) return;

    this.storage.setString(AppConfig.STORAGE_KEYS.USERNAME, clean);
    this.username.set(clean);

    this.socket.connect(this.me(), DEFAULT_ROOM_ID);

    // Optional local greeting (can be removed if you want a "pure" room)
    if (this.messages().length === 0) {
      const greeting: ChatMessage = {
        id: crypto.randomUUID(),
        sender: this.bot(),
        content: UIText.BOT.DEFAULT_GREETING,
        timestamp: Date.now(),
        type: 'system',
      };
      this.messages.set([greeting]);
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

    // Optimistic UI + dedupe will prevent double display when server echoes back
    this.messages.update((prev: ChatMessage[]) => [...prev, msg]);

    this.socket.sendMessage(msg, DEFAULT_ROOM_ID);
  }

  private mergeById(a: ChatMessage[], b: ChatMessage[]): ChatMessage[] {
    const mergedMap = [...a, ...b].reduce(
      (acc: Map<string, ChatMessage>, m: ChatMessage) => {
        if (acc.has(m.id)) return acc;
        acc.set(m.id, m);
        return acc;
      },
      new Map<string, ChatMessage>()
    );

    return Array.from(mergedMap.values()).sort(
      (x: ChatMessage, y: ChatMessage) => x.timestamp - y.timestamp
    );
  }
}
