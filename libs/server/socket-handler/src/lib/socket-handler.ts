import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { SocketEvents } from '@poalim/constants';
import {
  BotTypingPayload,
  JoinRoomPayload,
  RoomHistoryPayload,
  SendMessagePayload,
  ChatMessage,
  User,
} from '@poalim/shared-interfaces';
import { BotEngine } from '@poalim/bot-engine';

type RoomId = string;

const DEFAULT_ROOM: RoomId = 'main';
const MAX_HISTORY = 200;

const BOT_USER: User = {
  id: 'poalim-bot',
  username: 'Poalim Bot',
  isBot: true,
  color: '#7c3aed',
};

export const registerSocketHandlers = (io: Server): void => {
  const bot = new BotEngine();
  const historyByRoom = new Map<RoomId, ChatMessage[]>();

  const getRoomHistory = (roomId: RoomId): ChatMessage[] => historyByRoom.get(roomId) ?? [];

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

      if (!incoming || !incoming.sender || typeof incoming.content !== 'string') return;

      const serverMsg: ChatMessage = {
        ...incoming,
        id: incoming.id || randomUUID(),
        timestamp: typeof incoming.timestamp === 'number' ? incoming.timestamp : Date.now(),
      };

      pushToHistory(roomId, serverMsg);
      io.to(roomId).emit(SocketEvents.NEW_MESSAGE, serverMsg);

      const decision = bot.onUserMessage(roomId, serverMsg, BOT_USER);
      if (!decision) return;

      const typingOn: BotTypingPayload = { roomId, isTyping: true };
      io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOn);

      setTimeout(() => {
        const typingOff: BotTypingPayload = { roomId, isTyping: false };
        io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOff);

        const botMsg: ChatMessage = {
          ...decision.message,
          id: decision.message.id || randomUUID(),
          timestamp: typeof decision.message.timestamp === 'number' ? decision.message.timestamp : Date.now(),
        };

        pushToHistory(roomId, botMsg);
        io.to(roomId).emit(SocketEvents.NEW_MESSAGE, botMsg);
      }, decision.typingMs);
    });
  });
};
