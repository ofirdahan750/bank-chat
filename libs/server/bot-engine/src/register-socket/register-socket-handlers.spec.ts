import type { Server } from 'socket.io';
import type {
  ChatMessage,
  EditMessagePayload,
  JoinRoomPayload,
  SendMessagePayload,
  User,
} from '@poalim/shared-interfaces';

import { registerSocketHandlers } from './register-socket-handlers';
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
  SocketEvents: {
    JOIN_ROOM: 'JOIN_ROOM',
    ROOM_HISTORY: 'ROOM_HISTORY',
    SEND_MESSAGE: 'SEND_MESSAGE',
    NEW_MESSAGE: 'NEW_MESSAGE',
    EDIT_MESSAGE: 'EDIT_MESSAGE',
    MESSAGE_UPDATED: 'MESSAGE_UPDATED',
    BOT_TYPING: 'BOT_TYPING',
  },
}));

jest.mock('@poalim/shared-interfaces', () => ({
  emptySocketEvent: () => ({ kind: 'empty' }),
  socketEvent: (value: unknown) => ({ kind: 'value', value }),
  isSocketEventValue: (evt: any) => evt?.kind === 'value',
}));

const botEngineMock = {
  hydrateRoom: jest.fn(),
  dumpRoom: jest.fn(() => ({ pending: null, qa: [] })),
  onUserMessage: jest.fn(),
  onMessageEdited: jest.fn(),
};

jest.mock('../lib/bot-engine/bot-engine', () => ({
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

describe('registerSocketHandlers', () => {
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

    // יציב
    jest.spyOn(Date, 'now').mockReturnValue(1000);

    // DB “על הדיסק”
    (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
      // מספיק לנו “כן יש” כדי ש-loadDb יקרא את הקובץ,
      // וגם ש-ensureDir לא ינסה mkdir (או שכן, לא מפריע)
      if (String(p).includes('chat-db.json')) return true;
      if (String(p).includes('.poalim-data')) return true;
      return false;
    });

    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({
        rooms: {
          'room-1': {
            messages: [
              makeMsg({
                id: 'old-1',
                content: 'persisted',
                timestamp: 10,
                sender: makeUser({ id: 'u-old', username: 'Someone' }),
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

  it('should emit room history on JOIN_ROOM', () => {
    registerSocketHandlers(ioMock);

    expect(connectCb).toBeTruthy();

    const socket = new FakeSocket();
    connectCb!(socket as any);

    const joinPayload: JoinRoomPayload = {
      roomId: 'room-1',
      user: makeUser({ id: 'u1', username: 'Ofir' }),
    };

    socket.trigger('JOIN_ROOM', joinPayload);

    expect(socket.leave).toHaveBeenCalledTimes(1);
    expect(socket.join).toHaveBeenCalledTimes(1);
    expect(socket.join).toHaveBeenCalledWith('room-1');

    expect(socket.emit).toHaveBeenCalledWith(
      'ROOM_HISTORY',
      expect.objectContaining({
        roomId: 'room-1',
        messages: expect.any(Array),
      })
    );

    const historyPayload = socket.emit.mock.calls.find(
      (c) => c[0] === 'ROOM_HISTORY'
    )?.[1];
    expect(historyPayload.messages.map((m: ChatMessage) => m.id)).toEqual([
      'old-1',
    ]);
  });

  it('SEND_MESSAGE should broadcast server message + bot typing + bot reply (NEW_MESSAGE)', () => {
    registerSocketHandlers(ioMock);
    const socket = new FakeSocket();
    connectCb!(socket as any);

    // join -> sets currentUser used by server (anti-spoof)
    socket.trigger('JOIN_ROOM', {
      roomId: 'room-1',
      user: makeUser({ id: 'u1', username: 'Ofir' }),
    } as JoinRoomPayload);

    const UUID_BOT_1: ReturnType<typeof randomUUID> =
      '00000000-0000-0000-0000-000000000001';
    (randomUUID as jest.MockedFunction<typeof randomUUID>).mockReturnValue(
      UUID_BOT_1
    );

    botEngineMock.onUserMessage.mockReturnValue({
      typingMs: 5,
      message: makeMsg({
        id: 'ignored',
        sender: makeUser({ id: 'bot', username: 'BOT', isBot: true }),
        type: 'system',
        content: 'BOT_REPLY',
        timestamp: 1000,
      }),
    });

    const userMsgId: ReturnType<typeof randomUUID> =
      '11111111-1111-1111-1111-111111111111';

    const sendPayload: SendMessagePayload = {
      roomId: 'room-1',
      message: makeMsg({
        id: userMsgId, // נותנים ID כדי שלא ישתמש ב-randomUUID לשרת-מסר
        sender: makeUser({ id: 'spoof', username: 'Spoofed' }),
        content: 'hello',
        timestamp: 123,
      }),
    };

    socket.trigger('SEND_MESSAGE', sendPayload);

    const roomEmitter = roomEmitters.get('room-1');
    expect(roomEmitter).toBeTruthy();

    // immediately: broadcast user message
    expect(roomEmitter!.emit).toHaveBeenCalledWith(
      'NEW_MESSAGE',
      expect.objectContaining({
        id: userMsgId,
        content: 'hello',
        timestamp: 123,
        // anti-spoof: sender comes from currentUser (u1), not payload sender (spoof)
        sender: expect.objectContaining({ id: 'u1', username: 'Ofir' }),
      })
    );

    // typing on immediately
    expect(roomEmitter!.emit).toHaveBeenCalledWith(
      'BOT_TYPING',
      expect.objectContaining({ roomId: 'room-1', isTyping: true })
    );

    // run timers => typing off + bot reply
    jest.runOnlyPendingTimers();

    expect(roomEmitter!.emit).toHaveBeenCalledWith(
      'BOT_TYPING',
      expect.objectContaining({ roomId: 'room-1', isTyping: false })
    );

    expect(roomEmitter!.emit).toHaveBeenCalledWith(
      'NEW_MESSAGE',
      expect.objectContaining({
        id: UUID_BOT_1,
        sender: expect.objectContaining({
          id: 'bot',
          username: 'BOT',
          isBot: true,
        }),
        type: 'system',
        content: 'BOT_REPLY',
      })
    );

    // persisted at least once
    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(fs.renameSync).toHaveBeenCalled();
  });

  it('EDIT_MESSAGE should broadcast MESSAGE_UPDATED for user msg + update existing bot reply (MESSAGE_UPDATED)', () => {
    registerSocketHandlers(ioMock);
    const socket = new FakeSocket();
    connectCb!(socket as any);

    socket.trigger('JOIN_ROOM', {
      roomId: 'room-1',
      user: makeUser({ id: 'u1', username: 'Ofir' }),
    } as JoinRoomPayload);

    const userMsgId: ReturnType<typeof randomUUID> =
      '22222222-2222-2222-2222-222222222222';

    const UUID_BOT_1: ReturnType<typeof randomUUID> =
      '00000000-0000-0000-0000-000000000010';
    (randomUUID as jest.MockedFunction<typeof randomUUID>).mockReturnValue(
      UUID_BOT_1
    );

    botEngineMock.onUserMessage.mockReturnValue({
      typingMs: 1,
      message: makeMsg({
        id: 'ignored',
        sender: makeUser({ id: 'bot', username: 'BOT', isBot: true }),
        type: 'system',
        content: 'BOT_REPLY',
      }),
    });

    // first send => creates bot reply mapped to userMsgId
    socket.trigger('SEND_MESSAGE', {
      roomId: 'room-1',
      message: makeMsg({
        id: userMsgId,
        sender: makeUser({ id: 'spoof', username: 'Spoofed' }),
        content: 'hello',
        timestamp: 111,
      }),
    } as SendMessagePayload);

    jest.runOnlyPendingTimers();

    const roomEmitter = roomEmitters.get('room-1')!;
    const botNewMsgCall = roomEmitter.emit.mock.calls.find(
      (c) => c[0] === 'NEW_MESSAGE' && c[1]?.sender?.isBot
    );
    expect(botNewMsgCall).toBeTruthy();
    expect(botNewMsgCall![1].id).toBe(UUID_BOT_1);

    // now edit => should update the user message + bot message (same id) via upsertBotReply update path
    botEngineMock.onMessageEdited.mockReturnValue({
      typingMs: 1,
      message: makeMsg({
        id: 'ignored',
        sender: makeUser({ id: 'bot', username: 'BOT', isBot: true }),
        type: 'system',
        content: 'BOT_REPLY_EDITED',
      }),
    });

    const editPayload: EditMessagePayload = {
      roomId: 'room-1',
      messageId: userMsgId,
      content: 'hello edited',
    };

    socket.trigger('EDIT_MESSAGE', editPayload);

    // user updated broadcast immediately
    expect(roomEmitter.emit).toHaveBeenCalledWith(
      'MESSAGE_UPDATED',
      expect.objectContaining({
        id: userMsgId,
        content: 'hello edited',
        edits: expect.any(Array),
        editedAt: 1000,
      })
    );

    jest.runOnlyPendingTimers();

    // bot updated broadcast (same bot message id, not NEW_MESSAGE)
    expect(roomEmitter.emit).toHaveBeenCalledWith(
      'MESSAGE_UPDATED',
      expect.objectContaining({
        id: UUID_BOT_1,
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

    // join as u1
    socket.trigger('JOIN_ROOM', {
      roomId: 'room-1',
      user: makeUser({ id: 'u1', username: 'Ofir' }),
    } as JoinRoomPayload);

    const userMsgId: ReturnType<typeof randomUUID> =
      '33333333-3333-3333-3333-333333333333';

    (randomUUID as jest.MockedFunction<typeof randomUUID>).mockReturnValue(
      '00000000-0000-0000-0000-000000000020'
    );

    botEngineMock.onUserMessage.mockReturnValue({
      typingMs: 0,
      message: makeMsg({
        id: 'ignored',
        sender: makeUser({ id: 'bot', username: 'BOT', isBot: true }),
        type: 'system',
        content: 'BOT_REPLY',
      }),
    });

    // send as u1 (server will set sender=u1)
    socket.trigger('SEND_MESSAGE', {
      roomId: 'room-1',
      message: makeMsg({
        id: userMsgId,
        sender: makeUser({ id: 'spoof', username: 'Spoofed' }),
        content: 'hello',
        timestamp: 111,
      }),
    } as SendMessagePayload);

    jest.runOnlyPendingTimers();

    // now "switch" user by joining again as different user u2
    socket.trigger('JOIN_ROOM', {
      roomId: 'room-1',
      user: makeUser({ id: 'u2', username: 'Other' }),
    } as JoinRoomPayload);

    const roomEmitter = roomEmitters.get('room-1')!;
    roomEmitter.emit.mockClear();

    // attempt edit by u2 => should not emit MESSAGE_UPDATED at all
    socket.trigger('EDIT_MESSAGE', {
      roomId: 'room-1',
      messageId: userMsgId,
      content: 'hack edit',
    } as EditMessagePayload);

    expect(roomEmitter.emit).not.toHaveBeenCalledWith(
      'MESSAGE_UPDATED',
      expect.anything()
    );
  });
});
