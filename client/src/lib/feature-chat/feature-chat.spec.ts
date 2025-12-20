// client/src/lib/feature-chat/services/chat-store/chat-store.service.spec.ts

import { signal } from '@angular/core';
import {
  TestBed,
  fakeAsync,
  flushMicrotasks,
  tick,
} from '@angular/core/testing';
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
  socketEvent,
} from '@poalim/shared-interfaces';
import { ChatStore } from './services/chat-store/chat-store.service';

type Uuid = `${string}-${string}-${string}-${string}-${string}`;

const uuid = (n: number): Uuid =>
  `00000000-0000-0000-0000-${String(n).padStart(12, '0')}` as Uuid;

const installCryptoRandomUuidMock = (initial: Uuid): jest.Mock<Uuid, []> => {
  const fn: jest.Mock<Uuid, []> = jest.fn<Uuid, []>(() => initial);

  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: fn } as unknown as Crypto,
    configurable: true,
  });

  return fn;
};

const flushAllEffects = (): void => {
  // Angular signals/effects: flush scheduler + microtasks (fakeAsync only).
  const tb: any = TestBed;

  if (typeof tb.flushEffects === 'function') tb.flushEffects();
  flushMicrotasks();

  if (typeof tb.flushEffects === 'function') tb.flushEffects();
  flushMicrotasks();
};

class MockLocalStorageService
  implements Pick<LocalStorageService, 'getString' | 'setString' | 'remove'>
{
  getString = jest.fn<string | null, [string]>(() => null);
  setString = jest.fn<boolean, [string, string]>(() => true);
  remove = jest.fn<void, [string]>(() => void 0);
}

class MockSocketClientService
  implements
    Pick<
      SocketClientService,
      | 'connectionState'
      | 'botTyping'
      | 'roomHistory'
      | 'newMessage'
      | 'messageUpdated'
      | 'connect'
      | 'disconnect'
      | 'sendMessage'
      | 'editMessage'
      | 'toggleReaction'
    >
{
  readonly connectionState = signal<ConnectionState>('disconnected');
  readonly botTyping = signal<boolean>(false);

  readonly roomHistory = signal<SocketEvent<RoomHistoryPayload>>(
    emptySocketEvent<RoomHistoryPayload>()
  );

  readonly newMessage = signal<SocketEvent<ChatMessage>>(
    emptySocketEvent<ChatMessage>()
  );

  readonly messageUpdated = signal<SocketEvent<ChatMessage>>(
    emptySocketEvent<ChatMessage>()
  );

  connect = jest.fn<void, [User, string]>(() => void 0);
  disconnect = jest.fn<void, []>(() => void 0);

  sendMessage = jest.fn<void, [ChatMessage, string]>(() => void 0);
  editMessage = jest.fn<void, [string, string, string]>(() => void 0);
  toggleReaction = jest.fn<void, [string, ReactionKey, string]>(() => void 0);
}

const user = (name: string): User => ({
  id: name,
  username: name,
  isBot: false,
  color: ChatUi.USER.DEFAULT_COLOR,
});

const botUser: User = {
  id: ChatUi.BOT.ID,
  username: AppConfig.BOT_NAME,
  isBot: true,
  color: ChatUi.BOT.DEFAULT_COLOR,
};

const msg = (
  id: string,
  sender: User,
  content: string,
  timestamp: number,
  type: 'text' | 'system' = 'text'
): ChatMessage => ({
  id,
  sender,
  content,
  timestamp,
  type,
});

const setup = (storedUsername: string | null = null) => {
  TestBed.resetTestingModule();

  installCryptoRandomUuidMock(uuid(1));

  const storage = new MockLocalStorageService();
  storage.getString.mockImplementation((key: string) => {
    if (key === AppConfig.STORAGE_KEYS.USERNAME) return storedUsername;
    return null;
  });

  const socket = new MockSocketClientService();

  TestBed.configureTestingModule({
    providers: [
      ChatStore,
      { provide: LocalStorageService, useValue: storage },
      { provide: SocketClientService, useValue: socket },
    ],
  });

  const store = TestBed.inject(ChatStore);
  return { store, socket, storage };
};

describe('ChatStore', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  it('should create', () => {
    const { store } = setup();
    expect(store).toBeTruthy();
  });

  it('init() should run only once', () => {
    const { store, socket } = setup();
    store.init();
    store.init();
    expect(socket.connect).toHaveBeenCalledTimes(0);
  });

  it('init() should auto-connect if username from storage is valid', () => {
    const { store, socket } = setup('Ofir');
    store.init();

    expect(socket.connect).toHaveBeenCalledTimes(1);
    const args = socket.connect.mock.calls[0];
    expect(args?.[0].username).toBe('Ofir');
    expect(args?.[1]).toBe(AppConfig.ROOM_ID);
  });

  it('submitNickname() should persist, set username, and connect', () => {
    const { store, socket, storage } = setup(null);

    // prevent greeting branch
    store.messages.set([msg(uuid(999), botUser, 'hi', 1, 'system')]);

    store.submitNickname('  Ofir  ');

    expect(storage.setString).toHaveBeenCalledWith(
      AppConfig.STORAGE_KEYS.USERNAME,
      'Ofir'
    );

    expect(store.username()).toBe('Ofir');

    expect(socket.connect).toHaveBeenCalledTimes(1);
    const args = socket.connect.mock.calls[0];
    expect(args?.[0].id).toBe('Ofir');
    expect(args?.[0].username).toBe('Ofir');
    expect(args?.[1]).toBe(AppConfig.ROOM_ID);
  });

  it('submitNickname() should enqueue bot greeting when room is empty', fakeAsync(() => {
    const { store } = setup(null);

    jest.spyOn(Date, 'now').mockReturnValue(12345);

    store.submitNickname('Ofir');

    expect(store.messages().length).toBe(0);

    tick(AppConfig.BOT_DELAY_MS);

    const list = store.messages();
    expect(list.length).toBe(1);
    expect(list[0]?.sender.isBot).toBe(true);
    expect(list[0]?.type).toBe('system');
    expect(list[0]?.content).toBe(UI_TEXT.BOT.DEFAULT_GREETING);
  }));

  it('logout() should disconnect, clear storage, and reset state', () => {
    const { store, socket, storage } = setup(null);

    store.username.set('Ofir');
    store.messages.set([msg(uuid(1), user('Ofir'), 'x', 1)]);

    store.logout();

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(
      AppConfig.STORAGE_KEYS.USERNAME
    );

    expect(store.username()).toBe('');
    expect(store.messages()).toEqual([]);
  });

  it('send() should optimistically add message (sorted) and call socket.sendMessage()', () => {
    const { store, socket } = setup(null);

    store.username.set('Ofir');

    store.messages.set([msg(uuid(10), user('Ofir'), 'later', 200)]);

    jest.spyOn(Date, 'now').mockReturnValue(100);

    store.send('  hello  ');

    const list = store.messages();
    expect(list.map((m) => m.content)).toEqual(['hello', 'later']);

    expect(socket.sendMessage).toHaveBeenCalledTimes(1);
    const args = socket.sendMessage.mock.calls[0];
    expect(args?.[0].content).toBe('hello');
    expect(args?.[1]).toBe(AppConfig.ROOM_ID);
  });

  it('send() should do nothing if hasNickname() is false', () => {
    const { store, socket } = setup(null);

    store.send('hello');

    expect(store.messages()).toEqual([]);
    expect(socket.sendMessage).toHaveBeenCalledTimes(0);
  });

  it('editMessage() should optimistically update my message and call socket.editMessage()', () => {
    const { store, socket } = setup(null);

    store.username.set('Ofir');

    const mine = msg(uuid(1), user('Ofir'), 'old', 10);
    const other = msg(uuid(2), user('Dana'), 'yo', 11);

    store.messages.set([other, mine]);

    jest.spyOn(Date, 'now').mockReturnValue(999);

    store.editMessage(mine.id, '  NEW  ');

    const updated = store.messages().find((m) => m.id === mine.id);
    expect(updated?.content).toBe('NEW');
    expect(updated?.editedAt).toBe(999);
    expect(updated?.edits?.length).toBe(1);
    expect(updated?.edits?.[0]?.previousContent).toBe('old');
    expect(updated?.edits?.[0]?.editedAt).toBe(999);

    expect(socket.editMessage).toHaveBeenCalledTimes(1);
    expect(socket.editMessage).toHaveBeenCalledWith(
      mine.id,
      'NEW',
      AppConfig.ROOM_ID
    );
  });

  it('editMessage() should not change messages when message is not mine', () => {
    const { store, socket } = setup(null);

    store.username.set('Ofir');

    const notMine = msg(uuid(1), user('Dana'), 'old', 10);
    store.messages.set([notMine]);

    store.editMessage(notMine.id, 'NEW');

    expect(store.messages()[0]?.content).toBe('old');

    expect(socket.editMessage).toHaveBeenCalledTimes(1);
    expect(socket.editMessage).toHaveBeenCalledWith(
      notMine.id,
      'NEW',
      AppConfig.ROOM_ID
    );
  });
  it('toggleReaction() should optimistically toggle and call socket.toggleReaction()', () => {
    const { store, socket } = setup(null);

    store.username.set('Ofir');

    const m1: ChatMessage = {
      ...msg(uuid(1), user('Dana'), 'hey', 10),
      reactions: {},
    };

    store.messages.set([m1]);

    store.toggleReaction(m1.id, 'like');

    const afterAdd = store.messages().find((m) => m.id === m1.id);
    expect(afterAdd?.reactions?.like).toEqual(['Ofir']);
    expect(socket.toggleReaction).toHaveBeenCalledWith(
      m1.id,
      'like',
      AppConfig.ROOM_ID
    );

    store.toggleReaction(m1.id, 'like');

    const afterRemove = store.messages().find((m) => m.id === m1.id);
    expect(afterRemove?.reactions?.like).toBeUndefined();
    expect(socket.toggleReaction).toHaveBeenCalledTimes(2);
  });

  it('init() should consume roomHistory SocketEvent, de-dupe by id, sort, then reset event', fakeAsync(() => {
    const { store, socket } = setup(null);

    store.init();
    flushAllEffects();

    const payload: RoomHistoryPayload = {
      roomId: AppConfig.ROOM_ID,
      messages: [
        msg('b', user('Dana'), '2', 1),
        msg('a', user('Dana'), '1', 2),
        msg('b', user('Dana'), '2-dup', 3), // should be ignored (first wins)
      ],
    };

    socket.roomHistory.set(socketEvent<RoomHistoryPayload>(payload));

    flushAllEffects();

    const list = store.messages();
    expect(list.map((m) => m.id)).toEqual(['b', 'a']);
    expect(list.find((m) => m.id === 'b')?.content).toBe('2');

    expect(isSocketEventValue(socket.roomHistory())).toBe(false);
    expect(socket.roomHistory().kind).toBe('empty');
  }));

  it('init() should consume newMessage event once and reset it', fakeAsync(() => {
    const { store, socket } = setup(null);

    store.init();
    flushAllEffects();

    const m1 = msg('m1', user('Dana'), 'x', 10);
    socket.newMessage.set(socketEvent<ChatMessage>(m1));

    flushAllEffects();

    expect(store.messages().map((m) => m.id)).toEqual(['m1']);
    expect(socket.newMessage().kind).toBe('empty');

    // send same again -> should not duplicate
    socket.newMessage.set(socketEvent<ChatMessage>(m1));

    flushAllEffects();

    expect(store.messages().map((m) => m.id)).toEqual(['m1']);
    expect(socket.newMessage().kind).toBe('empty');
  }));

  it('init() should consume messageUpdated event and replace existing message, then reset it', fakeAsync(() => {
    const { store, socket } = setup(null);

    store.messages.set([msg('m1', user('Dana'), 'old', 10)]);

    store.init();
    flushAllEffects();

    const updated = msg('m1', user('Dana'), 'NEW', 10);
    socket.messageUpdated.set(socketEvent<ChatMessage>(updated));

    flushAllEffects();

    expect(store.messages().find((m) => m.id === 'm1')?.content).toBe('NEW');
    expect(socket.messageUpdated().kind).toBe('empty');
  }));
});
