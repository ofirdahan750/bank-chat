/* FILE: client/src/lib/feature-chat/services/chat-store/chat-store.service.spec.ts */

import { TestBed } from '@angular/core/testing';
import { Injector, WritableSignal, signal } from '@angular/core';
import { AppConfig, ChatUi, UI_TEXT } from '@poalim/constants';
import {
  ChatMessage,
  ConnectionState,
  ReactionKey,
  RoomHistoryPayload,
  SocketEvent,
  User,
  emptySocketEvent,
  socketEvent,
} from '@poalim/shared-interfaces';

import { ChatStore } from './chat-store.service';
import {
  LocalStorageService,
  SocketClientService,
} from '@poalim/client-data-access';

type Uuid = `${string}-${string}-${string}-${string}-${string}`;

class LocalStorageServiceStub {
  private readonly values = new Map<string, string>();

  readonly getString: jest.Mock<string | null, [string]> = jest.fn(
    (key: string) => (this.values.has(key) ? this.values.get(key) ?? '' : null)
  );

  readonly setString: jest.Mock<boolean, [string, string]> = jest.fn(
    (key: string, value: string) => {
      this.values.set(key, value);
      return true;
    }
  );

  readonly remove: jest.Mock<void, [string]> = jest.fn((key: string) => {
    this.values.delete(key);
  });

  seed(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class SocketClientServiceStub {
  readonly connectionState: WritableSignal<ConnectionState> =
    signal<ConnectionState>('disconnected');

  readonly botTyping: WritableSignal<boolean> = signal<boolean>(false);

  readonly roomHistory: WritableSignal<SocketEvent<RoomHistoryPayload>> =
    signal<SocketEvent<RoomHistoryPayload>>(
      emptySocketEvent<RoomHistoryPayload>()
    );

  readonly newMessage: WritableSignal<SocketEvent<ChatMessage>> = signal<
    SocketEvent<ChatMessage>
  >(emptySocketEvent<ChatMessage>());

  readonly messageUpdated: WritableSignal<SocketEvent<ChatMessage>> = signal<
    SocketEvent<ChatMessage>
  >(emptySocketEvent<ChatMessage>());

  readonly connect: jest.Mock<void, [User, string]> = jest.fn(
    (_me: User, _roomId: string) => undefined
  );

  readonly disconnect: jest.Mock<void, []> = jest.fn(() => undefined);

  readonly sendMessage: jest.Mock<void, [ChatMessage, string]> = jest.fn(
    (_message: ChatMessage, _roomId: string) => undefined
  );

  readonly editMessage: jest.Mock<void, [string, string, string]> = jest.fn(
    (_id: string, _content: string, _roomId: string) => undefined
  );

  readonly toggleReaction: jest.Mock<void, [string, ReactionKey, string]> =
    jest.fn(
      (_id: string, _reaction: ReactionKey, _roomId: string) => undefined
    );
}

const createUser = (id: string, username: string): User => ({
  id,
  username,
  isBot: false,
  color: ChatUi.USER.DEFAULT_COLOR,
});

const createMsg = (
  id: string,
  sender: User,
  content: string,
  ts: number
): ChatMessage => ({
  id,
  sender,
  content,
  timestamp: ts,
  type: sender.isBot ? 'system' : 'text',
});

const installCryptoRandomUuidMock = (initial: Uuid): jest.Mock<Uuid, []> => {
  const fn: jest.Mock<Uuid, []> = jest.fn<Uuid, []>(() => initial);

  // Minimal Crypto shim for tests (TypeScript wants the full Crypto shape).
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: fn } as unknown as Crypto,
    configurable: true,
  });

  return fn;
};

const flushSignalEffects = async (): Promise<void> => {
  // Angular signal effects may flush via microtasks; this is the simplest stable "flush"
  // without using the deprecated TestBed.flushEffects().
  await Promise.resolve();
};

const setup = (opts?: { storedUsername?: string; uuid?: Uuid }) => {
  TestBed.resetTestingModule();

  const localStorage = new LocalStorageServiceStub();
  const socket = new SocketClientServiceStub();

  if (opts?.storedUsername) {
    localStorage.seed(AppConfig.STORAGE_KEYS.USERNAME, opts.storedUsername);
  }

  const defaultUuid: Uuid =
    opts?.uuid ?? '00000000-0000-0000-0000-000000000001';
  const uuidMock = installCryptoRandomUuidMock(defaultUuid);

  TestBed.configureTestingModule({
    providers: [
      ChatStore,
      { provide: LocalStorageService, useValue: localStorage },
      { provide: SocketClientService, useValue: socket },
      Injector,
    ],
  });

  const store = TestBed.inject(ChatStore);

  return { store, localStorage, socket, uuidMock };
};

describe('ChatStore', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('should create', () => {
    jest.useFakeTimers();

    const { store } = setup();
    expect(store).toBeTruthy();
  });

  it('init() should run only once', () => {
    jest.useFakeTimers();

    const { store, socket } = setup();

    store.init();
    store.init();

    expect(socket.connect).toHaveBeenCalledTimes(0); // no nickname by default
  });

  it('init() should auto-connect if username from storage is valid', () => {
    jest.useFakeTimers();

    const { store, socket } = setup({ storedUsername: 'Ofir' });

    store.init();

    expect(socket.connect).toHaveBeenCalledTimes(1);
    const args = socket.connect.mock.calls[0];
    expect(args?.[0].username).toBe('Ofir');
    expect(args?.[1]).toBe(AppConfig.ROOM_ID);
  });

  it('submitNickname() should persist, set username, and connect', () => {
    jest.useFakeTimers();

    const { store, localStorage, socket } = setup();

    store.init();
    store.submitNickname('  Ofir  ');

    expect(localStorage.setString).toHaveBeenCalledWith(
      AppConfig.STORAGE_KEYS.USERNAME,
      'Ofir'
    );

    expect(store.username()).toBe('Ofir');
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('submitNickname() should enqueue bot greeting when room is empty', () => {
    jest.useFakeTimers();

    const { store } = setup();

    store.init();
    store.submitNickname('Ofir');

    // greeting is delayed
    expect(store.messages().length).toBe(0);

    jest.advanceTimersByTime(AppConfig.BOT_DELAY_MS);

    expect(store.messages().length).toBe(1);
    expect(store.messages()[0]?.content).toBe(UI_TEXT.BOT.DEFAULT_GREETING);
    expect(store.messages()[0]?.sender.isBot).toBe(true);
  });

  it('logout() should disconnect, clear storage, and reset state', () => {
    jest.useFakeTimers();

    const { store, localStorage, socket } = setup();

    store.init();
    store.submitNickname('Ofir');

    store.logout();

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(localStorage.remove).toHaveBeenCalledWith(
      AppConfig.STORAGE_KEYS.USERNAME
    );

    expect(store.username()).toBe('');
    expect(store.messages()).toEqual([]);
  });

  it('send() should optimistically add message (sorted) and call socket.sendMessage()', () => {
    jest.useFakeTimers();

    const { store, socket, uuidMock } = setup();

    store.init();
    store.submitNickname('Ofir');

    const uuid: Uuid = '00000000-0000-0000-0000-000000000002';
    uuidMock.mockReturnValue(uuid);

    jest.spyOn(Date, 'now').mockReturnValue(1000);

    store.send('  hello  ');

    const list = store.messages();
    expect(list.length).toBe(1);
    expect(list[0]?.id).toBe(uuid);
    expect(list[0]?.content).toBe('hello');

    expect(socket.sendMessage).toHaveBeenCalledTimes(1);
    const payload = socket.sendMessage.mock.calls[0]?.[0];
    expect(payload.id).toBe(uuid);
    expect(payload.content).toBe('hello');
  });

  it('send() should do nothing if hasNickname() is false', () => {
    jest.useFakeTimers();

    const { store, socket } = setup();

    store.init();
    store.send('hello');

    expect(store.messages().length).toBe(0);
    expect(socket.sendMessage).not.toHaveBeenCalled();
  });

  it('editMessage() should optimistically update my message and call socket.editMessage()', () => {
    jest.useFakeTimers();

    const { store, socket } = setup();

    store.init();
    store.submitNickname('Ofir');

    const me = store.me();

    // seed messages
    store.messages.set([
      createMsg('m1', me, 'hello', 1),
      createMsg('m2', me, 'world', 2),
    ]);

    jest.spyOn(Date, 'now').mockReturnValue(999);

    store.editMessage('m1', '  HELLO  ');

    const updated = store.messages().find((m) => m.id === 'm1')!;
    expect(updated.content).toBe('HELLO');
    expect(updated.editedAt).toBe(999);
    expect(updated.edits?.length).toBe(1);
    expect(updated.edits?.[0]?.previousContent).toBe('hello');

    expect(socket.editMessage).toHaveBeenCalledWith(
      'm1',
      'HELLO',
      AppConfig.ROOM_ID
    );
  });

  it('editMessage() should not change messages when message is not mine', () => {
    jest.useFakeTimers();

    const { store, socket } = setup();

    store.init();
    store.submitNickname('Ofir');

    const other = createUser('u2', 'someone');

    store.messages.set([createMsg('m1', other, 'hello', 1)]);

    store.editMessage('m1', 'new');

    expect(store.messages()[0]?.content).toBe('hello');

    // store always sends the request; server will validate permissions.
    expect(socket.editMessage).toHaveBeenCalledWith(
      'm1',
      'new',
      AppConfig.ROOM_ID
    );
  });

  it('toggleReaction() should optimistically toggle and call socket.toggleReaction()', () => {
    jest.useFakeTimers();

    const { store, socket } = setup();

    store.init();
    store.submitNickname('Ofir');

    const me = store.me();

    store.messages.set([createMsg('m1', me, 'hello', 1)]);

    const reaction: ReactionKey = 'like';

    store.toggleReaction('m1', reaction);

    const updated1 = store.messages()[0]!;
    expect(updated1.reactions?.[reaction]).toEqual([me.id]);
    expect(socket.toggleReaction).toHaveBeenCalledWith(
      'm1',
      reaction,
      AppConfig.ROOM_ID
    );

    store.toggleReaction('m1', reaction);

    const updated2 = store.messages()[0]!;
    expect(updated2.reactions?.[reaction]).toBeUndefined(); // removed when empty
  });

  it('init() should consume roomHistory SocketEvent, de-dupe by id, sort, then reset event', async () => {
    jest.useFakeTimers();

    const { store, socket } = setup();

    store.init();

    const me = createUser('u1', 'x');

    const m1 = createMsg('a', me, '1', 200);
    const m2 = createMsg('b', me, '2', 100);
    const m2dup = createMsg('b', me, '2dup', 999);

    socket.roomHistory.set(
      socketEvent<RoomHistoryPayload>({
        roomId: AppConfig.ROOM_ID,
        messages: [m1, m2, m2dup],
      })
    );

    await flushSignalEffects();

    const list = store.messages();
    expect(list.map((m) => m.id)).toEqual(['b', 'a']); // sorted by timestamp asc
    expect(list.find((m) => m.id === 'b')?.content).toBe('2'); // first wins

    expect(socket.roomHistory().kind).toBe('empty');
  });

  it('init() should consume newMessage event once and reset it', async () => {
    jest.useFakeTimers();

    const { store, socket } = setup();

    store.init();

    const me = createUser('u1', 'x');
    const msg = createMsg('m1', me, 'hello', 1);

    socket.newMessage.set(socketEvent<ChatMessage>(msg));
    await flushSignalEffects();

    expect(store.messages().map((m) => m.id)).toEqual(['m1']);
    expect(socket.newMessage().kind).toBe('empty');

    // send same again -> should not duplicate
    socket.newMessage.set(socketEvent<ChatMessage>(msg));
    await flushSignalEffects();

    expect(store.messages().map((m) => m.id)).toEqual(['m1']);
  });

  it('init() should consume messageUpdated event and replace existing message, then reset it', async () => {
    jest.useFakeTimers();

    const { store, socket } = setup();

    store.init();

    const me = createUser('u1', 'x');
    store.messages.set([
      createMsg('m1', me, 'old', 1),
      createMsg('m2', me, 'keep', 2),
    ]);

    const updated = createMsg('m1', me, 'NEW', 1);
    socket.messageUpdated.set(socketEvent<ChatMessage>(updated));

    await flushSignalEffects();

    expect(store.messages().find((m) => m.id === 'm1')?.content).toBe('NEW');
    expect(socket.messageUpdated().kind).toBe('empty');
  });
});
