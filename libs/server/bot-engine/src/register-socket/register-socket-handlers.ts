import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { SocketEvents } from '@poalim/constants';
import {
  BotTypingPayload,
  JoinRoomPayload,
  RoomHistoryPayload,
  SendMessagePayload,
  ChatMessage,
} from '@poalim/shared-interfaces';
import { BotEngine } from '@poalim/bot-engine';

type RoomId = string;

const DEFAULT_ROOM: RoomId = 'main';
const MAX_HISTORY = 200;

const isValidMessage = (m: unknown): m is ChatMessage => {
  if (!m || typeof m !== 'object') return false;
  const msg = m as ChatMessage;
  return (
    typeof msg.content === 'string' &&
    !!msg.sender &&
    typeof msg.sender === 'object' &&
    typeof (msg.sender as any).id === 'string'
  );
};

export const registerSocketHandlers = (io: Server): void => {
  const bot = new BotEngine();
  const historyByRoom = new Map<RoomId, ChatMessage[]>();

  const getRoomHistory = (roomId: RoomId): ChatMessage[] =>
    historyByRoom.get(roomId) ?? [];

  const pushToHistory = (roomId: RoomId, msg: ChatMessage): void => {
    const next = [...getRoomHistory(roomId), msg].slice(-MAX_HISTORY);
    historyByRoom.set(roomId, next);
  };

  const emitHistoryToSocket = (socket: Socket, roomId: RoomId): void => {
    const payload: RoomHistoryPayload = {
      roomId,
      messages: getRoomHistory(roomId),
    };
    socket.emit(SocketEvents.ROOM_HISTORY, payload);
  };

  io.on('connection', (socket: Socket) => {
    let currentRoom: RoomId = DEFAULT_ROOM;

    socket.on(SocketEvents.JOIN_ROOM, (payload: JoinRoomPayload) => {
      const roomId = payload?.roomId || DEFAULT_ROOM;

      socket.leave(currentRoom);
      socket.join(roomId);
      currentRoom = roomId;

      emitHistoryToSocket(socket, roomId);
    });

    socket.on(SocketEvents.SEND_MESSAGE, (payload: SendMessagePayload) => {
      const roomId = payload?.roomId || currentRoom || DEFAULT_ROOM;
      const incoming = payload?.message;

      if (!isValidMessage(incoming)) return;

      const serverMsg: ChatMessage = {
        ...incoming,
        id: incoming.id || randomUUID(),
        timestamp:
          typeof incoming.timestamp === 'number' ? incoming.timestamp : Date.now(),
      };

      pushToHistory(roomId, serverMsg);
      io.to(roomId).emit(SocketEvents.NEW_MESSAGE, serverMsg);

      const decision = bot.onUserMessage(roomId, serverMsg);
      if (!decision) return;

      const typingOn: BotTypingPayload = { roomId, isTyping: true };
      io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOn);

      setTimeout(() => {
        const typingOff: BotTypingPayload = { roomId, isTyping: false };
        io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOff);

        pushToHistory(roomId, decision.botMessage);
        io.to(roomId).emit(SocketEvents.NEW_MESSAGE, decision.botMessage);
      }, decision.typingMs);
    });
  });
};
