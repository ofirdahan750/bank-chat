import { randomUUID } from 'crypto';
import { Server, Socket } from 'socket.io';
import { AppConfig, ChatUi, SocketEvents } from '@poalim/constants';
import {
  BotTypingPayload,
  ChatMessage,
  EditMessagePayload,
  JoinRoomPayload,
  RoomHistoryPayload,
  SendMessagePayload,
  User,
} from '@poalim/shared-interfaces';
import { BotEngine } from '../lib/bot-engine/bot-engine';

type RoomId = string;

const DEFAULT_ROOM: RoomId = 'main';
const MAX_HISTORY = 200;

export const registerSocketHandlers = (io: Server): void => {
  const bot = new BotEngine();

  const botUser: User = {
    id: ChatUi.BOT.ID,
    username: AppConfig.BOT_NAME,
    isBot: true,
    color: ChatUi.BOT.DEFAULT_COLOR,
  };

  const historyByRoom = new Map<RoomId, ChatMessage[]>();

  const getRoomHistory = (roomId: RoomId): ChatMessage[] =>
    historyByRoom.get(roomId) ?? [];

  const setRoomHistory = (roomId: RoomId, messages: ChatMessage[]): void => {
    historyByRoom.set(roomId, messages.slice(-MAX_HISTORY));
  };

  const pushToHistory = (roomId: RoomId, msg: ChatMessage): void => {
    setRoomHistory(roomId, [...getRoomHistory(roomId), msg]);
  };

  const updateMessageInHistory = (
    roomId: RoomId,
    messageId: string,
    nextContent: string,
    editor: User | null
  ): ChatMessage | null => {
    if (!editor || editor.isBot) return null;

    const history = getRoomHistory(roomId);
    const idx = history.findIndex((m: ChatMessage) => m.id === messageId);
    if (idx < 0) return null;

    const target = history[idx];
    if (!target) return null;
    if (target.sender?.isBot) return null;
    if (target.sender?.id !== editor.id) return null;

    const clean = nextContent.trim();
    if (!clean) return null;
    if ((target.content ?? '').trim() === clean) return null;

    const now = Date.now();
    const edits = [...(target.edits ?? [])];
    edits.push({ previousContent: target.content, editedAt: now });

    const updated: ChatMessage = {
      ...target,
      content: clean,
      editedAt: now,
      edits,
    };

    const next = [...history];
    next[idx] = updated;
    setRoomHistory(roomId, next);

    return updated;
  };

  io.on('connection', (socket: Socket) => {
    let currentRoom: RoomId = DEFAULT_ROOM;
    let currentUser: User | null = null;

    const emitHistory = (roomId: RoomId): void => {
      const payload: RoomHistoryPayload = {
        roomId,
        messages: getRoomHistory(roomId),
      };
      socket.emit(SocketEvents.ROOM_HISTORY, payload);
    };

    socket.on(SocketEvents.JOIN_ROOM, (payload: JoinRoomPayload) => {
      const roomId = (payload?.roomId || DEFAULT_ROOM) as RoomId;
      currentUser = payload?.user ?? null;

      if (currentRoom && currentRoom !== roomId) {
        socket.leave(currentRoom);
      }

      socket.join(roomId);
      currentRoom = roomId;

      emitHistory(roomId);
    });

    socket.on(SocketEvents.SEND_MESSAGE, (payload: SendMessagePayload) => {
      const roomId = (payload?.roomId || currentRoom || DEFAULT_ROOM) as RoomId;

      const incoming = payload?.message;
      if (!incoming) return;
      if (!incoming.sender) return;
      if (typeof incoming.content !== 'string') return;

      const sender: User =
        currentUser && !currentUser.isBot ? currentUser : incoming.sender;

      const serverMsg: ChatMessage = {
        ...incoming,
        sender,
        id: incoming.id || randomUUID(),
        timestamp:
          typeof incoming.timestamp === 'number'
            ? incoming.timestamp
            : Date.now(),
      };

      pushToHistory(roomId, serverMsg);
      io.to(roomId).emit(SocketEvents.NEW_MESSAGE, serverMsg);

      const action = bot.onUserMessage(roomId, serverMsg, botUser);
      if (!action) return;

      const typingOn: BotTypingPayload = { roomId, isTyping: true };
      io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOn);

      setTimeout(() => {
        const typingOff: BotTypingPayload = { roomId, isTyping: false };
        io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOff);

        pushToHistory(roomId, action.message);
        io.to(roomId).emit(SocketEvents.NEW_MESSAGE, action.message);
      }, action.typingMs);
    });

    socket.on(SocketEvents.EDIT_MESSAGE, (payload: EditMessagePayload) => {
      const roomId = (payload?.roomId || currentRoom || DEFAULT_ROOM) as RoomId;
      const messageId = payload?.messageId ?? '';
      const content = payload?.content ?? '';

      if (!messageId || typeof messageId !== 'string') return;
      if (typeof content !== 'string') return;

      const updated = updateMessageInHistory(roomId, messageId, content, currentUser);
      if (!updated) return;

      io.to(roomId).emit(SocketEvents.MESSAGE_UPDATED, updated);
    });
  });
};
