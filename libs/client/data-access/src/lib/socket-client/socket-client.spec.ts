// libs/client/data-access/src/lib/socket-client/socket-client.spec.ts

import { TestBed } from '@angular/core/testing';
import { SocketClientService } from './socket-client';
import { AppConfig, SocketEvents } from '@poalim/constants';
import {
  BotTypingPayload,
  ChatMessage,
  JoinRoomPayload,
  RoomHistoryPayload,
  User,
  emptySocketEvent,
} from '@poalim/shared-interfaces';

// ---- socket.io-client mock ----
type Handler = (...args: any[]) => void;

type FakeSocket = {
  connected: boolean;
  on: jest.Mock<void, [string, Handler]>;
  emit: jest.Mock<void, [string, any]>;
  disconnect: jest.Mock<void, []>;
  removeAllListeners: jest.Mock<void, []>;

  __handlers: Map<string, Handler[]>;
  __trigger: (event: string, payload?: any) => void;
};

const createFakeSocket = (): FakeSocket => {
  const handlers = new Map<string, Handler[]>();

  const socket: FakeSocket = {
    connected: false,
    on: jest.fn((event: string, cb: Handler) => {
      const list = handlers.get(event) ?? [];
      list.push(cb);
      handlers.set(event, list);
    }),
    emit: jest.fn(),
    disconnect: jest.fn(() => {
      socket.connected = false;
      socket.__trigger('disconnect');
    }),
    removeAllListeners: jest.fn(() => {
      handlers.clear();
    }),
    __handlers: handlers,
    __trigger: (event: string, payload?: any) => {
      const list = handlers.get(event) ?? [];
      for (const cb of list) cb(payload);
    },
  };

  return socket;
};

let lastSocket: FakeSocket | null = null;

jest.mock('socket.io-client', () => {
  return {
    io: jest.fn(() => {
      lastSocket = createFakeSocket();
      return lastSocket as any;
    }),
  };
});

describe('SocketClientService', () => {
  let service: SocketClientService;

  const me: User = {
    id: 'u1',
    username: 'Ofir',
    isBot: false,
    color: '#fff',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SocketClientService);

    // Default config for tests (avoid env surprises)
    (AppConfig as any).SOCKET_URL = 'http://localhost:3000';
    (AppConfig as any).ROOM_ID = 'room-1';

    lastSocket = null;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    lastSocket = null;
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('connect() should create socket, set connecting, then on connect set connected and emit JOIN_ROOM', () => {
    service.connect(me, 'room-1');

    expect(service.connectionState()).toBe('connecting');
    expect(lastSocket).toBeTruthy();

    // simulate socket connected
    lastSocket!.connected = true;
    lastSocket!.__trigger('connect');

    expect(service.connectionState()).toBe('connected');
    expect(lastSocket!.emit).toHaveBeenCalledTimes(1);

    const [evt, payload] = lastSocket!.emit.mock.calls[0] as [
      string,
      JoinRoomPayload
    ];
    expect(evt).toBe(SocketEvents.JOIN_ROOM);
    expect(payload.roomId).toBe('room-1');
    expect(payload.user.username).toBe('Ofir');
  });

  it('connect() should no-op if already connected', () => {
    service.connect(me, 'room-1');

    lastSocket!.connected = true;
    lastSocket!.__trigger('connect');

    const prevEmitCalls = lastSocket!.emit.mock.calls.length;

    // call connect again while connected
    service.connect(me, 'room-1');

    // should not create another socket or re-emit JOIN_ROOM
    expect(lastSocket!.emit.mock.calls.length).toBe(prevEmitCalls);
  });

  it('connect() should set disconnected and botTyping=false on disconnect event', () => {
    service.connect(me, 'room-1');

    // simulate bot typing true first
    const typingOn: BotTypingPayload = { roomId: 'room-1', isTyping: true };
    lastSocket!.__trigger(SocketEvents.BOT_TYPING, typingOn);
    expect(service.botTyping()).toBe(true);

    // simulate disconnect
    lastSocket!.__trigger('disconnect');

    expect(service.connectionState()).toBe('disconnected');
    expect(service.botTyping()).toBe(false);
  });

  it('ROOM_HISTORY should set roomHistory SocketEvent(kind=value)', () => {
    service.connect(me, 'room-1');

    const payload: RoomHistoryPayload = {
      roomId: 'room-1',
      messages: [],
    };

    lastSocket!.__trigger(SocketEvents.ROOM_HISTORY, payload);

    const evt = service.roomHistory();
    expect(evt.kind).toBe('value');
    if (evt.kind === 'value') {
      expect(evt.value.roomId).toBe('room-1');
    }
  });

  it('NEW_MESSAGE should set newMessage SocketEvent(kind=value)', () => {
    service.connect(me, 'room-1');

    const msg: ChatMessage = {
      id: 'm1',
      sender: me,
      content: 'hi',
      timestamp: 1,
      type: 'text',
    };

    lastSocket!.__trigger(SocketEvents.NEW_MESSAGE, msg);

    const evt = service.newMessage();
    expect(evt.kind).toBe('value');
    if (evt.kind === 'value') {
      expect(evt.value.id).toBe('m1');
    }
  });

  it('MESSAGE_UPDATED should set messageUpdated SocketEvent(kind=value)', () => {
    service.connect(me, 'room-1');

    const msg: ChatMessage = {
      id: 'm1',
      sender: me,
      content: 'UPDATED',
      timestamp: 2,
      type: 'text',
    };

    lastSocket!.__trigger(SocketEvents.MESSAGE_UPDATED, msg);

    const evt = service.messageUpdated();
    expect(evt.kind).toBe('value');
    if (evt.kind === 'value') {
      expect(evt.value.content).toBe('UPDATED');
    }
  });

  it('BOT_TYPING should update botTyping boolean', () => {
    service.connect(me, 'room-1');

    lastSocket!.__trigger(SocketEvents.BOT_TYPING, {
      roomId: 'room-1',
      isTyping: true,
    } as BotTypingPayload);

    expect(service.botTyping()).toBe(true);

    lastSocket!.__trigger(SocketEvents.BOT_TYPING, {
      roomId: 'room-1',
      isTyping: false,
    } as BotTypingPayload);

    expect(service.botTyping()).toBe(false);
  });

  it('sendMessage() should emit SEND_MESSAGE only when connected', () => {
    service.connect(me, 'room-1');

    const message: ChatMessage = {
      id: 'm1',
      sender: me,
      content: 'hello',
      timestamp: 1,
      type: 'text',
    };

    // not connected yet -> no emit
    service.sendMessage(message, 'room-1');
    expect(lastSocket!.emit).toHaveBeenCalledTimes(0);

    // connected -> emit
    lastSocket!.connected = true;
    service.sendMessage(message, 'room-1');

    expect(lastSocket!.emit).toHaveBeenCalledTimes(1);
    const [evt, payload] = lastSocket!.emit.mock.calls[0] as [string, any];
    expect(evt).toBe(SocketEvents.SEND_MESSAGE);
    expect(payload.roomId).toBe('room-1');
    expect(payload.message.id).toBe('m1');
  });

  it('editMessage() should emit EDIT_MESSAGE only when connected', () => {
    service.connect(me, 'room-1');

    service.editMessage('m1', 'NEW', 'room-1');
    expect(lastSocket!.emit).toHaveBeenCalledTimes(0);

    lastSocket!.connected = true;
    service.editMessage('m1', 'NEW', 'room-1');

    expect(lastSocket!.emit).toHaveBeenCalledTimes(1);
    const [evt, payload] = lastSocket!.emit.mock.calls[0] as [string, any];
    expect(evt).toBe(SocketEvents.EDIT_MESSAGE);
    expect(payload.roomId).toBe('room-1');
    expect(payload.messageId).toBe('m1');
    expect(payload.content).toBe('NEW');
  });

  it('toggleReaction() should emit TOGGLE_REACTION only when connected', () => {
    service.connect(me, 'room-1');

    service.toggleReaction('m1', 'like', 'room-1');
    expect(lastSocket!.emit).toHaveBeenCalledTimes(0);

    lastSocket!.connected = true;
    service.toggleReaction('m1', 'like', 'room-1');

    expect(lastSocket!.emit).toHaveBeenCalledTimes(1);
    const [evt, payload] = lastSocket!.emit.mock.calls[0] as [string, any];
    expect(evt).toBe(SocketEvents.TOGGLE_REACTION);
    expect(payload.roomId).toBe('room-1');
    expect(payload.messageId).toBe('m1');
    expect(payload.reaction).toBe('like');
  });

  it('disconnect() should no-op if connect() was never called', () => {
    // should not throw and should remain disconnected
    service.disconnect();
    expect(service.connectionState()).toBe('disconnected');
  });

  it('disconnect() should remove listeners, disconnect socket, and reset signals', () => {
    service.connect(me, 'room-1');

    // set some state
    lastSocket!.connected = true;
    lastSocket!.__trigger('connect');

    lastSocket!.__trigger(SocketEvents.BOT_TYPING, {
      roomId: 'room-1',
      isTyping: true,
    } as BotTypingPayload);

    lastSocket!.__trigger(SocketEvents.NEW_MESSAGE, {
      id: 'm1',
      sender: me,
      content: 'x',
      timestamp: 1,
      type: 'text',
    } as ChatMessage);

    expect(service.botTyping()).toBe(true);
    expect(service.newMessage().kind).toBe('value');

    service.disconnect();

    expect(lastSocket!.removeAllListeners).toHaveBeenCalledTimes(1);
    expect(lastSocket!.disconnect).toHaveBeenCalledTimes(1);

    expect(service.connectionState()).toBe('disconnected');
    expect(service.botTyping()).toBe(false);

    expect(service.roomHistory()).toEqual(
      emptySocketEvent<RoomHistoryPayload>()
    );
    expect(service.newMessage()).toEqual(emptySocketEvent<ChatMessage>());
    expect(service.messageUpdated()).toEqual(emptySocketEvent<ChatMessage>());
  });

  it('resolveSocketUrl() should trim trailing slash and, on https pages, force https for non-local targets', () => {
    const s = service as any;

    const pageIsHttps =
      typeof window !== 'undefined' && window.location.protocol === 'https:';

    const expectedRemote = pageIsHttps
      ? 'https://example.com'
      : 'http://example.com';

    expect(s.resolveSocketUrl('http://example.com/')).toBe(expectedRemote);
    expect(s.resolveSocketUrl('http://localhost:3000/')).toBe(
      'http://localhost:3000'
    );
    expect(s.resolveSocketUrl('https://example.com/')).toBe(
      'https://example.com'
    );
  });
});
