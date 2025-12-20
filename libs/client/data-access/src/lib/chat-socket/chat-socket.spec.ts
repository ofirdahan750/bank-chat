// libs/client/data-access/src/lib/chat-socket/chat-socket.spec.ts

import { TestBed } from '@angular/core/testing';
import { SocketClientService } from './chat-socket';
import { io } from 'socket.io-client';
import {
  BotTypingPayload,
  ChatMessage,
  RoomHistoryPayload,
  User,
  ReactionKey,
} from '@poalim/shared-interfaces';
import { AppConfig, SocketEvents } from '@poalim/constants';

jest.mock('socket.io-client', () => ({
  io: jest.fn(),
}));

type Handler = (...args: any[]) => void;

class FakeSocket {
  connected: boolean = false;

  private readonly handlers: Record<string, Handler[]> = {};

  readonly on = jest.fn((event: string, cb: Handler) => {
    this.handlers[event] ??= [];
    this.handlers[event]!.push(cb);
    return this;
  });

  readonly emit = jest.fn((_event: string, _payload?: unknown) => undefined);

  readonly disconnect = jest.fn(() => {
    this.connected = false;
    this.trigger('disconnect');
  });

  trigger(event: string, payload?: unknown): void {
    if (event === 'connect') this.connected = true;

    const list = this.handlers[event] ?? [];
    for (const cb of list) cb(payload);
  }
}

const makeUser = (overrides?: Partial<User>): User => ({
  id: 'u1',
  username: 'Ofir',
  isBot: false,
  color: '#fff',
  ...(overrides ?? {}),
});

const makeMsg = (overrides?: Partial<ChatMessage>): ChatMessage => ({
  id: 'm1',
  sender: makeUser(),
  content: 'hi',
  timestamp: 1,
  type: 'text',
  ...(overrides ?? {}),
});

describe('SocketClientService', () => {
  let service: SocketClientService;
  let socket: FakeSocket;

  beforeEach(() => {
    TestBed.configureTestingModule({});

    socket = new FakeSocket();
    (io as unknown as jest.Mock).mockReturnValue(socket);

    service = TestBed.inject(SocketClientService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('connect() should set state to connecting and create socket with websocket transport', () => {
    service.connect(makeUser(), 'room-1');

    expect(service.connectionState()).toBe('connecting');
    expect(io).toHaveBeenCalledTimes(1);

    const args = (io as unknown as jest.Mock).mock.calls[0] as unknown[];
    expect(typeof args[0]).toBe('string');
    expect((args[0] as string).endsWith('/')).toBe(false);

    const opts = args[1] as { transports?: string[] };
    expect(opts.transports).toEqual(['websocket']);
  });

  it('connect() should emit JOIN_ROOM on socket connect', () => {
    const me = makeUser({ id: 'me', username: 'Ofir' });

    service.connect(me, 'room-77');
    socket.emit.mockClear();

    socket.trigger('connect');

    expect(service.connectionState()).toBe('connected');
    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith(SocketEvents.JOIN_ROOM, {
      roomId: 'room-77',
      user: me,
    });
  });

  it('connect() should not reconnect if socket is already connected', () => {
    service.connect(makeUser(), 'room-1');
    socket.trigger('connect');

    (io as unknown as jest.Mock).mockClear();
    service.connect(makeUser(), 'room-1');

    expect(io).not.toHaveBeenCalled();
  });

  it('disconnect socket event should set connectionState to disconnected and botTyping to false', () => {
    service.connect(makeUser(), 'room-1');
    socket.trigger('connect');

    service.botTyping.set(true);
    socket.trigger('disconnect');

    expect(service.connectionState()).toBe('disconnected');
    expect(service.botTyping()).toBe(false);
  });

  it('should consume ROOM_HISTORY / NEW_MESSAGE / MESSAGE_UPDATED / BOT_TYPING events into signals', () => {
    service.connect(makeUser(), 'room-1');

    const history: RoomHistoryPayload = {
      roomId: 'room-1',
      messages: [makeMsg({ id: 'a' })],
    };

    const msg1: ChatMessage = makeMsg({ id: 'm1', content: 'x' });
    const msg2: ChatMessage = makeMsg({ id: 'm2', content: 'y' });

    const typing: BotTypingPayload = { roomId: 'room-1', isTyping: true };

    socket.trigger(SocketEvents.ROOM_HISTORY, history);
    expect(service.roomHistory()).toEqual(history);

    socket.trigger(SocketEvents.NEW_MESSAGE, msg1);
    expect(service.newMessage()).toEqual(msg1);

    socket.trigger(SocketEvents.MESSAGE_UPDATED, msg2);
    expect(service.messageUpdated()).toEqual(msg2);

    socket.trigger(SocketEvents.BOT_TYPING, typing);
    expect(service.botTyping()).toBe(true);
  });

  it('sendMessage() should do nothing if socket is not connected', () => {
    service.sendMessage(makeMsg(), 'room-1');
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('sendMessage() should emit SEND_MESSAGE when connected', () => {
    service.connect(makeUser(), 'room-1');
    socket.trigger('connect');

    socket.emit.mockClear();

    const msg = makeMsg({ id: 'm9' });
    service.sendMessage(msg, 'room-1');

    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith(SocketEvents.SEND_MESSAGE, {
      roomId: 'room-1',
      message: msg,
    });
  });

  it('editMessage() should emit EDIT_MESSAGE when connected', () => {
    service.connect(makeUser(), 'room-1');
    socket.trigger('connect');

    socket.emit.mockClear();

    service.editMessage('m1', 'NEW', 'room-1');

    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith(SocketEvents.EDIT_MESSAGE, {
      roomId: 'room-1',
      messageId: 'm1',
      content: 'NEW',
    });
  });

  it('toggleReaction() should emit TOGGLE_REACTION when connected', () => {
    service.connect(makeUser(), 'room-1');
    socket.trigger('connect');

    socket.emit.mockClear();

    const reaction: ReactionKey = 'like';
    service.toggleReaction('m1', reaction, 'room-1');

    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith(SocketEvents.TOGGLE_REACTION, {
      roomId: 'room-1',
      messageId: 'm1',
      reaction,
    });
  });

  it('disconnect() should disconnect socket, clear it, and reset state', () => {
    service.connect(makeUser(), AppConfig.ROOM_ID);
    socket.trigger('connect');

    service.botTyping.set(true);

    service.disconnect();

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(service.connectionState()).toBe('disconnected');
    expect(service.botTyping()).toBe(false);

    // after disconnect, calls should be ignored
    socket.emit.mockClear();
    service.sendMessage(makeMsg(), AppConfig.ROOM_ID);
    expect(socket.emit).not.toHaveBeenCalled();
  });
});
