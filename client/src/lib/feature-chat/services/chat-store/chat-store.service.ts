import {
  Injectable,
  Injector,
  Signal,
  WritableSignal,
  computed,
  effect,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { AppConfig, ChatUi, UI_TEXT } from '@poalim/constants';
import {
  LocalStorageService,
  SocketClientService,
} from '@poalim/client-data-access';
import {
  ChatMessage,
  ConnectionState,
  ReactionKey,
  RoomHistoryPayload,
  SocketEvent,
  User,
  emptySocketEvent,
  isSocketEventValue,
} from '@poalim/shared-interfaces';

@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly localStorageService: LocalStorageService =
    inject(LocalStorageService);

  private readonly socket: SocketClientService = inject(SocketClientService);
  private readonly injector: Injector = inject(Injector);

  private initialized: boolean = false;

  // Persisted nickname (source of truth for "me")
  readonly username: WritableSignal<string> = signal<string>(
    this.localStorageService.getString(AppConfig.STORAGE_KEYS.USERNAME) ?? ''
  );

  // UI message list (always kept sorted by timestamp)
  readonly messages: WritableSignal<ChatMessage[]> = signal<ChatMessage[]>([]);

  // Socket-derived state (read-only to the UI)
  readonly botTyping: Signal<boolean> = computed(() => this.socket.botTyping());

  readonly connectionState: Signal<ConnectionState> = computed(() =>
    this.socket.connectionState()
  );

  // Derived state: do we have a valid nickname?
  readonly hasNickname: Signal<boolean> = computed(() => {
    const name: string = this.username().trim();
    return name.length >= AppConfig.MIN_USERNAME_LENGTH;
  });

  // Current user snapshot (computed from the nickname)
  readonly me: Signal<User> = computed<User>(() => {
    const name: string = this.username().trim();

    return {
      id: name || ChatUi.USER.DEFAULT_ID,
      username: name,
      isBot: false,
      color: ChatUi.USER.DEFAULT_COLOR,
    };
  });

  // Bot identity (stable)
  readonly bot: Signal<User> = computed<User>(() => ({
    id: ChatUi.BOT.ID,
    username: AppConfig.BOT_NAME,
    isBot: true,
    color: ChatUi.BOT.DEFAULT_COLOR,
  }));

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // If we already have a nickname (from storage), connect immediately.
    if (this.hasNickname()) {
      this.socket.connect(this.me(), AppConfig.ROOM_ID);
    }

    // Effects must run inside an injection context.
    runInInjectionContext(this.injector, () => {
      effect(() => {
        const evt: SocketEvent<RoomHistoryPayload> = this.socket.roomHistory();
        if (!isSocketEventValue<RoomHistoryPayload>(evt)) return;

        const payload: RoomHistoryPayload = evt.value;

        // De-dupe by id and keep the UI stable.
        const unique: ChatMessage[] = [];
        const seen: Set<string> = new Set<string>();

        for (const message of payload.messages ?? []) {
          if (!message?.id) continue;
          if (seen.has(message.id)) continue;

          seen.add(message.id);
          unique.push(message);
        }

        this.messages.set(this.sortByTimestamp(unique));

        // Consume the one-time payload (no nulls).
        this.socket.roomHistory.set(emptySocketEvent<RoomHistoryPayload>());
      });

      effect(() => {
        const evt: SocketEvent<ChatMessage> = this.socket.newMessage();
        if (!isSocketEventValue<ChatMessage>(evt)) return;

        const msg: ChatMessage = evt.value;

        this.messages.update((prev: ChatMessage[]) => {
          if (!msg.id) return prev;
          if (prev.some((x) => x.id === msg.id)) return prev;

          return this.sortByTimestamp([...prev, msg]);
        });

        this.socket.newMessage.set(emptySocketEvent<ChatMessage>());
      });

      effect(() => {
        const evt: SocketEvent<ChatMessage> = this.socket.messageUpdated();
        if (!isSocketEventValue<ChatMessage>(evt)) return;

        const updated: ChatMessage = evt.value;

        this.messages.update((prev: ChatMessage[]) => {
          const idx: number = prev.findIndex((m) => m.id === updated.id);
          if (idx < 0) return prev;

          const next: ChatMessage[] = [...prev];
          next[idx] = updated;

          return this.sortByTimestamp(next);
        });

        this.socket.messageUpdated.set(emptySocketEvent<ChatMessage>());
      });
    });
  }

  submitNickname(nickname: string): void {
    const clean: string = nickname.trim();
    if (clean.length < AppConfig.MIN_USERNAME_LENGTH) return;

    this.localStorageService.setString(AppConfig.STORAGE_KEYS.USERNAME, clean);
    this.username.set(clean);

    // Connect with the freshly updated identity.
    this.socket.connect(this.me(), AppConfig.ROOM_ID);

    // If this is a fresh room, add a friendly bot greeting.
    if (this.messages().length === 0) {
      this.enqueueBotGreeting();
    }
  }

  logout(): void {
    this.socket.disconnect();
    this.localStorageService.remove(AppConfig.STORAGE_KEYS.USERNAME);

    // Reset UI state
    this.username.set('');
    this.messages.set([]);
  }

  send(content: string): void {
    if (!this.hasNickname()) return;

    const clean: string = content.trim();
    if (!clean) return;

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: this.me(),
      content: clean,
      timestamp: Date.now(),
      type: 'text',
    };

    // Optimistic append (kept sorted for safety).
    this.messages.update((prev: ChatMessage[]) =>
      this.sortByTimestamp([...prev, msg])
    );

    // Let the server broadcast it to everyone (and persist it).
    this.socket.sendMessage(msg, AppConfig.ROOM_ID);
  }

  editMessage(messageId: string, content: string): void {
    const clean: string = content.trim();
    if (!clean) return;

    // Optimistic update: keeps the UI snappy.
    this.messages.update((prev: ChatMessage[]) => {
      const idx: number = prev.findIndex((m) => m.id === messageId);
      if (idx < 0) return prev;

      const target: ChatMessage = prev[idx];
      if (target.sender.isBot) return prev;
      if (target.sender.id !== this.me().id) return prev;
      if (target.content.trim() === clean) return prev;

      const now: number = Date.now();
      const edits = [...(target.edits ?? [])];

      edits.push({ previousContent: target.content, editedAt: now });

      const updated: ChatMessage = {
        ...target,
        content: clean,
        editedAt: now,
        edits,
      };

      const next: ChatMessage[] = [...prev];
      next[idx] = updated;

      return next;
    });

    this.socket.editMessage(messageId, clean, AppConfig.ROOM_ID);
  }

  toggleReaction(messageId: string, reaction: ReactionKey): void {
    const meId: string = this.me().id;
    if (!meId) return;

    // Optimistic update: toggles immediately while the server persists/broadcasts.
    this.messages.update((prev: ChatMessage[]) => {
      const idx: number = prev.findIndex((m) => m.id === messageId);
      if (idx < 0) return prev;

      const target: ChatMessage = prev[idx];
      const reactions = { ...(target.reactions ?? {}) };

      const list = [...(reactions[reaction] ?? [])];
      const i: number = list.indexOf(meId);

      if (i >= 0) list.splice(i, 1);
      else list.push(meId);

      if (list.length === 0) delete reactions[reaction];
      else reactions[reaction] = list;

      const updated: ChatMessage = { ...target, reactions };

      const next: ChatMessage[] = [...prev];
      next[idx] = updated;

      return next;
    });

    this.socket.toggleReaction(messageId, reaction, AppConfig.ROOM_ID);
  }

  private enqueueBotGreeting(): void {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: this.bot(),
      content: UI_TEXT.BOT.DEFAULT_GREETING,
      timestamp: Date.now(),
      type: 'system',
    };

    window.setTimeout(() => {
      this.messages.update((prev: ChatMessage[]) =>
        this.sortByTimestamp([...prev, msg])
      );
    }, AppConfig.BOT_DELAY_MS);
  }

  private sortByTimestamp(list: ChatMessage[]): ChatMessage[] {
    return [...list].sort((a, b) => a.timestamp - b.timestamp);
  }
}
