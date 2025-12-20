// libs/server/socket-handler/src/lib/socket-handler.spec.ts

import type { Server } from 'socket.io';
import { registerSocketHandlers } from './socket-handler';
import { randomUUID } from 'crypto';
import * as fs from 'fs';

jest.useFakeTimers();

jest.mock('crypto', () => ({
  randomUUID: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  renameSync: jest.fn(),
}));

jest.mock('@poalim/constants', () => ({
  AppConfig: {
    ROOM_ID: 'room-1',
    BOT_NAME: 'BOT',
  },
  ChatUi: {
    USER: { DEFAULT_COLOR: '#u' },
    BOT: { ID: 'bot', DEFAULT_COLOR: '#b' },
  },
  REACTION_KEYS: ['like', 'heart', 'laugh', 'wow', 'sad'],
  SERVER_PERSISTENCE_CONFIG: {
    DATA_DIR_NAME: '.poalim-data',
    DB_FILE_NAME: 'chat-db.json',
    FILE_ENCODING: 'utf8',
    TMP_SUFFIX: '.tmp',
    MAX_HISTORY: 200,
  },
  SocketEvents: {
    JOIN_ROOM: 'JOIN_ROOM',
    ROOM_HISTORY: 'ROOM_HISTORY',
    SEND_MESSAGE: 'SEND_MESSAGE',
    NEW_MESSAGE: 'NEW_MESSAGE',
    EDIT_MESSAGE: 'EDIT_MESSAGE',
    MESSAGE_UPDATED: 'MESSAGE_UPDATED',
    BOT_TYPING: 'BOT_TYPING',
    TOGGLE_REACTION: 'TOGGLE_REACTION',
  },
}));

const botEngineMock = {
  hydrateRoom: jest.fn(),
  dumpRoom: jest.fn(() => ({ pending: null, qa: [] })),
  onUserMessage: jest.fn(),
  onMessageEdited: jest.fn(),
};

jest.mock('@poalim/bot-engine', () => ({
  BotEngine: jest.fn(() => botEngineMock),
}));

type Handler = (payload: any) => void;

class FakeSocket {
  private handlers = new Map<string, Handler>();

  emit = jest.fn<void, [string, any]>();
  join = jest.fn<void, [string]>();
  leave = jest.fn<void, [string]>();

  on(event: string, cb: Handler): void {
    this.handlers.set(event, cb);
  }

  trigger(event: string, payload: any): void {
    const cb = this.handlers.get(event);
    if (!cb) throw new Error(`No handler registered for ${event}`);
    cb(payload);
  }
}

type User = { id: string; username: string; isBot: boolean; color: string };

type ChatMessage = {
  id: string;
  sender: User;
  content: string;
  timestamp: number;
  type: 'text' | 'system';
  editedAt?: number;
  edits?: Array<{ previousContent: string; editedAt: number }>;
  reactions?: Partial<
    Record<'like' | 'heart' | 'laugh' | 'wow' | 'sad', string[]>
  >;
};

const makeUser = (overrides?: Partial<User>): User => ({
  id: 'u1',
  username: 'Ofir',
  isBot: false,
  color: '#u',
  ...overrides,
});

const makeMsg = (overrides?: Partial<ChatMessage>): ChatMessage => ({
  id: 'm1',
  sender: makeUser(),
  content: 'hi',
  timestamp: 1,
  type: 'text',
  ...overrides,
});

describe('registerSocketHandlers (socket-handler)', () => {
  let connectCb: ((socket: any) => void) | null = null;

  const roomEmitters = new Map<
    string,
    { emit: jest.Mock<void, [string, any]> }
  >();

  const ioMock: Server = {
    on: jest.fn((event: string, cb: any) => {
      if (event === 'connection') connectCb = cb;
    }),
    to: jest.fn((roomId: string) => {
      const existing = roomEmitters.get(roomId);
      if (existing) return existing as any;

      const next = { emit: jest.fn<void, [string, any]>() };
      roomEmitters.set(roomId, next);
      return next as any;
    }),
  } as unknown as Server;

  beforeEach(() => {
    connectCb = null;
    roomEmitters.clear();
    jest.clearAllMocks();

    jest.spyOn(Date, 'now').mockReturnValue(1000);

    (fs.existsSync as jest.Mock).mockReturnValue(true);

    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({
        rooms: {
          'room-1': {
            messages: [
              makeMsg({
                id: 'persist-1',
                content: 'persisted',
                timestamp: 10,
                sender: makeUser({ id: 'u-old', username: 'Someone' }),
              }),
            ],
            botMemory: { pending: null, qa: [] },
            botReplies: {},
          },
          'room-2': {
            messages: [
              makeMsg({
                id: 'r2-1',
                content: 'hello r2',
                timestamp: 20,
                sender: makeUser({ id: 'u-r2', username: 'R2' }),
              }),
            ],
            botMemory: { pending: null, qa: [] },
            botReplies: {},
          },
        },
      })
    );

    botEngineMock.onUserMessage.mockReset();
    botEngineMock.onMessageEdited.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('JOIN_ROOM should join target room, leave previous room, and emit ROOM_HISTORY', () => {
    registerSocketHandlers(ioMock);

    const socket = new FakeSocket();
    connectCb!(socket as any);

    socket.trigger('JOIN_ROOM', {
      roomId: 'room-2',
      user: makeUser({ id: 'u1', username: 'Ofir' }),
    });

    expect(socket.leave).toHaveBeenCalledWith('room-1');
    expect(socket.join).toHaveBeenCalledWith('room-2');

    expect(socket.emit).toHaveBeenCalledWith(
      'ROOM_HISTORY',
      expect.objectContaining({
        roomId: 'room-2',
        messages: expect.any(Array),
      })
    );

    const payload = socket.emit.mock.calls.find(
      (c) => c[0] === 'ROOM_HISTORY'
    )?.[1];
    expect(payload.messages.map((m: ChatMessage) => m.id)).toEqual(['r2-1']);
  });

  it('SEND_MESSAGE should broadcast NEW_MESSAGE, bot typing, and bot reply (NEW_MESSAGE); and prevent spoofing sender', () => {
    registerSocketHandlers(ioMock);

    const socket = new FakeSocket();
    connectCb!(socket as any);

    socket.trigger('JOIN_ROOM', {
      roomId: 'room-1',
      user: makeUser({ id: 'u1', username: 'Ofir' }),
    });

    const BOT_ID_1: ReturnType<typeof randomUUID> =
      '00000000-0000-0000-0000-000000000001';
    (randomUUID as jest.MockedFunction<typeof randomUUID>).mockReturnValue(
      BOT_ID_1
    );

    botEngineMock.onUserMessage.mockReturnValue({
      typingMs: 5,
      message: { content: 'BOT_REPLY' },
    });

    const userMsgId: ReturnType<typeof randomUUID> =
      '11111111-1111-1111-1111-111111111111';

    socket.trigger('SEND_MESSAGE', {
      roomId: 'room-1',
      message: makeMsg({
        id: userMsgId,
        sender: makeUser({ id: 'spoof', username: 'Spoofed' }),
        content: 'hello',
        timestamp: 123,
      }),
    });

    const roomEmitter = roomEmitters.get('room-1')!;
    expect(roomEmitter.emit).toHaveBeenCalledWith(
      'NEW_MESSAGE',
      expect.objectContaining({
        id: userMsgId,
        content: 'hello',
        timestamp: 123,
        sender: expect.objectContaining({ id: 'u1', username: 'Ofir' }),
      })
    );

    expect(roomEmitter.emit).toHaveBeenCalledWith(
      'BOT_TYPING',
      expect.objectContaining({ roomId: 'room-1', isTyping: true })
    );

    jest.runOnlyPendingTimers();

    expect(roomEmitter.emit).toHaveBeenCalledWith(
      'BOT_TYPING',
      expect.objectContaining({ roomId: 'room-1', isTyping: false })
    );

    expect(roomEmitter.emit).toHaveBeenCalledWith(
      'NEW_MESSAGE',
      expect.objectContaining({
        id: BOT_ID_1,
        sender: expect.objectContaining({
          id: 'bot',
          username: 'BOT',
          isBot: true,
        }),
        type: 'system',
        content: 'BOT_REPLY',
      })
    );

    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(fs.renameSync).toHaveBeenCalled();
  });

  it('EDIT_MESSAGE should broadcast MESSAGE_UPDATED for user msg, and update existing bot reply (MESSAGE_UPDATED)', () => {
    registerSocketHandlers(ioMock);

    const socket = new FakeSocket();
    connectCb!(socket as any);

    socket.trigger('JOIN_ROOM', {
      roomId: 'room-1',
      user: makeUser({ id: 'u1', username: 'Ofir' }),
    });

    const USER_MSG_ID: ReturnType<typeof randomUUID> =
      '22222222-2222-2222-2222-222222222222';

    const BOT_ID_1: ReturnType<typeof randomUUID> =
      '00000000-0000-0000-0000-000000000010';
    (randomUUID as jest.MockedFunction<typeof randomUUID>).mockReturnValue(
      BOT_ID_1
    );

    botEngineMock.onUserMessage.mockReturnValue({
      typingMs: 1,
      message: { content: 'BOT_REPLY' },
    });

    socket.trigger('SEND_MESSAGE', {
      roomId: 'room-1',
      message: makeMsg({
        id: USER_MSG_ID,
        sender: makeUser({ id: 'spoof', username: 'Spoofed' }),
        content: 'hello',
        timestamp: 111,
      }),
    });

    jest.runOnlyPendingTimers();

    const roomEmitter = roomEmitters.get('room-1')!;
    const botNewCall = roomEmitter.emit.mock.calls.find(
      (c) => c[0] === 'NEW_MESSAGE' && c[1]?.sender?.isBot
    );
    expect(botNewCall?.[1]?.id).toBe(BOT_ID_1);

    botEngineMock.onMessageEdited.mockReturnValue({
      typingMs: 1,
      message: { content: 'BOT_REPLY_EDITED' },
    });

    roomEmitter.emit.mockClear();

    socket.trigger('EDIT_MESSAGE', {
      roomId: 'room-1',
      messageId: USER_MSG_ID,
      content: 'hello edited',
    });

    expect(roomEmitter.emit).toHaveBeenCalledWith(
      'MESSAGE_UPDATED',
      expect.objectContaining({
        id: USER_MSG_ID,
        content: 'hello edited',
        editedAt: 1000,
        edits: expect.any(Array),
      })
    );

    expect(roomEmitter.emit).toHaveBeenCalledWith(
      'BOT_TYPING',
      expect.objectContaining({ roomId: 'room-1', isTyping: true })
    );

    jest.runOnlyPendingTimers();

    expect(roomEmitter.emit).toHaveBeenCalledWith(
      'BOT_TYPING',
      expect.objectContaining({ roomId: 'room-1', isTyping: false })
    );

    expect(roomEmitter.emit).toHaveBeenCalledWith(
      'MESSAGE_UPDATED',
      expect.objectContaining({
        id: BOT_ID_1,
        sender: expect.objectContaining({ isBot: true }),
        type: 'system',
        content: 'BOT_REPLY_EDITED',
      })
    );
  });

  it('EDIT_MESSAGE should do nothing if editor is not the original author', () => {
    registerSocketHandlers(ioMock);

    const socket = new FakeSocket();
    connectCb!(socket as any);

    const USER_MSG_ID: ReturnType<typeof randomUUID> =
      '33333333-3333-3333-3333-333333333333';

    botEngineMock.onUserMessage.mockReturnValue(null);

    socket.trigger('JOIN_ROOM', {
      roomId: 'room-1',
      user: makeUser({ id: 'u1', username: 'Ofir' }),
    });

    socket.trigger('SEND_MESSAGE', {
      roomId: 'room-1',
      message: makeMsg({
        id: USER_MSG_ID,
        sender: makeUser({ id: 'spoof', username: 'Spoofed' }),
        content: 'hello',
        timestamp: 111,
      }),
    });

    // switch currentUser
    socket.trigger('JOIN_ROOM', {
      roomId: 'room-1',
      user: makeUser({ id: 'u2', username: 'Other' }),
    });

    const roomEmitter = roomEmitters.get('room-1')!;
    roomEmitter.emit.mockClear();

    socket.trigger('EDIT_MESSAGE', {
      roomId: 'room-1',
      messageId: USER_MSG_ID,
      content: 'hack edit',
    });

    expect(roomEmitter.emit).not.toHaveBeenCalledWith(
      'MESSAGE_UPDATED',
      expect.anything()
    );
  });

  it('TOGGLE_REACTION should update message reactions and emit MESSAGE_UPDATED (toggle on/off)', () => {
    registerSocketHandlers(ioMock);

    const socket = new FakeSocket();
    connectCb!(socket as any);

    const USER_MSG_ID: ReturnType<typeof randomUUID> =
      '44444444-4444-4444-4444-444444444444';

    botEngineMock.onUserMessage.mockReturnValue(null);

    socket.trigger('JOIN_ROOM', {
      roomId: 'room-1',
      user: makeUser({ id: 'u1', username: 'Ofir' }),
    });

    socket.trigger('SEND_MESSAGE', {
      roomId: 'room-1',
      message: makeMsg({
        id: USER_MSG_ID,
        sender: makeUser({ id: 'spoof', username: 'Spoofed' }),
        content: 'hello',
        timestamp: 111,
      }),
    });

    const roomEmitter = roomEmitters.get('room-1')!;
    roomEmitter.emit.mockClear();

    // toggle ON
    socket.trigger('TOGGLE_REACTION', {
      roomId: 'room-1',
      messageId: USER_MSG_ID,
      reaction: 'like',
    });

    const first = roomEmitter.emit.mock.calls.find(
      (c) => c[0] === 'MESSAGE_UPDATED'
    )?.[1];
    expect(first).toEqual(
      expect.objectContaining({
        id: USER_MSG_ID,
        reactions: expect.objectContaining({ like: ['u1'] }),
      })
    );

    roomEmitter.emit.mockClear();

    // toggle OFF
    socket.trigger('TOGGLE_REACTION', {
      roomId: 'room-1',
      messageId: USER_MSG_ID,
      reaction: 'like',
    });

    const second = roomEmitter.emit.mock.calls.find(
      (c) => c[0] === 'MESSAGE_UPDATED'
    )?.[1];
    expect(second?.id).toBe(USER_MSG_ID);
    expect(second?.reactions?.like).toBeUndefined();
  });

  it('TOGGLE_REACTION should ignore invalid reactions', () => {
    registerSocketHandlers(ioMock);

    const socket = new FakeSocket();
    connectCb!(socket as any);

    socket.trigger('JOIN_ROOM', {
      roomId: 'room-1',
      user: makeUser({ id: 'u1', username: 'Ofir' }),
    });

    // No valid reaction => handler should return early => no io.to(...).emit(...)
    (ioMock.to as unknown as jest.Mock).mockClear();

    socket.trigger('TOGGLE_REACTION', {
      roomId: 'room-1',
      messageId: 'm1',
      reaction: 'not-a-reaction',
    });

    expect(ioMock.to).not.toHaveBeenCalled();
  });
});
