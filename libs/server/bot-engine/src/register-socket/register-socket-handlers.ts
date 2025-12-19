import { randomUUID } from 'crypto';
import { Server, Socket } from 'socket.io';
import { AppConfig, ChatUi, SocketEvents } from '@poalim/constants';
import {
  BotTypingPayload,
  ChatMessage,
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

  const pushToHistory = (roomId: RoomId, msg: ChatMessage): void => {
    const next = [...getRoomHistory(roomId), msg].slice(-MAX_HISTORY);
    historyByRoom.set(roomId, next);
  };

  io.on('connection', (socket: Socket) => {
    let currentRoom: RoomId = DEFAULT_ROOM;

    const emitHistory = (roomId: RoomId): void => {
      const payload: RoomHistoryPayload = {
        roomId,
        messages: getRoomHistory(roomId),
      };
      socket.emit(SocketEvents.ROOM_HISTORY, payload);
    };

    socket.on(SocketEvents.JOIN_ROOM, (payload: JoinRoomPayload) => {
      const roomId = payload?.roomId || DEFAULT_ROOM;

      socket.leave(currentRoom);
      socket.join(roomId);
      currentRoom = roomId;

      emitHistory(roomId);
    });

    socket.on(SocketEvents.SEND_MESSAGE, (payload: SendMessagePayload) => {
      const roomId = payload?.roomId || currentRoom || DEFAULT_ROOM;

      const incoming = payload?.message;
      if (!incoming) return;

      const serverMsg: ChatMessage = {
        ...incoming,
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
  });
};
