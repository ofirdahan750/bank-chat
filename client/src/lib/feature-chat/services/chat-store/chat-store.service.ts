import {
  Injectable,
  Injector,
  computed,
  effect,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { AppConfig, ChatUi, UIText } from '@poalim/constants';
import {
  LocalStorageService,
  SocketClientService,
} from '@poalim/client-data-access';
import { ChatMessage, ReactionKey, User } from '@poalim/shared-interfaces';

@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly storage = inject(LocalStorageService);
  private readonly socket = inject(SocketClientService);
  private readonly injector = inject(Injector);

  private initialized = false;

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

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    if (this.hasNickname()) {
      this.socket.connect(this.me(), AppConfig.ROOM_ID);
    }

    runInInjectionContext(this.injector, () => {
      effect(() => {
        const payload = this.socket.roomHistory();
        if (!payload) return;

        const unique: ChatMessage[] = [];
        const seen = new Set<string>();

        for (const m of payload.messages ?? []) {
          if (!m?.id) continue;
          if (seen.has(m.id)) continue;
          seen.add(m.id);
          unique.push(m);
        }

        unique.sort((a, b) => a.timestamp - b.timestamp);

        this.messages.set(unique);
        this.socket.roomHistory.set(null);
      });

      effect(() => {
        const msg = this.socket.newMessage();
        if (!msg) return;

        this.messages.update((prev: ChatMessage[]) => {
          if (!msg?.id) return prev;
          if (prev.some((x: ChatMessage) => x.id === msg.id)) return prev;
          return [...prev, msg].sort((a, b) => a.timestamp - b.timestamp);
        });

        this.socket.newMessage.set(null);
      });

      effect(() => {
        const updated = this.socket.messageUpdated();
        if (!updated) return;

        this.messages.update((prev: ChatMessage[]) => {
          const idx = prev.findIndex((m: ChatMessage) => m.id === updated.id);
          if (idx < 0) return prev;

          const next = [...prev];
          next[idx] = updated;
          return next.sort((a, b) => a.timestamp - b.timestamp);
        });

        this.socket.messageUpdated.set(null);
      });
    });
  }

  submitNickname(nickname: string): void {
    const clean = nickname.trim();
    if (clean.length < AppConfig.MIN_USERNAME_LENGTH) return;

    this.storage.setString(AppConfig.STORAGE_KEYS.USERNAME, clean);
    this.username.set(clean);

    this.socket.connect(this.me(), AppConfig.ROOM_ID);

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

    this.messages.update((prev: ChatMessage[]) => [...prev, msg]);
    this.socket.sendMessage(msg, AppConfig.ROOM_ID);
  }

  editMessage(messageId: string, content: string): void {
    const clean = content.trim();
    if (!clean) return;

    this.messages.update((prev: ChatMessage[]) => {
      const idx = prev.findIndex((m: ChatMessage) => m.id === messageId);
      if (idx < 0) return prev;

      const target = prev[idx];
      if (target.sender.isBot) return prev;
      if (target.sender.id !== this.me().id) return prev;
      if (target.content.trim() === clean) return prev;

      const now = Date.now();
      const edits = [...(target.edits ?? [])];
      edits.push({ previousContent: target.content, editedAt: now });

      const updated: ChatMessage = {
        ...target,
        content: clean,
        editedAt: now,
        edits,
      };

      const next = [...prev];
      next[idx] = updated;
      return next;
    });

    this.socket.editMessage(messageId, clean, AppConfig.ROOM_ID);
  }

  toggleReaction(messageId: string, reaction: ReactionKey): void {
    const meId = this.me().id;
    if (!meId) return;

    // Optimistic update (server will broadcast MESSAGE_UPDATED anyway)
    this.messages.update((prev: ChatMessage[]) => {
      const idx = prev.findIndex((m: ChatMessage) => m.id === messageId);
      if (idx < 0) return prev;

      const target = prev[idx];
      const reactions = { ...(target.reactions ?? {}) };

      const list = [...(reactions[reaction] ?? [])];
      const i = list.indexOf(meId);

      if (i >= 0) list.splice(i, 1);
      else list.push(meId);

      if (list.length === 0) {
        // remove key
        delete reactions[reaction];
      } else {
        reactions[reaction] = list;
      }

      const updated: ChatMessage = {
        ...target,
        reactions,
      };

      const next = [...prev];
      next[idx] = updated;
      return next;
    });

    this.socket.toggleReaction(messageId, reaction, AppConfig.ROOM_ID);
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
      this.messages.update((prev: ChatMessage[]) => [...prev, msg]);
    }, AppConfig.BOT_DELAY_MS);
  }
}
